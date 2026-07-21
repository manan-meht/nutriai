// Feature flags gating billing functionality. All default to conservative
// (off/enforcement-off) values so this can be reviewed and tested in
// dev/staging without affecting production users until explicitly enabled
// there. See the completion report for what still needs Stripe
// Dashboard / Razorpay approval work before flipping these on in production.

// Takes the raw env value itself (not a name to look up) — every call site
// below passes a static `process.env.NEXT_PUBLIC_X` literal rather than a
// dynamic `process.env[name]` lookup. This matters because Next.js can only
// inline NEXT_PUBLIC_* values into client-side bundles when it can see a
// static property-access expression at compile time; a computed/bracket
// lookup can't be inlined, so it silently evaluates to undefined (and every
// flag falls back to its default) in any "use client" component. Bug found
// via FOOD_BALANCE_SCORE_ENABLED being the first of these flags used in a
// client component — its card correctly appeared server-side (confirmed via
// a direct curl to the API route) but never client-side until this fix.
function flag(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined) return defaultValue;
  return raw === "true";
}

/** Master switch for enforcing subscription/trial-expiry read-only
 * behavior across both modules. When off, entitlement checks are computed
 * and displayed but never block actions — useful for a safe first deploy
 * of this feature. Family/Coaching can additionally be enforced
 * independently via the two flags below. */
export const SUBSCRIPTION_ENFORCEMENT_ENABLED = flag(process.env.NEXT_PUBLIC_SUBSCRIPTION_ENFORCEMENT_ENABLED, true);

/** Per-module trial-expiry enforcement, gated behind the master switch
 * above — lets Family and Coaching enforcement be rolled out on separate
 * timelines if needed. */
export const FAMILY_TRIAL_ENFORCEMENT_ENABLED = flag(process.env.NEXT_PUBLIC_FAMILY_TRIAL_ENFORCEMENT_ENABLED, true);
export const GYM_TRIAL_ENFORCEMENT_ENABLED = flag(process.env.NEXT_PUBLIC_GYM_TRIAL_ENFORCEMENT_ENABLED, true);

/** App-layer pre-check + "Add" button visibility for the 2/5 account
 * limits. This does NOT disable the authoritative DB triggers from
 * migrations 0002-0004 — those always enforce the hard limit regardless of
 * this flag, by design (a client-side toggle must never be able to widen a
 * server-authoritative constraint). Turning this off only stops the app
 * from pre-emptively hiding the Add button / showing the friendly
 * pre-check error — the DB would still reject the insert if hit directly. */
export const FAMILY_LIMIT_ENFORCEMENT_ENABLED = flag(process.env.NEXT_PUBLIC_FAMILY_LIMIT_ENFORCEMENT_ENABLED, true);
export const GYM_LIMIT_ENFORCEMENT_ENABLED = flag(process.env.NEXT_PUBLIC_GYM_LIMIT_ENFORCEMENT_ENABLED, true);

/** Whether real billing (checkout, subscriptions, trial-expiry enforcement)
 * is available to end users at all. Off during Beta: no one is ever
 * read-only regardless of trial/entitlement status, and the dashboard shows
 * the Beta banner instead of Subscribe/Upgrade CTAs. Independent of
 * STRIPE_CHECKOUT_ENABLED below, which gates the underlying provider
 * integration rather than whether billing is user-facing yet. */
export const BILLING_AVAILABLE = flag(process.env.NEXT_PUBLIC_BILLING_AVAILABLE, false);

/** Comma-separated emails (case-insensitive) exempt from all billing
 * enforcement — never read-only on trial/subscription expiry, and never
 * hit the "add a card before your first contact" gate. Server-only (not
 * NEXT_PUBLIC_*) since this is an internal test-account allowlist, not
 * something that should ever be visible in a client bundle. Not a dynamic
 * env lookup issue here since this reads process.env.BILLING_TEST_WHITELIST_EMAILS
 * directly, once, at module scope — see the flag() comment above for why
 * that distinction matters for NEXT_PUBLIC_* vars specifically (this isn't one). */
export function isBillingWhitelisted(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.BILLING_TEST_WHITELIST_EMAILS;
  if (!raw) return false;
  const normalized = email.trim().toLowerCase();
  return raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean).includes(normalized);
}

export const STRIPE_CHECKOUT_ENABLED = flag(process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED, true);

/** International (non-launch-country) USD billing via Stripe. Off would
 * mean INTL-market users see a "not available in your region yet" message
 * at checkout instead of USD pricing. */
export const INTL_USD_BILLING_ENABLED = flag(process.env.NEXT_PUBLIC_INTL_USD_BILLING_ENABLED, true);

/** India: Razorpay is feature-flagged off by default until merchant +
 * recurring-payment approvals are confirmed complete (see spec §14). */
export const RAZORPAY_CHECKOUT_ENABLED = flag(process.env.NEXT_PUBLIC_RAZORPAY_ENABLED, false);

/** Singapore: PayNow is a one-time-annual-prepaid option only, never a
 * recurring monthly method, and stays behind a flag until explicitly
 * enabled (see spec §13). */
export const PAYNOW_ENABLED = flag(process.env.NEXT_PUBLIC_PAYNOW_ENABLED, false);

/** US: ACH bank debit — off until the Stripe merchant account + subscription
 * setup are confirmed eligible for it (see spec §13). */
export const ACH_ENABLED = flag(process.env.NEXT_PUBLIC_ACH_ENABLED, false);

/** Australia: BECS Direct Debit — same caveat as ACH. */
export const BECS_ENABLED = flag(process.env.NEXT_PUBLIC_BECS_ENABLED, false);

/** Optional end-user (the family member / gym client themself, not the
 * caregiver/coach) dashboard — WhatsApp-OTP-verified, no email/password
 * signup. Off by default so it can be reviewed on a feature branch before
 * any production rollout; when off, /my-progress routes and the WhatsApp
 * "View my progress" CTA are both fully disabled. */
export const END_USER_DASHBOARD_ENABLED = flag(process.env.NEXT_PUBLIC_END_USER_DASHBOARD_ENABLED, false);

/** Self-tracking (a signed-up user tracks their own meals, relationship_type
 * "self", via the /me onboarding flow). Off by default so it can be
 * reviewed before the /me signup path is live for real users. */
export const SELF_TRACKING_ENABLED = flag(process.env.NEXT_PUBLIC_SELF_TRACKING_ENABLED, false);

/** Parent/older-adult self-access to their own dashboard via WhatsApp OTP
 * — an extension of the End User Dashboard feature above, reusing the same
 * OTP/session infrastructure with parent-specific framing (email option,
 * trusted-devices settings, 90-day session). Off by default. */
export const PARENT_DASHBOARD_ACCESS_ENABLED = flag(process.env.NEXT_PUBLIC_PARENT_DASHBOARD_ACCESS_ENABLED, false);

/** Food Balance Score card on the adults/end-user dashboards (see
 * @nutriai/health-scoring for the scoring engine). Off by default — this
 * infra only supports a global on/off toggle, not per-user/percentage
 * rollout (documented as a follow-up in the feature's implementation
 * report); flip on for internal/staging review before wider rollout. */
export const FOOD_BALANCE_SCORE_ENABLED = flag(process.env.NEXT_PUBLIC_FOOD_BALANCE_SCORE_V1, false);

/** How long a parent's trusted-device session lasts after WhatsApp OTP
 * verification before re-verification is required. Configurable per spec
 * (default 90 days) — distinct from the shorter 60-day default used by the
 * general End User Dashboard session in src/lib/end-user/session.ts. */
export function parentTrustedSessionDays(): number {
  const raw = process.env.PARENT_TRUSTED_SESSION_DAYS;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 90;
}

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
