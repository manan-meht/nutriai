import { mapStripeStatus } from "@/lib/billing/providers/stripe-status";
import { mapRazorpayStatus } from "@/lib/billing/providers/razorpay-status";
import { stripePriceEnvVarName } from "@/lib/billing/providers/stripe-price-ids";
import { razorpayPlanEnvVarName } from "@/lib/billing/providers/razorpay-plan-ids";
import { providerNameForMarket } from "@/lib/billing/provider-registry";

describe("mapStripeStatus", () => {
  it("maps trialing -> trialing", () => {
    expect(mapStripeStatus("trialing", false)).toBe("trialing");
  });

  it("maps active -> active when not scheduled to cancel", () => {
    expect(mapStripeStatus("active", false)).toBe("active");
  });

  it("maps active + cancel_at_period_end -> cancel_at_period_end", () => {
    expect(mapStripeStatus("active", true)).toBe("cancel_at_period_end");
  });

  it("maps past_due -> past_due", () => {
    expect(mapStripeStatus("past_due", false)).toBe("past_due");
  });

  it("maps canceled -> cancelled", () => {
    expect(mapStripeStatus("canceled", false)).toBe("cancelled");
  });

  it.each(["unpaid", "incomplete_expired", "paused"])("maps %s -> expired", (status) => {
    expect(mapStripeStatus(status, false)).toBe("expired");
  });

  it("maps incomplete and unknown statuses -> not_started", () => {
    expect(mapStripeStatus("incomplete", false)).toBe("not_started");
    expect(mapStripeStatus("some_future_status", false)).toBe("not_started");
  });
});

describe("mapRazorpayStatus", () => {
  it.each(["authenticated", "active"])("maps %s -> active", (status) => {
    expect(mapRazorpayStatus(status)).toBe("active");
  });

  it.each(["pending", "halted"])("maps %s -> past_due", (status) => {
    expect(mapRazorpayStatus(status)).toBe("past_due");
  });

  it("maps cancelled -> cancelled", () => {
    expect(mapRazorpayStatus("cancelled")).toBe("cancelled");
  });

  it.each(["completed", "expired"])("maps %s -> expired", (status) => {
    expect(mapRazorpayStatus(status)).toBe("expired");
  });

  it("maps created and unknown statuses -> not_started", () => {
    expect(mapRazorpayStatus("created")).toBe("not_started");
    expect(mapRazorpayStatus("something_new")).toBe("not_started");
  });
});

describe("price/plan ID env var naming", () => {
  it("builds the expected Stripe price env var name per market/module/interval", () => {
    expect(stripePriceEnvVarName("US", "adults", "monthly")).toBe("STRIPE_PRICE_US_ADULTS_MONTHLY");
    expect(stripePriceEnvVarName("SG", "gym", "annual")).toBe("STRIPE_PRICE_SG_GYM_ANNUAL");
    expect(stripePriceEnvVarName("INTL", "adults", "annual")).toBe("STRIPE_PRICE_INTL_ADULTS_ANNUAL");
  });

  it("builds the expected Razorpay plan env var name per module/interval", () => {
    expect(razorpayPlanEnvVarName("adults", "monthly")).toBe("RAZORPAY_PLAN_ADULTS_MONTHLY");
    expect(razorpayPlanEnvVarName("gym", "annual")).toBe("RAZORPAY_PLAN_GYM_ANNUAL");
  });
});

describe("providerNameForMarket", () => {
  it("routes IN to razorpay", () => {
    expect(providerNameForMarket("IN")).toBe("razorpay");
  });

  it.each(["US", "SG", "AU", "INTL"] as const)("routes %s to stripe", (market) => {
    expect(providerNameForMarket(market)).toBe("stripe");
  });
});
