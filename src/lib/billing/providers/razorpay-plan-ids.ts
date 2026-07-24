import type { BillingPricingTier, BillingInterval } from "@/lib/billing/pricing";

// Razorpay is India-only in this implementation (see spec §14), so plans
// are keyed by pricing tier + interval only — no market dimension.
export function razorpayPlanEnvVarName(pricingTier: BillingPricingTier, interval: BillingInterval): string {
  return `RAZORPAY_PLAN_${pricingTier.toUpperCase()}_${interval.toUpperCase()}`;
}

export function getRazorpayPlanId(pricingTier: BillingPricingTier, interval: BillingInterval): string {
  const envVar = razorpayPlanEnvVarName(pricingTier, interval);
  const planId = process.env[envVar];
  if (!planId) {
    throw new Error(`Missing Razorpay plan ID env var ${envVar} — create the plan in the Razorpay Dashboard and set it here.`);
  }
  return planId;
}
