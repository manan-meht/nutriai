import type { SupabaseClient } from "@supabase/supabase-js";

import { GUIDANCE_ENABLED, isBillingWhitelisted } from "@/lib/billing/feature-flags";

import { NUTRITION_POLICY_VERSION } from "./policy";

// Two independent gates stand between this code and a real person being
// offered a calorie target, and they exist for different reasons.
//
// The feature flag is an engineering switch: is the feature finished and
// turned on here?
//
// The policy review status is a clinical one: has a human with the
// standing to do so looked at the target-setting policy and agreed it may
// be applied to the public? That question is not answerable by anyone
// shipping code, which is why it lives in a database row
// (nutrition_policy_versions.status) that deploying cannot change, rather
// than in an env var that a deploy could flip by accident.
//
// Keeping them separate means the flag being on never implies a review
// happened, and a review happening never switches the feature on.
//
// The one exception, decided by the product owner on 2026-11-11: accounts
// on the billing test whitelist (BILLING_TEST_WHITELIST_EMAILS, the internal
// and invited test accounts) may use Guidance in production before the
// review, as a labelled beta. Everyone else stays blocked until the policy
// row says 'reviewed'. The policy row itself is untouched: the whitelist
// grants a preview, never a review, so isPreviewOnly stays true and every
// screen says so.

export type PolicyStatus = "unreviewed" | "reviewed" | "retired";

export type ReleaseBlocker =
  /** The feature is off in this environment. */
  | "feature_disabled"
  /** The policy row is missing — the migration has not been applied. */
  | "policy_version_missing"
  /** Engineering-complete but not clinically approved. The expected state
   * at the time of writing. */
  | "policy_unreviewed"
  /** Superseded by a newer policy and no longer offered. */
  | "policy_retired";

export interface ReleaseState {
  /** May this environment offer activation to an ordinary user? */
  canActivate: boolean;
  /** Everything standing in the way, for the staging banner and the
   * delivery report — not shown to end users. */
  blockers: ReleaseBlocker[];
  /** True when activation is only possible because this is not
   * production. Any screen reached this way must say so, so that an
   * unreviewed policy is never mistaken for an approved one. */
  isPreviewOnly: boolean;
  policyVersion: string;
  policyStatus: PolicyStatus | null;
}

/** Non-production environments may run the full flow against an unreviewed
 * policy, which the brief explicitly asks for — otherwise the feature
 * could never be tested end to end before the review it is waiting on. */
function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_TISTRA_ENV !== "staging";
}

/**
 * Decides whether activation may be offered, from the flag and the policy
 * row's status.
 *
 * Pure, so the matrix of flag × status × environment can be tested
 * directly; `loadReleaseState` does the lookup.
 */
export function evaluateReleaseState(params: {
  featureEnabled: boolean;
  policyStatus: PolicyStatus | null;
  isProduction: boolean;
  /** The account that owns the tracked person (caregiver or coach) is on the
   * preview whitelist. Only matters in production with an unreviewed
   * policy. */
  ownerIsPreviewAccount?: boolean;
}): ReleaseState {
  const blockers: ReleaseBlocker[] = [];

  if (!params.featureEnabled) blockers.push("feature_disabled");
  if (params.policyStatus == null) blockers.push("policy_version_missing");
  else if (params.policyStatus === "unreviewed") blockers.push("policy_unreviewed");
  else if (params.policyStatus === "retired") blockers.push("policy_retired");

  // A missing or retired policy blocks everywhere. An unreviewed one
  // blocks production only: that is the single concession to being able to
  // test the feature, and it is why isPreviewOnly exists to label it.
  const blocksEverywhere = blockers.some((b) => b !== "policy_unreviewed");
  const canActivate =
    !blocksEverywhere && (params.policyStatus === "reviewed" || !params.isProduction || params.ownerIsPreviewAccount === true);

  return {
    canActivate,
    blockers,
    isPreviewOnly: canActivate && params.policyStatus !== "reviewed",
    policyVersion: NUTRITION_POLICY_VERSION,
    policyStatus: params.policyStatus,
  };
}

/** Whether an account may use Guidance before the clinical review: the
 * billing test whitelist, compared the same way billing compares it (case
 * and the "+nutriai-" product tag ignored). */
export function isGuidancePreviewAccount(email: string | null | undefined): boolean {
  return isBillingWhitelisted(email);
}

/**
 * The release state for one tracked person, given the account that owns
 * them (adults_contacts.caregiver_id or gym_clients.trainer_id). Without an
 * owner, the answer for nobody in particular: production stays closed
 * until the review.
 */
export async function loadReleaseState(db: SupabaseClient, ownerProfileId?: string | null): Promise<ReleaseState> {
  const { data } = await db
    .from("nutrition_policy_versions")
    .select("status")
    .eq("version", NUTRITION_POLICY_VERSION)
    .maybeSingle();

  const raw = data?.status;
  const policyStatus: PolicyStatus | null =
    raw === "unreviewed" || raw === "reviewed" || raw === "retired" ? raw : null;

  const isProduction = isProductionEnvironment();
  // The owner's email is only worth a query when it can change the answer.
  let ownerIsPreviewAccount = false;
  if (GUIDANCE_ENABLED && isProduction && policyStatus === "unreviewed" && ownerProfileId) {
    const { data: owner } = await db.from("profiles").select("email").eq("id", ownerProfileId).maybeSingle();
    ownerIsPreviewAccount = isGuidancePreviewAccount((owner as { email?: string } | null)?.email);
  }

  return evaluateReleaseState({
    featureEnabled: GUIDANCE_ENABLED,
    policyStatus,
    isProduction,
    ownerIsPreviewAccount,
  });
}
