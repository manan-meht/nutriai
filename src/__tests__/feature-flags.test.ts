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
