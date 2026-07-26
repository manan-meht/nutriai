import { getEntitlementSnapshot as getEntitlementSnapshotCore } from "@nutriai/nutrition-core";
import type { EntitlementModule, EntitlementStatus } from "@nutriai/nutrition-core";
import { createServiceClient } from "./supabase";

export interface EntitlementSnapshot {
  status: EntitlementStatus;
  trialStartAt: string | null;
  trialEndAt: string | null;
  trialDaysRemaining: number | null;
  isReadOnly: boolean;
  /** True for a brand-new workspace ("not_started" — no purchase has ever
   * happened) that must go through Play/App Store checkout before it can
   * do anything, rather than getting free access until a trial that never
   * actually started later "expires". Mirrors the main web app's
   * requiresCardBeforeTrial (src/app/(adults)/adults/dashboard/page.tsx) —
   * Play/App Store subscription trial offers work the same way Stripe's
   * card-first trial does: the user approves payment now, isn't charged
   * until the trial period actually ends, and RevenueCat's webhook reports
   * period_type: TRIAL (mapped to status "trialing") the moment they do. */
  requiresCardBeforeTrial: boolean;
}

/** Wraps the shared trial/status computation (packages/nutrition-core) with
 * this app's own enforcement rule. Only getEntitlementSnapshot is needed
 * here (read-only dashboard data) — the RevenueCat webhook that actually
 * writes entitlement status lives exclusively in the main app's
 * src/app/api/webhooks/revenuecat/route.ts (service-role Supabase access,
 * same table both apps read); this stays a pure read.
 *
 * Public launch (see git history — RevenueCat billing rollout):
 * Self/Family ("adults") on mobile is billed via RevenueCat (Apple/Google
 * Play), so this now enforces read-only the same way the web app's
 * getEntitlementSnapshot does — expired/cancelled blocks access,
 * grace_period does NOT (the store is still retrying payment and the
 * subscriber keeps access in the meantime). Coach/Gym ("gym") stays
 * unenforced — that product remains web/manual billing only for now.
 *
 * Gated behind MOBILE_SUBSCRIPTION_ENFORCEMENT_ENABLED so shipping this
 * code doesn't itself start blocking anyone — flip it on only once the
 * RevenueCat project + Play/App Store products have been verified working
 * end to end (see this repo's RevenueCat setup notes), the same
 * "code deployed" vs. "feature turned on" split the main app's
 * BILLING_AVAILABLE flag already uses. */
const MOBILE_SUBSCRIPTION_ENFORCEMENT_ENABLED = process.env.MOBILE_SUBSCRIPTION_ENFORCEMENT_ENABLED === "true";

export async function getEntitlementSnapshot(
  workspaceId: string,
  module: EntitlementModule
): Promise<EntitlementSnapshot> {
  const admin = createServiceClient();
  const core = await getEntitlementSnapshotCore(admin, workspaceId, module, new Date());

  return {
    ...core,
    isReadOnly:
      MOBILE_SUBSCRIPTION_ENFORCEMENT_ENABLED &&
      module === "adults" &&
      (core.status === "expired" || core.status === "cancelled"),
    requiresCardBeforeTrial:
      MOBILE_SUBSCRIPTION_ENFORCEMENT_ENABLED && module === "adults" && core.status === "not_started",
  };
}
