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

export interface FoundingMemberPlan {
  id: FoundingMemberPlanId;
  name: string;
  includedPeople: number;
  /** Monthly founding-member price in whole USD (not minor units — this
   * table is display-only, never used for server-side checkout validation). */
  monthlyPrice: number;
  additionalPersonPrice: number | null;
  description: string;
}

export const foundingMemberPricing: Record<FoundingMemberPlanId, FoundingMemberPlan> = {
  self: {
    id: "self",
    name: "Self",
    includedPeople: 1,
    monthlyPrice: 4.99,
    additionalPersonPrice: null,
    description: "For tracking your own meals and habits.",
  },
  family: {
    id: "family",
    name: "Family",
    includedPeople: 2,
    monthlyPrice: 8.99,
    additionalPersonPrice: 3.99,
    description: "For caregivers tracking meals for a partner, parent, or child.",
  },
  gym: {
    id: "gym",
    name: "Gym & Coach",
    includedPeople: 5,
    monthlyPrice: 27.99,
    additionalPersonPrice: 3.99,
    description: "For coaches and trainers tracking nutrition for their clients.",
  },
};

export function formatFoundingPrice(amount: number): string {
  return `${CURRENCY_LABEL}${amount.toFixed(2)}`;
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
    "Your first month is free.",
    "Tistra Health is currently in Beta, and billing is not yet available. You can use the product without entering payment details while we complete our payment setup.",
    "While billing remains unavailable during Beta, you may continue using Tistra Health at no charge.",
    "We will notify you before paid subscriptions begin. You will not be charged automatically without first reviewing and confirming your subscription.",
    "Eligible early users will receive the founding-member rate when billing launches.",
  ],
  dashboardBannerTitle: "Tistra Health is free during Beta",
  dashboardBanner:
    "Your first month is free, and billing is not yet available. While billing remains unavailable, you can continue using Tistra Health at no charge. We'll notify you when subscriptions are ready so you can review and confirm your founding-member plan. You will not be charged automatically.",
  viewPlansLabel: "View founding-member pricing",
  viewPlansShortLabel: "View plans",
  noPaymentHelperText: "No payment required during Beta. You'll review and confirm your subscription before billing begins.",
};
