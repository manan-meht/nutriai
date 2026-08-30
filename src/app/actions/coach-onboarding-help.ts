"use server";

import { sendOnboardingHelpRequest } from "@/lib/coach/onboarding-help-email";

/** Raises a setup-help request for a coach who just signed up.
 *
 * A server action rather than an API route: it is called from AuthForm
 * straight after a successful signup, and there is nothing here worth a
 * route handler's ceremony.
 *
 * Deliberately unauthenticated, because at this point the coach has an
 * account but no session — signup ends on "check your email". That makes
 * this a public endpoint, so it is written to be uninteresting to abuse:
 * it takes no free text, sends to a fixed internal recipient, and the only
 * caller-supplied value that reaches the message is an email address that
 * is validated in shape first. The worst it can do is put a plausible
 * address in our inbox.
 *
 * Always resolves. A failed notification must never surface as a signup
 * error — the request is also recorded in the coach's user metadata and
 * shows on /admin/coaches as "wants setup help", so a lost email is
 * recoverable and a scary red banner is not.
 */
export async function requestCoachOnboardingHelp(input: {
  email: string;
  market: string;
  source?: string;
}): Promise<void> {
  const email = String(input.email ?? "").trim().toLowerCase();
  // Shape check only. Real validation already happened — Supabase accepted
  // this address at signup — and anything stricter here would reject valid
  // addresses for no gain.
  if (!email || email.length > 254 || !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) return;

  const market = input.market === "in" ? "in" : "sg";
  const source = typeof input.source === "string" ? input.source.slice(0, 64) : undefined;

  const result = await sendOnboardingHelpRequest({ email, market, source, requestedAt: new Date() });
  if (!result.ok) {
    // Logged, not thrown: see the note above on why the coach must not see
    // this fail.
    console.error("[coach-onboarding-help] request not delivered for a coach signup.");
  }
}
