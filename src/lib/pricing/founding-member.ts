// Static, USD-only "founding-member" pricing shown publicly (marketing site,
// dashboard Beta banners) during Beta. This is deliberately separate from
// src/lib/billing/pricing.ts, which is the server-authoritative, multi-market
// (US/SG/AU/IN) table used by validatePriceSelection() and the Stripe/
// Razorpay checkout + webhook flow — that table is untouched by this file.
//
// TODO(billing-launch): once real founding-member checkout is wired up
// (Stripe price IDs, validatePriceSelection support), reconcile these prices
// with src/lib/billing/pricing.ts so there is a single source of truth.

export const PUBLIC_PRICING_CURRENCY = "USD";
export const CURRENCY_LABEL = "US$";

export type FoundingMemberPlanId = "self" | "family" | "gym";
export type BillingInterval = "monthly" | "annual";

/** Annual price = monthly x 10 ("2 months free"), matching the same
 * convention already used for non-founding pricing in src/lib/billing/pricing.ts
 * (annualSavingsFraction there computes ~16.7% for the same ratio). */
const ANNUAL_MONTHS_MULTIPLIER = 10;

function annualFromMonthly(monthlyPrice: number): number {
  return Math.round(monthlyPrice * ANNUAL_MONTHS_MULTIPLIER * 100) / 100;
}

/** Fraction saved by paying annually instead of monthly x 12 — always the
 * same ~16.7% given the fixed x10 convention above, but derived rather than
 * hardcoded so it stays correct if the multiplier ever changes. */
export const FOUNDING_ANNUAL_SAVINGS_FRACTION = (12 - ANNUAL_MONTHS_MULTIPLIER) / 12;

export interface FoundingMemberPlan {
  id: FoundingMemberPlanId;
  name: string;
  includedPeople: number;
  /** Monthly founding-member price in whole USD (not minor units — this
   * table is display-only, never used for server-side checkout validation). */
  monthlyPrice: number;
  /** Annual founding-member price in whole USD — monthlyPrice x 10. */
  annualPrice: number;
  additionalPersonPrice: number | null;
  /** Annual additional-person price — additionalPersonPrice x 10, or null to match additionalPersonPrice. */
  additionalPersonAnnualPrice: number | null;
  description: string;
}

export const foundingMemberPricing: Record<FoundingMemberPlanId, FoundingMemberPlan> = {
  self: {
    id: "self",
    name: "Self",
    includedPeople: 1,
    monthlyPrice: 4.99,
    annualPrice: annualFromMonthly(4.99),
    additionalPersonPrice: null,
    additionalPersonAnnualPrice: null,
    description: "For tracking your own meals and habits.",
  },
  family: {
    id: "family",
    name: "Family",
    includedPeople: 2,
    monthlyPrice: 8.99,
    annualPrice: annualFromMonthly(8.99),
    additionalPersonPrice: 3.99,
    additionalPersonAnnualPrice: annualFromMonthly(3.99),
    description: "For caregivers tracking meals for a partner, parent, or child.",
  },
  gym: {
    id: "gym",
    name: "Gym & Coach",
    includedPeople: 5,
    monthlyPrice: 27.99,
    annualPrice: annualFromMonthly(27.99),
    additionalPersonPrice: 3.99,
    additionalPersonAnnualPrice: annualFromMonthly(3.99),
    description: "For coaches and trainers tracking nutrition for their clients.",
  },
};

export function formatFoundingPrice(amount: number): string {
  return `${CURRENCY_LABEL}${amount.toFixed(2)}`;
}

export function priceForInterval(plan: FoundingMemberPlan, interval: BillingInterval): number {
  return interval === "monthly" ? plan.monthlyPrice : plan.annualPrice;
}

export function additionalPersonPriceForInterval(plan: FoundingMemberPlan, interval: BillingInterval): number | null {
  return interval === "monthly" ? plan.additionalPersonPrice : plan.additionalPersonAnnualPrice;
}

/** The per-month amount to *display* for a given interval: the plan's
 * monthly price as-is for "monthly", or the annual price divided by 12 for
 * "annual" (e.g. "US$4.16/month billed annually") — never the lump annual
 * total, which reads as a bigger, less comparable number on the card. */
export function displayMonthlyPriceForInterval(plan: FoundingMemberPlan, interval: BillingInterval): number {
  return interval === "monthly" ? plan.monthlyPrice : Math.round((plan.annualPrice / 12) * 100) / 100;
}

export function displayAdditionalPersonMonthlyPriceForInterval(
  plan: FoundingMemberPlan,
  interval: BillingInterval
): number | null {
  if (interval === "monthly") return plan.additionalPersonPrice;
  return plan.additionalPersonAnnualPrice === null ? null : Math.round((plan.additionalPersonAnnualPrice / 12) * 100) / 100;
}

// Shared copy — defined once here and reused verbatim across the public
// pricing page, the dashboard Beta banner, and the /billing placeholder so
// wording never drifts between the three surfaces.
export const foundingMemberCopy = {
  sectionTitle: "Founding-member pricing",
  sectionIntro: "Join Tistra Health early and keep access to our special founding-member rates.",
  badge: "Founding-member rate",
  betaNoticeTitle: "Free during Beta",
  betaNotice: [
    "Your first 14 days are free.",
    "Tistra Health is currently in Beta, and billing is not yet available. You can use the product without entering payment details while we complete our payment setup.",
    "While billing remains unavailable during Beta, you may continue using Tistra Health at no charge.",
    "We will notify you before paid subscriptions begin. You will not be charged automatically without first reviewing and confirming your subscription.",
    "Eligible early users will receive the founding-member rate when billing launches.",
  ],
  dashboardBannerTitle: "Tistra Health is free during Beta",
  dashboardBanner:
    "Your first 14 days are free, and billing is not yet available. While billing remains unavailable, you can continue using Tistra Health at no charge. We'll notify you when subscriptions are ready so you can review and confirm your founding-member plan. You will not be charged automatically.",
  viewPlansLabel: "View founding-member pricing",
  viewPlansShortLabel: "View plans",
  // Shown once BILLING_AVAILABLE is on — replaces betaNotice/dashboardBanner
  // above, which only apply pre-launch (kept, not deleted, since a staging
  // deploy with the flag off still needs the old Beta copy).
  trialNoticeTitle: "Start your free 14-day trial",
  trialNotice: "Add a payment method when you add your first person — you won't be charged until your 14-day trial ends, and you can cancel anytime before then.",
  noPaymentHelperText: "You'll add a payment method when you add your first person. Your first 14 days are free, and you can cancel anytime before the trial ends.",
  monthlyToggleLabel: "Monthly",
  annualToggleLabel: "Annual",
  annualSavingsLabel: `Save ${Math.round(FOUNDING_ANNUAL_SAVINGS_FRACTION * 100)}%`,
  monthlySuffix: "/month",
  annualSuffix: "/month billed annually",
};
