describe("feature flags — defaults and env overrides", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUBSCRIPTION_ENFORCEMENT_ENABLED;
    delete process.env.NEXT_PUBLIC_FAMILY_TRIAL_ENFORCEMENT_ENABLED;
    delete process.env.NEXT_PUBLIC_GYM_TRIAL_ENFORCEMENT_ENABLED;
    delete process.env.NEXT_PUBLIC_FAMILY_LIMIT_ENFORCEMENT_ENABLED;
    delete process.env.NEXT_PUBLIC_GYM_LIMIT_ENFORCEMENT_ENABLED;
    delete process.env.NEXT_PUBLIC_RAZORPAY_ENABLED;
    delete process.env.NEXT_PUBLIC_PAYNOW_ENABLED;
    delete process.env.NEXT_PUBLIC_ACH_ENABLED;
    delete process.env.NEXT_PUBLIC_BECS_ENABLED;
    delete process.env.FEATURE_ACTIVATION_DATE;
    jest.resetModules();
  });

  it("defaults enforcement flags to on (safe to enable trial/limit behavior)", async () => {
    jest.resetModules();
    const flags = await import("@/lib/billing/feature-flags");
    expect(flags.SUBSCRIPTION_ENFORCEMENT_ENABLED).toBe(true);
    expect(flags.FAMILY_TRIAL_ENFORCEMENT_ENABLED).toBe(true);
    expect(flags.GYM_TRIAL_ENFORCEMENT_ENABLED).toBe(true);
    expect(flags.FAMILY_LIMIT_ENFORCEMENT_ENABLED).toBe(true);
    expect(flags.GYM_LIMIT_ENFORCEMENT_ENABLED).toBe(true);
  });

  it("defaults unapproved payment methods to off (Razorpay, PayNow, ACH, BECS)", async () => {
    jest.resetModules();
    const flags = await import("@/lib/billing/feature-flags");
    expect(flags.RAZORPAY_CHECKOUT_ENABLED).toBe(false);
    expect(flags.PAYNOW_ENABLED).toBe(false);
    expect(flags.ACH_ENABLED).toBe(false);
    expect(flags.BECS_ENABLED).toBe(false);
  });

  it("respects an explicit env override", async () => {
    process.env.NEXT_PUBLIC_GYM_TRIAL_ENFORCEMENT_ENABLED = "false";
    jest.resetModules();
    const flags = await import("@/lib/billing/feature-flags");
    expect(flags.GYM_TRIAL_ENFORCEMENT_ENABLED).toBe(false);
    // Family enforcement is independent of gym's flag.
    expect(flags.FAMILY_TRIAL_ENFORCEMENT_ENABLED).toBe(true);
  });

  it("featureActivationDate falls back to now() when unset, and parses a valid override", async () => {
    jest.resetModules();
    const { featureActivationDate } = await import("@/lib/billing/feature-flags");
    const before = Date.now();
    const fallback = featureActivationDate().getTime();
    expect(fallback).toBeGreaterThanOrEqual(before);

    process.env.FEATURE_ACTIVATION_DATE = "2026-08-01T00:00:00.000Z";
    jest.resetModules();
    const { featureActivationDate: featureActivationDate2 } = await import("@/lib/billing/feature-flags");
    expect(featureActivationDate2().toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });
});

describe("getEntitlementSnapshot — per-module trial enforcement flags", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_GYM_TRIAL_ENFORCEMENT_ENABLED;
    delete process.env.NEXT_PUBLIC_FAMILY_TRIAL_ENFORCEMENT_ENABLED;
    delete process.env.NEXT_PUBLIC_BILLING_AVAILABLE;
    jest.resetModules();
  });

  function makeFakeServiceClient(row: any) {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: row }),
            }),
          }),
        }),
      }),
    };
  }

  const expiredTrialRow = {
    status: "trialing",
    trial_start_at: "2026-01-01T00:00:00.000Z",
    trial_end_at: "2026-01-31T00:00:00.000Z",
    current_period_end: null,
  };

  it("gym stays read-only-blocking when only gym enforcement is disabled but family is not affected", async () => {
    // Read-only enforcement only applies once billing is available (post-Beta).
    process.env.NEXT_PUBLIC_BILLING_AVAILABLE = "true";
    process.env.NEXT_PUBLIC_GYM_TRIAL_ENFORCEMENT_ENABLED = "false";
    jest.resetModules();
    jest.doMock("@/lib/supabase/server", () => ({ createServiceClient: () => makeFakeServiceClient(expiredTrialRow) }));
    const { getEntitlementSnapshot } = await import("@/lib/entitlements/entitlements");

    const gymSnapshot = await getEntitlementSnapshot("ws-1", "gym");
    expect(gymSnapshot.status).toBe("expired");
    expect(gymSnapshot.isReadOnly).toBe(false); // enforcement off for gym

    const familySnapshot = await getEntitlementSnapshot("ws-1", "adults");
    expect(familySnapshot.status).toBe("expired");
    expect(familySnapshot.isReadOnly).toBe(true); // family enforcement still on
  });
});

describe("isBillingWhitelisted", () => {
  afterEach(() => {
    delete process.env.BILLING_TEST_WHITELIST_EMAILS;
    jest.resetModules();
  });

  it("matches a plain whitelisted email case-insensitively", async () => {
    process.env.BILLING_TEST_WHITELIST_EMAILS = "test@example.com,Other@Example.com";
    jest.resetModules();
    const { isBillingWhitelisted } = await import("@/lib/billing/feature-flags");
    expect(isBillingWhitelisted("TEST@example.com")).toBe(true);
    expect(isBillingWhitelisted("other@example.com")).toBe(true);
    expect(isBillingWhitelisted("nope@example.com")).toBe(false);
  });

  it("matches a whitelisted email even when the account was created with the +nutriai-adults product scope tag", async () => {
    // Email/password signup for the "adults" product appends
    // "+nutriai-adults" to the stored auth email (see scopedEmail in
    // src/lib/auth.ts) — a whitelist entered as the person's plain email
    // must still match their actual (scoped) stored account email.
    process.env.BILLING_TEST_WHITELIST_EMAILS = "test@example.com";
    jest.resetModules();
    const { isBillingWhitelisted } = await import("@/lib/billing/feature-flags");
    expect(isBillingWhitelisted("test+nutriai-adults@example.com")).toBe(true);
  });

  it("returns false for no email or an empty whitelist", async () => {
    jest.resetModules();
    const { isBillingWhitelisted } = await import("@/lib/billing/feature-flags");
    expect(isBillingWhitelisted(null)).toBe(false);
    expect(isBillingWhitelisted(undefined)).toBe(false);
    expect(isBillingWhitelisted("test@example.com")).toBe(false);
  });
});

// The whitelist used to be applied only when a caller passed ownerEmail as
// getEntitlementSnapshot's third argument. Four call sites never did — the
// WhatsApp handler among them — so isBillingWhitelisted(undefined) returned
// false and whitelisted users were enforced anyway. A real user was cut off
// mid-conversation 90 seconds after their trial lapsed. The owner's email is
// now resolved from entitlements.owner_id when the caller doesn't supply it.
describe("getEntitlementSnapshot — whitelist applies without an explicit ownerEmail", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_BILLING_AVAILABLE;
    delete process.env.BILLING_TEST_WHITELIST_EMAILS;
    jest.resetModules();
  });

  const expiredTrialRow = {
    status: "trialing",
    trial_start_at: "2026-01-01T00:00:00.000Z",
    trial_end_at: "2026-01-31T00:00:00.000Z",
    current_period_end: null,
    owner_id: "owner-1",
  };

  /** Fake supporting both the two-eq entitlements query and the one-eq
   * profiles lookup, by making every eq() also terminal. */
  function makeFakeServiceClient(row: any, profileEmail: string | null, onProfileQuery?: () => void) {
    return {
      from: (table: string) => {
        if (table === "profiles") onProfileQuery?.();
        const result = table === "profiles" ? { email: profileEmail } : row;
        const node: any = {
          maybeSingle: async () => ({ data: result }),
          eq: () => node,
          select: () => node,
        };
        return node;
      },
    };
  }

  it("exempts a whitelisted owner even though the caller passed no email", async () => {
    process.env.NEXT_PUBLIC_BILLING_AVAILABLE = "true";
    process.env.BILLING_TEST_WHITELIST_EMAILS = "vip@example.com";
    jest.resetModules();
    jest.doMock("@/lib/supabase/server", () => ({
      createServiceClient: () => makeFakeServiceClient(expiredTrialRow, "vip@example.com"),
    }));
    const { getEntitlementSnapshot } = await import("@/lib/entitlements/entitlements");

    const snapshot = await getEntitlementSnapshot("ws-1", "adults");
    expect(snapshot.status).toBe("expired");
    expect(snapshot.isReadOnly).toBe(false);
  });

  it("still enforces an expired owner who is not whitelisted", async () => {
    process.env.NEXT_PUBLIC_BILLING_AVAILABLE = "true";
    process.env.BILLING_TEST_WHITELIST_EMAILS = "vip@example.com";
    jest.resetModules();
    jest.doMock("@/lib/supabase/server", () => ({
      createServiceClient: () => makeFakeServiceClient(expiredTrialRow, "someone-else@example.com"),
    }));
    const { getEntitlementSnapshot } = await import("@/lib/entitlements/entitlements");

    expect((await getEntitlementSnapshot("ws-1", "adults")).isReadOnly).toBe(true);
  });

  it("skips the owner lookup entirely when enforcement would not bite anyway", async () => {
    // Beta (billing unavailable) — nobody is read-only, so the extra query
    // must not run on the common path.
    let profileQueries = 0;
    jest.resetModules();
    jest.doMock("@/lib/supabase/server", () => ({
      createServiceClient: () => makeFakeServiceClient(expiredTrialRow, "vip@example.com", () => { profileQueries++; }),
    }));
    const { getEntitlementSnapshot } = await import("@/lib/entitlements/entitlements");

    expect((await getEntitlementSnapshot("ws-1", "adults")).isReadOnly).toBe(false);
    expect(profileQueries).toBe(0);
  });

  it("falls back to enforcing when only the owner lookup fails, rather than granting free access", async () => {
    process.env.NEXT_PUBLIC_BILLING_AVAILABLE = "true";
    process.env.BILLING_TEST_WHITELIST_EMAILS = "vip@example.com";
    jest.resetModules();
    // The entitlements read succeeds; only the profiles lookup blows up.
    jest.doMock("@/lib/supabase/server", () => ({
      createServiceClient: () => ({
        from: (table: string) => {
          if (table === "profiles") throw new Error("db down");
          const node: any = {
            maybeSingle: async () => ({ data: expiredTrialRow }),
            eq: () => node,
            select: () => node,
          };
          return node;
        },
      }),
    }));
    const { getEntitlementSnapshot } = await import("@/lib/entitlements/entitlements");

    const snapshot = await getEntitlementSnapshot("ws-1", "adults");
    expect(snapshot.status).toBe("expired");
    // Unknown email means "not whitelisted" — enforcement proceeds exactly
    // as it would have before, rather than failing open.
    expect(snapshot.isReadOnly).toBe(true);
  });
});
