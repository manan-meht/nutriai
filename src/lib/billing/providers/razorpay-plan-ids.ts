import type { BillingModule, BillingInterval } from "@/lib/billing/pricing";

// Razorpay is India-only in this implementation (see spec §14), so plans
// are keyed by module + interval only — no market dimension.
export function razorpayPlanEnvVarName(module: BillingModule, interval: BillingInterval): string {
  return `RAZORPAY_PLAN_${module.toUpperCase()}_${interval.toUpperCase()}`;
}

export function getRazorpayPlanId(module: BillingModule, interval: BillingInterval): string {
  const envVar = razorpayPlanEnvVarName(module, interval);
  const planId = process.env[envVar];
  if (!planId) {
    throw new Error(`Missing Razorpay plan ID env var ${envVar} — create the plan in the Razorpay Dashboard and set it here.`);
  }
  return planId;
}
