import {
  PRICING,
  SELF_PRICING,
  ADDITIONAL_PERSON_PRICE,
  PEOPLE_INCLUDED,
  type BillingMarket,
  type BillingInterval,
  type PricePoint,
} from "@/lib/billing/pricing";
import type { FoundingMemberPlanId } from "./founding-member";

// Prices for the public pricing page, read from the same tables checkout
// charges from (src/lib/billing/pricing.ts). The page once showed a separate
// US$-only display list (founding-member.ts), so it said US$8.99 for Family
// and US$27.99 for Coach while checkout's table said US$9.99 and US$24.99,
// and an India visitor saw US$ and was then sent to Razorpay in ₹. There is
// deliberately no second list here — every number comes from the getters
// checkout itself uses.

export interface PublicPlanPrices {
  monthly: PricePoint;
  annual: PricePoint;
  /** Per-person add-on price, or null for plans without one (Self). */
  additionalPerson: Record<BillingInterval, PricePoint> | null;
  includedPeople: number;
}

export function publicPlanPrices(market: BillingMarket): Record<FoundingMemberPlanId, PublicPlanPrices> {
  return {
    self: { ...SELF_PRICING[market], additionalPerson: null, includedPeople: PEOPLE_INCLUDED.self },
    family: { ...PRICING[market].adults, additionalPerson: ADDITIONAL_PERSON_PRICE[market].family, includedPeople: PEOPLE_INCLUDED.family },
    gym: { ...PRICING[market].gym, additionalPerson: ADDITIONAL_PERSON_PRICE[market].coach, includedPeople: PEOPLE_INCLUDED.coach },
  };
}

/** The per-month figure a card shows: the price as-is for monthly, or the
 * annual charge ÷ 12 for annual (the card states the real annual charge
 * separately, so this is only ever a rounded equivalent). */
export function perMonth(point: PricePoint, interval: BillingInterval): PricePoint {
  if (interval === "monthly") return point;
  return { amountMinorUnits: Math.round(point.amountMinorUnits / 12), currency: point.currency };
}

/** Whole-percent saving of the annual price over twelve monthly payments. */
export function annualSavingsPercent(prices: Pick<PublicPlanPrices, "monthly" | "annual">): number {
  const twelveMonths = prices.monthly.amountMinorUnits * 12;
  return Math.round(((twelveMonths - prices.annual.amountMinorUnits) / twelveMonths) * 100);
}

/** Savings differ by plan and market (about 17% in USD, up to 50% on an
 * India launch price), so the interval toggle quotes the best of them. */
export function bestAnnualSavingsPercent(all: Record<FoundingMemberPlanId, PublicPlanPrices>): number {
  return Math.max(...Object.values(all).map(annualSavingsPercent));
}
