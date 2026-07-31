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
  /** True for BILLING_TEST_WHITELIST_EMAILS accounts — lets the client
   * show an explicit "this is a whitelisted test account" message instead
   * of either a payment prompt or (worse) just silently showing nothing
   * and leaving someone wondering why they were never asked to pay. */
  isBillingWhitelisted: boolean;
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

/** Comma-separated emails (case-insensitive) exempt from all billing
 * enforcement on mobile — mirrors the main web app's isBillingWhitelisted
 * (src/lib/billing/feature-flags.ts) exactly, including the env var name,
 * so a single BILLING_TEST_WHITELIST_EMAILS value can be set the same way
 * on both Cloudflare Pages projects rather than needing two separate lists
 * kept in sync. This app is deployed independently of the main web app, so
 * the env var still has to be configured here too — setting it only on the
 * main project does not exempt anyone on mobile. */
function isBillingWhitelisted(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.BILLING_TEST_WHITELIST_EMAILS;
  if (!raw) return false;
  // Email/password signup for the "adults" product scopes the stored auth
  // email with "+nutriai-adults" (see scopedEmail/displayEmail in the main
  // app's src/lib/auth.ts) so the same real address can have separate
  // adults/gym accounts — comparing against the raw scoped email silently
  // missed every such account unless someone remembered to whitelist the
  // exact scoped variant too (discovered via a real account this happened
  // to). Stripping the scope tag before comparing makes the whitelist
  // match on the person's real email regardless of which product they
  // signed up for or how.
  const normalized = email.trim().toLowerCase().replace(/\+nutriai-[^@]+(?=@)/, "");
  return raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean).includes(normalized);
}

export async function getEntitlementSnapshot(
  workspaceId: string,
  module: EntitlementModule,
  /** Owner's email, checked against BILLING_TEST_WHITELIST_EMAILS — pass
   * this whenever the caller has it (every route here does, from the
   * authenticated bearer-token user) so internal/whitelisted test accounts
   * never go read-only or hit the pre-first-contact paywall on mobile. */
  ownerEmail?: string | null
): Promise<EntitlementSnapshot> {
  const admin = createServiceClient();
  const core = await getEntitlementSnapshotCore(admin, workspaceId, module, new Date());
  const whitelisted = isBillingWhitelisted(ownerEmail);

  return {
    ...core,
    isReadOnly:
      !whitelisted &&
      MOBILE_SUBSCRIPTION_ENFORCEMENT_ENABLED &&
      module === "adults" &&
      (core.status === "expired" || core.status === "cancelled"),
    requiresCardBeforeTrial:
      !whitelisted &&
      MOBILE_SUBSCRIPTION_ENFORCEMENT_ENABLED &&
      module === "adults" &&
      core.status === "not_started",
    isBillingWhitelisted: whitelisted,
  };
}
