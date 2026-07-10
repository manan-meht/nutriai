import { createServiceClient } from "@/lib/supabase/server";
import { now } from "@/lib/time/clock";
import {
  BILLING_AVAILABLE,
  SUBSCRIPTION_ENFORCEMENT_ENABLED,
  FAMILY_TRIAL_ENFORCEMENT_ENABLED,
  GYM_TRIAL_ENFORCEMENT_ENABLED,
} from "@/lib/billing/feature-flags";
import type { BillingMarket, BillingInterval } from "@/lib/billing/pricing";
import type { PaymentProviderName, ProviderSubscriptionSnapshot } from "@/lib/billing/provider";

export type EntitlementModule = "adults" | "gym";

export type EntitlementStatus =
  | "not_started"
  | "trialing"
  | "active"
  | "past_due"
  | "cancel_at_period_end"
  | "expired"
  | "cancelled";

const TRIAL_LENGTH_DAYS = 30;
const TRIAL_LENGTH_MS = TRIAL_LENGTH_DAYS * 24 * 60 * 60 * 1000;

interface EntitlementRow {
  status: EntitlementStatus;
  trial_start_at: string | null;
  trial_end_at: string | null;
  current_period_end: string | null;
}

export interface EntitlementSnapshot {
  /** Effective status accounting for trial expiry — may differ from the raw
   * stored status if a trial has lapsed since it was last written. */
  status: EntitlementStatus;
  trialStartAt: string | null;
  trialEndAt: string | null;
  /** Whole days remaining in an active trial, 0 if expired, null if no trial. */
  trialDaysRemaining: number | null;
  /** True once a trial (or a cancelled/past-due paid period) has lapsed with
   * no active access — the module should be read-only. */
  isReadOnly: boolean;
}

/**
 * Starts a 30-day trial for (workspaceId, module) if one hasn't started yet.
 * Idempotent and concurrency-safe: relies on the (workspace_id, module)
 * unique constraint from migration 0001 via an upsert with
 * ignoreDuplicates — the first caller wins, every subsequent call for the
 * same workspace/module is a no-op. Safe to call unconditionally on every
 * successful "add first member"/"add first client" action rather than
 * trying to detect "was this really the first one" up front.
 */
export async function startTrialIfNeeded(
  workspaceId: string,
  ownerId: string,
  module: EntitlementModule
): Promise<void> {
  const admin = createServiceClient();
  const startedAt = now();
  const endsAt = new Date(startedAt.getTime() + TRIAL_LENGTH_MS);

  const { error } = await admin
    .from("entitlements")
    .upsert(
      {
        workspace_id: workspaceId,
        owner_id: ownerId,
        module,
        status: "trialing",
        trial_start_at: startedAt.toISOString(),
        trial_end_at: endsAt.toISOString(),
      },
      { onConflict: "workspace_id,module", ignoreDuplicates: true }
    );

  if (error) throw new Error(`Failed to start trial: ${error.message}`);
}

function computeEffectiveStatus(row: EntitlementRow, at: Date): EntitlementStatus {
  if (row.status === "trialing" && row.trial_end_at && at.getTime() > new Date(row.trial_end_at).getTime()) {
    return "expired";
  }
  if (row.status === "active" && row.current_period_end && at.getTime() > new Date(row.current_period_end).getTime()) {
    // Paid period lapsed with no renewal recorded — treat as expired rather
    // than silently continuing access.
    return "expired";
  }
  return row.status;
}

/** Reads the current entitlement state for (workspaceId, module), computed
 * against the controllable clock so expiry is deterministic in tests. */
export async function getEntitlementSnapshot(
  workspaceId: string,
  module: EntitlementModule
): Promise<EntitlementSnapshot> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("entitlements")
    .select("status, trial_start_at, trial_end_at, current_period_end")
    .eq("workspace_id", workspaceId)
    .eq("module", module)
    .maybeSingle();

  if (!data) {
    return {
      status: "not_started",
      trialStartAt: null,
      trialEndAt: null,
      trialDaysRemaining: null,
      isReadOnly: false,
    };
  }

  const at = now();
  const status = computeEffectiveStatus(data, at);
  const trialDaysRemaining = data.trial_end_at
    ? Math.max(0, Math.ceil((new Date(data.trial_end_at).getTime() - at.getTime()) / (24 * 60 * 60 * 1000)))
    : null;

  const perModuleEnforcementEnabled = module === "adults" ? FAMILY_TRIAL_ENFORCEMENT_ENABLED : GYM_TRIAL_ENFORCEMENT_ENABLED;

  return {
    status,
    trialStartAt: data.trial_start_at,
    trialEndAt: data.trial_end_at,
    trialDaysRemaining,
    // During Beta (BILLING_AVAILABLE off), billing is not available at all,
    // so no workspace is ever read-only regardless of trial/entitlement
    // status — status is still computed and displayed for banners/countdowns,
    // it just never blocks actions. Once billing launches, the master switch
    // and per-module enforcement flags below take over as before.
    isReadOnly:
      BILLING_AVAILABLE &&
      SUBSCRIPTION_ENFORCEMENT_ENABLED &&
      perModuleEnforcementEnabled &&
      (status === "expired" || status === "cancelled"),
  };
}

/**
 * Called right after creating a provider checkout session — records which
 * provider/market/currency/interval the owner is checking out with, and the
 * provider customer ID, but does NOT change entitlement status. Status is
 * only ever updated by a verified webhook (see applyProviderSubscriptionSnapshot)
 * — a successful browser redirect back from checkout must never by itself
 * activate paid access.
 */
export async function recordCheckoutIntent(params: {
  workspaceId: string;
  ownerId: string;
  module: EntitlementModule;
  provider: PaymentProviderName;
  providerCustomerId: string;
  market: BillingMarket;
  currency: string;
  interval: BillingInterval;
}): Promise<void> {
  const admin = createServiceClient();
  const { error } = await admin
    .from("entitlements")
    .upsert(
      {
        workspace_id: params.workspaceId,
        owner_id: params.ownerId,
        module: params.module,
        payment_provider: params.provider,
        provider_customer_id: params.providerCustomerId,
        billing_market: params.market,
        currency: params.currency,
        billing_interval: params.interval,
        status: "not_started",
      },
      { onConflict: "workspace_id,module", ignoreDuplicates: false }
    );
  if (error) {
    // If the row already exists (trial in progress), only patch the
    // provider/market/currency/interval fields — never overwrite status.
    const { error: updateError } = await admin
      .from("entitlements")
      .update({
        payment_provider: params.provider,
        provider_customer_id: params.providerCustomerId,
        billing_market: params.market,
        currency: params.currency,
        billing_interval: params.interval,
      })
      .eq("workspace_id", params.workspaceId)
      .eq("module", params.module);
    if (updateError) throw new Error(`Failed to record checkout intent: ${updateError.message}`);
  }
}

export async function findEntitlementByProviderSubscriptionId(
  provider: PaymentProviderName,
  providerSubscriptionId: string
): Promise<{ workspaceId: string; module: EntitlementModule } | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("entitlements")
    .select("workspace_id, module")
    .eq("payment_provider", provider)
    .eq("provider_subscription_id", providerSubscriptionId)
    .maybeSingle();
  if (!data) return null;
  return { workspaceId: data.workspace_id, module: data.module };
}

export async function findEntitlementByProviderCustomerId(
  provider: PaymentProviderName,
  providerCustomerId: string
): Promise<{ workspaceId: string; module: EntitlementModule } | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("entitlements")
    .select("workspace_id, module")
    .eq("payment_provider", provider)
    .eq("provider_customer_id", providerCustomerId)
    .maybeSingle();
  if (!data) return null;
  return { workspaceId: data.workspace_id, module: data.module };
}

/**
 * Applies a verified provider subscription snapshot (from a webhook) to the
 * entitlement row. This is the ONLY path that activates/updates paid
 * status — never a browser redirect. Idempotent: applying the same
 * snapshot twice (e.g. a retried webhook) results in the same row state.
 */
export async function applyProviderSubscriptionSnapshot(params: {
  workspaceId: string;
  module: EntitlementModule;
  provider: PaymentProviderName;
  providerPriceId?: string | null;
  snapshot: ProviderSubscriptionSnapshot;
}): Promise<void> {
  const admin = createServiceClient();
  const { snapshot } = params;

  const update: Record<string, unknown> = {
    status: snapshot.status,
    payment_provider: params.provider,
    provider_subscription_id: snapshot.providerSubscriptionId,
    provider_customer_id: snapshot.providerCustomerId,
    current_period_start: snapshot.currentPeriodStart,
    current_period_end: snapshot.currentPeriodEnd,
    cancel_at_period_end: snapshot.cancelAtPeriodEnd,
    cancelled_at: snapshot.cancelledAt,
  };
  if (params.providerPriceId) update.provider_price_id = params.providerPriceId;

  if (snapshot.status === "active") {
    const { data: existing } = await admin
      .from("entitlements")
      .select("subscription_start_at")
      .eq("workspace_id", params.workspaceId)
      .eq("module", params.module)
      .maybeSingle();
    if (!existing?.subscription_start_at) {
      update.subscription_start_at = snapshot.currentPeriodStart ?? now().toISOString();
    }
  }

  const { error } = await admin
    .from("entitlements")
    .update(update)
    .eq("workspace_id", params.workspaceId)
    .eq("module", params.module);

  if (error) throw new Error(`Failed to apply subscription snapshot: ${error.message}`);
}
