import { getEntitlementSnapshot as getEntitlementSnapshotCore } from "@nutriai/nutrition-core";
import type { EntitlementModule, EntitlementStatus } from "@nutriai/nutrition-core";
import { createServiceClient } from "./supabase";

export interface EntitlementSnapshot {
  status: EntitlementStatus;
  trialStartAt: string | null;
  trialEndAt: string | null;
  trialDaysRemaining: number | null;
  isReadOnly: boolean;
}

/** Wraps the shared trial/status computation (packages/nutrition-core) with
 * this app's own enforcement rule. Only getEntitlementSnapshot is needed
 * here (read-only dashboard data) — none of the trial-start/webhook/
 * checkout-intent functions apply to a read-only mobile client, so those
 * stay exclusively in the main app's src/lib/entitlements/entitlements.ts. */
export async function getEntitlementSnapshot(
  workspaceId: string,
  module: EntitlementModule
): Promise<EntitlementSnapshot> {
  const admin = createServiceClient();
  const core = await getEntitlementSnapshotCore(admin, workspaceId, module, new Date());

  return {
    ...core,
    // Beta: billing isn't available yet, so nothing is ever read-only here —
    // mirrors BILLING_AVAILABLE=false in the main app's feature-flags.ts.
    // Update this alongside that flag once billing launches.
    isReadOnly: false,
  };
}
