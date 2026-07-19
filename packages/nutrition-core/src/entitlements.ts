import type { SupabaseClient } from "@supabase/supabase-js";

export type EntitlementModule = "adults" | "gym";

export type EntitlementStatus =
  | "not_started"
  | "trialing"
  | "active"
  | "past_due"
  | "cancel_at_period_end"
  | "expired"
  | "cancelled"
  // Apple/Google Play billing-retry state (via RevenueCat) — the store is
  // still retrying a failed payment and the subscriber keeps access in the
  // meantime. Same "still active despite a payment problem" semantics as
  // past_due; kept as its own value (rather than reusing past_due) so
  // in-app copy can name the store-billing-retry concept accurately.
  | "grace_period";

interface EntitlementRow {
  status: EntitlementStatus;
  trial_start_at: string | null;
  trial_end_at: string | null;
  current_period_end: string | null;
}

/** Status + trial/period bookkeeping, before either app's own read-only
 * enforcement rules are applied — see getEntitlementSnapshot below. */
export interface EntitlementCore {
  status: EntitlementStatus;
  trialStartAt: string | null;
  trialEndAt: string | null;
  /** Whole days remaining in an active trial, 0 if expired, null if no trial. */
  trialDaysRemaining: number | null;
}

/** Trial/period expiry is time-dependent, so both callers pass in their own
 * `now` — the main app routes this through a controllable clock (see
 * src/lib/time/clock.ts) so expiry is deterministic in tests; the mobile
 * API has no equivalent need yet and can pass `new Date()`. */
export function computeEffectiveStatus(row: EntitlementRow, at: Date): EntitlementStatus {
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
 * against the given `at`. Deliberately does NOT decide `isReadOnly` — that
 * depends on billing feature flags that only exist in the main app (see
 * src/lib/billing/feature-flags.ts there); each caller applies its own
 * enforcement rule on top of this. `admin` is a service-role client — this
 * package never constructs its own. */
export async function getEntitlementSnapshot(
  admin: SupabaseClient,
  workspaceId: string,
  module: EntitlementModule,
  at: Date
): Promise<EntitlementCore> {
  const { data } = await admin
    .from("entitlements")
    .select("status, trial_start_at, trial_end_at, current_period_end")
    .eq("workspace_id", workspaceId)
    .eq("module", module)
    .maybeSingle();

  if (!data) {
    return { status: "not_started", trialStartAt: null, trialEndAt: null, trialDaysRemaining: null };
  }

  const status = computeEffectiveStatus(data, at);
  const trialDaysRemaining = data.trial_end_at
    ? Math.max(0, Math.ceil((new Date(data.trial_end_at).getTime() - at.getTime()) / (24 * 60 * 60 * 1000)))
    : null;

  return {
    status,
    trialStartAt: data.trial_start_at,
    trialEndAt: data.trial_end_at,
    trialDaysRemaining,
  };
}
