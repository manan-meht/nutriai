import {
  summariseBillingCustomers,
  environmentFromWebhookPayload,
  type EntitlementRowForBilling,
} from "@/lib/admin/billing-customers";

// The failure this guards against, which was live when the view was built:
// every "active" entitlement row in production was a test. Two sandbox
// purchases — one made by Apple's own reviewer during App Review — and one
// account comped for Google Play review. Counting rows would have reported
// three paying customers against real revenue of zero.

const NOW = Date.parse("2026-09-22T00:00:00Z");

const row = (over: Partial<EntitlementRowForBilling>): EntitlementRowForBilling => ({
  workspaceId: "ws",
  ownerId: "owner",
  status: "active",
  providerSubscriptionId: "sub_1",
  trialEndAt: null,
  currentPeriodEnd: "2026-10-22T00:00:00Z",
  environment: "production",
  ...over,
});

describe("reading the environment from a webhook payload", () => {
  it("reads RevenueCat's environment", () => {
    expect(environmentFromWebhookPayload({ event: { environment: "SANDBOX" } })).toBe("sandbox");
    expect(environmentFromWebhookPayload({ event: { environment: "PRODUCTION" } })).toBe("production");
  });

  it("reads Stripe's livemode", () => {
    expect(environmentFromWebhookPayload({ livemode: true })).toBe("production");
    expect(environmentFromWebhookPayload({ livemode: false })).toBe("sandbox");
  });

  it("says unknown rather than guessing", () => {
    // An unknown must never default to production — that is the direction
    // that invents revenue.
    expect(environmentFromWebhookPayload(null)).toBe("unknown");
    expect(environmentFromWebhookPayload({})).toBe("unknown");
    expect(environmentFromWebhookPayload({ event: {} })).toBe("unknown");
  });
});

describe("who counts as paying", () => {
  it("counts a real purchase in a paid status", () => {
    const s = summariseBillingCustomers([row({})], NOW);
    expect(s.paying).toHaveLength(1);
    expect(s.excluded).toHaveLength(0);
  });

  it("excludes a sandbox purchase, with the reason", () => {
    const s = summariseBillingCustomers([row({ environment: "sandbox" })], NOW);
    expect(s.paying).toHaveLength(0);
    expect(s.excluded.map((e) => e.reason)).toEqual(["sandbox"]);
  });

  it("excludes access granted by hand, with the reason", () => {
    // Active, but nobody ever paid: no subscription behind it.
    const s = summariseBillingCustomers(
      [row({ providerSubscriptionId: null, environment: "unknown" })],
      NOW
    );
    expect(s.paying).toHaveLength(0);
    expect(s.excluded.map((e) => e.reason)).toEqual(["comped"]);
  });

  it("reproduces the real production data: three active rows, zero revenue", () => {
    const s = summariseBillingCustomers(
      [
        row({ environment: "sandbox" }),
        row({ environment: "sandbox" }),
        row({ providerSubscriptionId: null }),
      ],
      NOW
    );
    expect(s.paying).toHaveLength(0);
    expect(s.excluded).toHaveLength(3);
  });

  it("still counts someone mid payment-retry, who has paid before", () => {
    for (const status of ["cancel_at_period_end", "past_due", "grace_period"]) {
      expect(summariseBillingCustomers([row({ status })], NOW).paying).toHaveLength(1);
    }
  });

  it("does not count former customers", () => {
    for (const status of ["cancelled", "expired", "not_started"]) {
      const s = summariseBillingCustomers([row({ status })], NOW);
      expect(s.paying).toHaveLength(0);
      expect(s.excluded).toHaveLength(0);
    }
  });
});

describe("trials", () => {
  it("separates a trial with a card from one without", () => {
    const s = summariseBillingCustomers(
      [
        row({ status: "trialing", trialEndAt: "2026-09-30T00:00:00Z", providerSubscriptionId: "sub_2" }),
        row({ status: "trialing", trialEndAt: "2026-09-30T00:00:00Z", providerSubscriptionId: null }),
      ],
      NOW
    );
    expect(s.trialingWithCard).toHaveLength(1);
    expect(s.trialingWithoutCard).toHaveLength(1);
    // Neither is revenue yet.
    expect(s.paying).toHaveLength(0);
  });

  it("counts the days to the trial end, not to the period end", () => {
    const [t] = summariseBillingCustomers(
      [row({ status: "trialing", trialEndAt: "2026-09-30T00:00:00Z", currentPeriodEnd: "2027-01-01T00:00:00Z", providerSubscriptionId: "s" })],
      NOW
    ).trialingWithCard;
    expect(t.daysUntilRenewal).toBe(8);
  });

  it("counts to the period end for a paying customer", () => {
    const [p] = summariseBillingCustomers([row({ currentPeriodEnd: "2026-09-23T00:00:00Z" })], NOW).paying;
    expect(p.daysUntilRenewal).toBe(1);
  });

  it("goes negative once a date has passed", () => {
    const [p] = summariseBillingCustomers([row({ currentPeriodEnd: "2026-09-19T00:00:00Z" })], NOW).paying;
    expect(p.daysUntilRenewal).toBe(-3);
  });

  it("handles a missing date", () => {
    const [p] = summariseBillingCustomers([row({ currentPeriodEnd: null })], NOW).paying;
    expect(p.daysUntilRenewal).toBeNull();
  });
});

describe("ordering", () => {
  it("puts the soonest renewal first", () => {
    const s = summariseBillingCustomers(
      [
        row({ workspaceId: "late", currentPeriodEnd: "2026-12-01T00:00:00Z" }),
        row({ workspaceId: "soon", currentPeriodEnd: "2026-09-25T00:00:00Z" }),
        row({ workspaceId: "none", currentPeriodEnd: null }),
      ],
      NOW
    );
    expect(s.paying.map((p) => p.workspaceId)).toEqual(["soon", "late", "none"]);
  });
});

describe("empty input", () => {
  it("returns four empty buckets", () => {
    expect(summariseBillingCustomers([], NOW)).toEqual({
      paying: [],
      trialingWithCard: [],
      trialingWithoutCard: [],
      excluded: [],
    });
  });
});
