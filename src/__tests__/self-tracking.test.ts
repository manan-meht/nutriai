import {
  SELF_PRICING,
  ADDITIONAL_PERSON_PRICE,
  PEOPLE_INCLUDED,
  getSelfPrice,
  getAdditionalPersonPrice,
  PRICING,
} from "@/lib/billing/pricing";
import { effectiveFamilyLimit, FAMILY_MEMBER_LIMIT, SELF_TRACKING_LIMIT } from "@/lib/limits";

describe("self-tracking pricing config", () => {
  it("self plan includes exactly 1 person", () => {
    expect(PEOPLE_INCLUDED.self).toBe(1);
  });

  it("family/coach base counts are unchanged from today's limits", () => {
    expect(PEOPLE_INCLUDED.family).toBe(2);
    expect(PEOPLE_INCLUDED.coach).toBe(5);
  });

  it("has self pricing and an additional-person price for every existing market", () => {
    for (const market of Object.keys(PRICING) as (keyof typeof PRICING)[]) {
      expect(SELF_PRICING[market].monthly.amountMinorUnits).toBeGreaterThan(0);
      expect(SELF_PRICING[market].annual.amountMinorUnits).toBeGreaterThan(0);
      expect(ADDITIONAL_PERSON_PRICE[market].monthly.amountMinorUnits).toBeGreaterThan(0);
    }
  });

  it("self plan is priced lower than the existing 2-person family plan in every market", () => {
    for (const market of Object.keys(PRICING) as (keyof typeof PRICING)[]) {
      expect(getSelfPrice(market, "monthly").amountMinorUnits).toBeLessThan(
        PRICING[market].adults.monthly.amountMinorUnits
      );
    }
  });

  it("getSelfPrice/getAdditionalPersonPrice return the configured currency per market", () => {
    expect(getSelfPrice("IN", "monthly").currency).toBe("INR");
    expect(getAdditionalPersonPrice("US", "annual").currency).toBe("USD");
  });

  it("existing family/coach pricing is untouched by the self-plan addition", () => {
    expect(PRICING.US.adults.monthly.amountMinorUnits).toBe(999);
    expect(PRICING.US.gym.monthly.amountMinorUnits).toBe(2499);
  });
});

describe("effectiveFamilyLimit — plan-aware base (self vs family)", () => {
  it("defaults to the family base of 2 when no basePeopleIncluded is passed (back-compat)", () => {
    expect(effectiveFamilyLimit(0)).toBe(FAMILY_MEMBER_LIMIT);
    expect(effectiveFamilyLimit(3)).toBe(FAMILY_MEMBER_LIMIT + 3);
  });

  it("uses a base of 1 for a self-tracking workspace", () => {
    expect(effectiveFamilyLimit(0, SELF_TRACKING_LIMIT)).toBe(1);
    expect(effectiveFamilyLimit(2, SELF_TRACKING_LIMIT)).toBe(3);
  });
});
