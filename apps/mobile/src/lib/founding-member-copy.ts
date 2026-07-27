// Mirrors the "self"/"family" entries of web's src/lib/pricing/founding-member.ts
// (foundingMemberPricing, displayAdditionalPersonMonthlyPriceForInterval) —
// deliberately duplicated rather than imported, since mobile can't import
// from the Next.js web app's src/. Only the plan description and the
// additional-person add-on price are duplicated here: the add-on isn't sold
// as its own store product, so there's no RevenueCat/store price to read it
// from, unlike the base monthly/annual prices (always read from
// pkg.product.priceString/price so real per-store-locale pricing is used,
// never hardcoded). Keep in sync with founding-member.ts's self/family
// entries if those ever change.
export type FoundingMemberOfferingId = 'self' | 'family';

export interface FoundingMemberPlanCopy {
  description: string;
  includedPeople: number;
  /** Monthly USD price for one additional person beyond includedPeople, or
   * null if this plan doesn't offer additional people (Self). */
  additionalPersonMonthlyPrice: number | null;
}

export const FOUNDING_MEMBER_PLAN_COPY: Record<FoundingMemberOfferingId, FoundingMemberPlanCopy> = {
  self: {
    description: 'For tracking your own meals and habits.',
    includedPeople: 1,
    additionalPersonMonthlyPrice: null,
  },
  family: {
    description: 'For caregivers tracking meals for a partner, parent, or child.',
    includedPeople: 2,
    additionalPersonMonthlyPrice: 3.99,
  },
};

const CURRENCY_LABEL = 'US$';

export function formatFoundingPrice(amount: number): string {
  return `${CURRENCY_LABEL}${amount.toFixed(2)}`;
}

/** Same x10 annual / rounded-monthly-equivalent convention as web's
 * displayAdditionalPersonMonthlyPriceForInterval — annual is 10x the
 * monthly rate ("2 months free"), displayed divided back down to a
 * per-month figure since a lump annual add-on total isn't meaningful here. */
export function additionalPersonMonthlyDisplay(
  plan: FoundingMemberPlanCopy,
  interval: 'monthly' | 'annual'
): string | null {
  if (plan.additionalPersonMonthlyPrice === null) return null;
  const amount =
    interval === 'monthly'
      ? plan.additionalPersonMonthlyPrice
      : Math.round(((plan.additionalPersonMonthlyPrice * 10) / 12) * 100) / 100;
  return formatFoundingPrice(amount);
}
