import { createServiceClient } from "./supabase";

// Read-only mirror of the main app's src/lib/entitlements/entitlements.ts —
// intentionally duplicated rather than imported, since this app is a
// separately deployed Cloudflare Pages project (see supabase.ts's top
// comment) with no build-time access to the main app's source tree.
// Keep this in sync manually if trial/entitlement logic changes there.
// Only getEntitlementSnapshot is needed here (read-only dashboard data) —
// none of the trial-start/webhook/checkout-intent functions apply to a
// read-only mobile client.

export type EntitlementStatus =
  | "not_started"
  | "trialing"
  | "active"
  | "past_due"
  | "cancel_at_period_end"
  | "expired"
  | "cancelled";

export interface EntitlementSnapshot {
  status: EntitlementStatus;
  trialStartAt: string | null;
  trialEndAt: string | null;
  trialDaysRemaining: number | null;
  isReadOnly: boolean;
}

interface EntitlementRow {
  status: EntitlementStatus;
  trial_start_at: string | null;
  trial_end_at: string | null;
  current_period_end: string | null;
}

function computeEffectiveStatus(row: EntitlementRow, at: Date): EntitlementStatus {
  if (row.status === "trialing" && row.trial_end_at && at.getTime() > new Date(row.trial_end_at).getTime()) {
    return "expired";
  }
  if (row.status === "active" && row.current_period_end && at.getTime() > new Date(row.current_period_end).getTime()) {
    return "expired";
  }
  return row.status;
}

export async function getEntitlementSnapshot(
  workspaceId: string,
  module: "adults" | "gym"
): Promise<EntitlementSnapshot> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("entitlements")
    .select("status, trial_start_at, trial_end_at, current_period_end")
    .eq("workspace_id", workspaceId)
    .eq("module", module)
    .maybeSingle();

  if (!data) {
    return { status: "not_started", trialStartAt: null, trialEndAt: null, trialDaysRemaining: null, isReadOnly: false };
  }

  const at = new Date();
  const status = computeEffectiveStatus(data, at);
  const trialDaysRemaining = data.trial_end_at
    ? Math.max(0, Math.ceil((new Date(data.trial_end_at).getTime() - at.getTime()) / (24 * 60 * 60 * 1000)))
    : null;

  // Beta: billing isn't available yet, so nothing is ever read-only here —
  // mirrors BILLING_AVAILABLE=false in the main app's feature-flags.ts.
  // Update this alongside that flag once billing launches.
  return {
    status,
    trialStartAt: data.trial_start_at,
    trialEndAt: data.trial_end_at,
    trialDaysRemaining,
    isReadOnly: false,
  };
}
