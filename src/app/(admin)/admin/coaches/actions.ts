"use server";

import { getAdminSession } from "@/lib/admin/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { createOnboardingLink, createDashboardLink } from "@/lib/club/stripe-connect";
import { COACH_CANONICAL_ORIGIN } from "@/lib/club/host";

/** Mints a Stripe onboarding link for a coach who is stuck.
 *
 * The coach's own action requires their session, so there was no way to see
 * the form a stalled coach is looking at, or to hand them a working link
 * without asking them to find the button themselves.
 *
 * Admin-gated on every call rather than trusting the page that rendered the
 * button: a server action is a public endpoint, and this one reaches into
 * another person's payout setup.
 *
 * A caution the UI repeats: whatever bank account is entered through this
 * link receives THAT COACH's payouts. It is for looking at the form and for
 * sending on — never for completing on someone's behalf.
 */
export async function adminOnboardingLink(
  coachProfileId: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Not authorized." };

  const admin = createServiceClient();
  const { data } = await admin
    .from("coach_profiles")
    .select("stripe_account_id")
    .eq("id", coachProfileId)
    .maybeSingle();

  const accountId = (data as { stripe_account_id: string | null } | null)?.stripe_account_id;
  if (!accountId) {
    // Deliberately does NOT create one. An account made from the admin side
    // would carry our details rather than the coach's, and the coach's own
    // "connect" button already creates it correctly.
    return { ok: false, error: "This coach has not started Stripe onboarding yet — nothing to link to." };
  }

  try {
    const url = await createOnboardingLink(
      accountId,
      `${COACH_CANONICAL_ORIGIN}/payouts/return`,
      `${COACH_CANONICAL_ORIGIN}/payouts/refresh`
    );
    return { ok: true, url };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't reach Stripe." };
  }
}

/** A link into the coach's Express dashboard, where their bank details and
 * payouts live. Useful once they ARE onboarded and something looks wrong. */
export async function adminDashboardLink(
  coachProfileId: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Not authorized." };

  const admin = createServiceClient();
  const { data } = await admin
    .from("coach_profiles")
    .select("stripe_account_id")
    .eq("id", coachProfileId)
    .maybeSingle();

  const accountId = (data as { stripe_account_id: string | null } | null)?.stripe_account_id;
  if (!accountId) return { ok: false, error: "No Stripe account for this coach." };

  try {
    return { ok: true, url: await createDashboardLink(accountId) };
  } catch (err) {
    // Express dashboard links only work once the account is far enough along;
    // before that Stripe refuses, which is worth showing rather than hiding.
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't reach Stripe." };
  }
}
