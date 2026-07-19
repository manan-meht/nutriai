// Test-account allowlist for the RevenueCat/Play/App Store billing rollout
// — reserved for internal testers who need free/unmetered access without
// going through a real store purchase (e.g. QA on a build not configured
// with sandbox store credentials). Deliberately NOT wired into any
// enforcement logic yet (see getEntitlementSnapshot's isReadOnly rule in
// src/lib/entitlements/entitlements.ts) — this is just the list to grow;
// wiring it in (e.g. an isReadOnly bypass keyed on the signed-in user's
// email) is a follow-up once we decide exactly where that check should
// live (mobile-api entitlement read, or app-side).
export const BILLING_TEST_ACCOUNT_EMAILS: readonly string[] = [
  // Add tester emails here, e.g. "tester@tistrahealth.com"
];
