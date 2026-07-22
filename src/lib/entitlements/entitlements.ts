import { createServiceClient } from "@/lib/supabase/server";
import { now } from "@/lib/time/clock";
import {
  BILLING_AVAILABLE,
  SUBSCRIPTION_ENFORCEMENT_ENABLED,
  FAMILY_TRIAL_ENFORCEMENT_ENABLED,
  GYM_TRIAL_ENFORCEMENT_ENABLED,
  featureActivationDate,
  isBillingWhitelisted,
} from "@/lib/billing/feature-flags";
import type { BillingMarket, BillingInterval } from "@/lib/billing/pricing";
import type { PaymentProviderName, ProviderSubscriptionSnapshot } from "@/lib/billing/provider";
import { getEntitlementSnapshot as getEntitlementSnapshotCore } from "@nutriai/nutrition-core";
import type { EntitlementModule, EntitlementStatus } from "@nutriai/nutrition-core";

export type { EntitlementModule, EntitlementStatus };

export const TRIAL_LENGTH_DAYS = 14;
export const TRIAL_LENGTH_MS = TRIAL_LENGTH_DAYS * 24 * 60 * 60 * 1000;

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
 * Starts a 14-day trial for (workspaceId, module) if one hasn't started yet.
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

/** Reads the current entitlement state for (workspaceId, module), computed
 * against the controllable clock so expiry is deterministic in tests. The
 * status/trial-days math itself lives in @nutriai/nutrition-core, shared
 * with the mobile API — only the isReadOnly enforcement rule below (which
 * depends on this app's billing feature flags) is app-specific. */
export async function getEntitlementSnapshot(
  workspaceId: string,
  module: EntitlementModule,
  /** Owner's email, checked against BILLING_TEST_WHITELIST_EMAILS — pass
   * this whenever the caller has it (page.tsx server components do, from
   * the authenticated user) so internal test accounts never go read-only
   * regardless of trial/subscription status. Omit only where the caller
   * genuinely doesn't have an email (whitelisting simply won't apply). */
  ownerEmail?: string | null
): Promise<EntitlementSnapshot> {
  const admin = createServiceClient();
  const core = await getEntitlementSnapshotCore(admin, workspaceId, module, now());

  const perModuleEnforcementEnabled = module === "adults" ? FAMILY_TRIAL_ENFORCEMENT_ENABLED : GYM_TRIAL_ENFORCEMENT_ENABLED;

  return {
    ...core,
    // During Beta (BILLING_AVAILABLE off), billing is not available at all,
    // so no workspace is ever read-only regardless of trial/entitlement
    // status — status is still computed and displayed for banners/countdowns,
    // it just never blocks actions. Once billing launches, the master switch
    // and per-module enforcement flags below take over as before. Whitelisted
    // test accounts are exempt the same way, regardless of BILLING_AVAILABLE.
    isReadOnly:
      !isBillingWhitelisted(ownerEmail) &&
      BILLING_AVAILABLE &&
      SUBSCRIPTION_ENFORCEMENT_ENABLED &&
      perModuleEnforcementEnabled &&
      (core.status === "expired" || core.status === "cancelled"),
  };
}

/**
 * The provider customer id already on file for this (workspace, module), if
 * any — must be looked up and passed to provider.createOrRetrieveCustomer()
 * on every checkout attempt. Without this, a second "Add first contact"
 * click (e.g. after an earlier attempt was abandoned partway through
 * Stripe Checkout) creates a brand-new provider customer every time
 * instead of reusing the one already on file, silently orphaning any
 * subscription created under the previous customer — the entitlements row
 * gets overwritten to point at the new, subscription-less customer, and
 * nothing can ever find the real subscription again. */
export async function getExistingProviderCustomerId(
  workspaceId: string,
  module: EntitlementModule
): Promise<string | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("entitlements")
    .select("provider_customer_id")
    .eq("workspace_id", workspaceId)
    .eq("module", module)
    .maybeSingle();
  return data?.provider_customer_id ?? null;
}

/**
 * Whether this workspace must add a card (via checkout) before starting its
 * first trial, rather than the legacy card-free startTrialIfNeeded path.
 * "not_started" alone is a reliable "never added a first contact/client yet"
 * signal — every successful addContact/addClient call triggers
 * startTrialIfNeeded, so a workspace can't have any contacts without
 * already being past "not_started". Gated behind BILLING_AVAILABLE (never
 * fires during Beta) and workspaceCreatedAt so existing workspaces that
 * were created before this flow shipped are grandfathered onto the
 * card-free trial they were promised, not retroactively blocked.
 * Whitelisted test accounts (see isBillingWhitelisted) are also exempt. */
export function requiresCardBeforeFirstTrial(params: {
  workspaceCreatedAt: string;
  entitlementStatus: EntitlementStatus;
  ownerEmail?: string | null;
}): boolean {
  return (
    !isBillingWhitelisted(params.ownerEmail) &&
    BILLING_AVAILABLE &&
    params.entitlementStatus === "not_started" &&
    new Date(params.workspaceCreatedAt) >= featureActivationDate()
  );
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
 * Resolves an entitlement row by owner — used by the RevenueCat webhook
 * (see src/lib/billing/revenuecat.ts), which identifies a subscriber by
 * `app_user_id`, configured client-side (mobile app) to always be the
 * Supabase auth user id. That's exactly `entitlements.owner_id`, so unlike
 * Stripe/Razorpay this needs no provider_subscription_id/provider_customer_id
 * resolution step — the identity is already known at purchase time.
 */
export async function findEntitlementByOwner(
  ownerId: string,
  module: EntitlementModule
): Promise<{ workspaceId: string; module: EntitlementModule } | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("entitlements")
    .select("workspace_id, module")
    .eq("owner_id", ownerId)
    .eq("module", module)
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
  // Only set when the provider actually reported a trial window (Stripe,
  // via subscription_data.trial_end passed at checkout) — this is the one
  // path (besides the legacy card-free startTrialIfNeeded) that populates
  // trial_start_at/trial_end_at, for the "card collected before first
  // trial" checkout flow where no prior entitlement row had trial dates.
  // Conditional, not unconditional, so a later non-trial event (e.g. an
  // "active" renewal after the trial converted) doesn't null out the
  // historical trial window.
  if (snapshot.trialStart) update.trial_start_at = snapshot.trialStart;
  if (snapshot.trialEnd) update.trial_end_at = snapshot.trialEnd;

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
