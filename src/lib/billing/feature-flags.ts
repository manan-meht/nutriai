// Feature flags gating billing functionality. All default to conservative
// (off/enforcement-off) values so this can be reviewed and tested in
// dev/staging without affecting production users until explicitly enabled
// there. See the completion report for what still needs Stripe
// Dashboard / Razorpay approval work before flipping these on in production.

function flag(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  return raw === "true";
}

/** Master switch for enforcing subscription/trial-expiry read-only
 * behavior across both modules. When off, entitlement checks are computed
 * and displayed but never block actions — useful for a safe first deploy
 * of this feature. Family/Coaching can additionally be enforced
 * independently via the two flags below. */
export const SUBSCRIPTION_ENFORCEMENT_ENABLED = flag("NEXT_PUBLIC_SUBSCRIPTION_ENFORCEMENT_ENABLED", true);

/** Per-module trial-expiry enforcement, gated behind the master switch
 * above — lets Family and Coaching enforcement be rolled out on separate
 * timelines if needed. */
export const FAMILY_TRIAL_ENFORCEMENT_ENABLED = flag("NEXT_PUBLIC_FAMILY_TRIAL_ENFORCEMENT_ENABLED", true);
export const GYM_TRIAL_ENFORCEMENT_ENABLED = flag("NEXT_PUBLIC_GYM_TRIAL_ENFORCEMENT_ENABLED", true);

/** App-layer pre-check + "Add" button visibility for the 2/5 account
 * limits. This does NOT disable the authoritative DB triggers from
 * migrations 0002-0004 — those always enforce the hard limit regardless of
 * this flag, by design (a client-side toggle must never be able to widen a
 * server-authoritative constraint). Turning this off only stops the app
 * from pre-emptively hiding the Add button / showing the friendly
 * pre-check error — the DB would still reject the insert if hit directly. */
export const FAMILY_LIMIT_ENFORCEMENT_ENABLED = flag("NEXT_PUBLIC_FAMILY_LIMIT_ENFORCEMENT_ENABLED", true);
export const GYM_LIMIT_ENFORCEMENT_ENABLED = flag("NEXT_PUBLIC_GYM_LIMIT_ENFORCEMENT_ENABLED", true);

export const STRIPE_CHECKOUT_ENABLED = flag("NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED", true);

/** International (non-launch-country) USD billing via Stripe. Off would
 * mean INTL-market users see a "not available in your region yet" message
 * at checkout instead of USD pricing. */
export const INTL_USD_BILLING_ENABLED = flag("NEXT_PUBLIC_INTL_USD_BILLING_ENABLED", true);

/** India: Razorpay is feature-flagged off by default until merchant +
 * recurring-payment approvals are confirmed complete (see spec §14). */
export const RAZORPAY_CHECKOUT_ENABLED = flag("NEXT_PUBLIC_RAZORPAY_ENABLED", false);

/** Singapore: PayNow is a one-time-annual-prepaid option only, never a
 * recurring monthly method, and stays behind a flag until explicitly
 * enabled (see spec §13). */
export const PAYNOW_ENABLED = flag("NEXT_PUBLIC_PAYNOW_ENABLED", false);

/** US: ACH bank debit — off until the Stripe merchant account + subscription
 * setup are confirmed eligible for it (see spec §13). */
export const ACH_ENABLED = flag("NEXT_PUBLIC_ACH_ENABLED", false);

/** Australia: BECS Direct Debit — same caveat as ACH. */
export const BECS_ENABLED = flag("NEXT_PUBLIC_BECS_ENABLED", false);

/** Optional end-user (the family member / gym client themself, not the
 * caregiver/coach) dashboard — WhatsApp-OTP-verified, no email/password
 * signup. Off by default so it can be reviewed on a feature branch before
 * any production rollout; when off, /my-progress routes and the WhatsApp
 * "View my progress" CTA are both fully disabled. */
export const END_USER_DASHBOARD_ENABLED = flag("NEXT_PUBLIC_END_USER_DASHBOARD_ENABLED", false);

/** Configurable activation date for the account-limit/trial-enforcement
 * migration story (see spec §19) — existing users get a fresh trial dated
 * from this instant, not from whenever the migration script happens to run. */
export function featureActivationDate(): Date {
  const raw = process.env.FEATURE_ACTIVATION_DATE;
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}
