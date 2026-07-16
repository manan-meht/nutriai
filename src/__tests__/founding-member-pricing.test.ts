import {
  foundingMemberPricing,
  formatFoundingPrice,
  priceForInterval,
  additionalPersonPriceForInterval,
  displayMonthlyPriceForInterval,
  displayAdditionalPersonMonthlyPriceForInterval,
  FOUNDING_ANNUAL_SAVINGS_FRACTION,
  CURRENCY_LABEL,
  PUBLIC_PRICING_CURRENCY,
} from "@/lib/pricing/founding-member";

describe("founding-member pricing config", () => {
  it("uses USD as the public pricing currency", () => {
    expect(PUBLIC_PRICING_CURRENCY).toBe("USD");
    expect(CURRENCY_LABEL).toBe("US$");
  });

  it("Self: 1 included person, US$4.99/month, no additional-person price", () => {
    const plan = foundingMemberPricing.self;
    expect(plan.includedPeople).toBe(1);
    expect(plan.monthlyPrice).toBe(4.99);
    expect(plan.additionalPersonPrice).toBeNull();
  });

  it("Family: 2 included people, US$8.99/month, US$3.99/person additional", () => {
    const plan = foundingMemberPricing.family;
    expect(plan.includedPeople).toBe(2);
    expect(plan.monthlyPrice).toBe(8.99);
    expect(plan.additionalPersonPrice).toBe(3.99);
  });

  it("Gym & Coach: 5 included clients, US$27.99/month, US$3.99/client additional", () => {
    const plan = foundingMemberPricing.gym;
    expect(plan.includedPeople).toBe(5);
    expect(plan.monthlyPrice).toBe(27.99);
    expect(plan.additionalPersonPrice).toBe(3.99);
  });

  it("formatFoundingPrice renders with the US$ prefix, not a bare $", () => {
    expect(formatFoundingPrice(4.99)).toBe("US$4.99");
    expect(formatFoundingPrice(27.99)).toBe("US$27.99");
  });

  it("annual price is monthly x 10 (\"2 months free\") for every plan", () => {
    expect(foundingMemberPricing.self.annualPrice).toBeCloseTo(49.9);
    expect(foundingMemberPricing.family.annualPrice).toBeCloseTo(89.9);
    expect(foundingMemberPricing.gym.annualPrice).toBeCloseTo(279.9);
    expect(foundingMemberPricing.family.additionalPersonAnnualPrice).toBeCloseTo(39.9);
    expect(foundingMemberPricing.gym.additionalPersonAnnualPrice).toBeCloseTo(39.9);
  });

  it("Self has no additional-person price for either interval", () => {
    expect(foundingMemberPricing.self.additionalPersonPrice).toBeNull();
    expect(foundingMemberPricing.self.additionalPersonAnnualPrice).toBeNull();
  });

  it("FOUNDING_ANNUAL_SAVINGS_FRACTION reflects ~17% (2 months free out of 12)", () => {
    expect(FOUNDING_ANNUAL_SAVINGS_FRACTION).toBeCloseTo(2 / 12);
  });

  it("priceForInterval/additionalPersonPriceForInterval switch between monthly and annual", () => {
    const family = foundingMemberPricing.family;
    expect(priceForInterval(family, "monthly")).toBe(8.99);
    expect(priceForInterval(family, "annual")).toBeCloseTo(89.9);
    expect(additionalPersonPriceForInterval(family, "monthly")).toBe(3.99);
    expect(additionalPersonPriceForInterval(family, "annual")).toBeCloseTo(39.9);

    const self = foundingMemberPricing.self;
    expect(additionalPersonPriceForInterval(self, "monthly")).toBeNull();
    expect(additionalPersonPriceForInterval(self, "annual")).toBeNull();
  });

  it("displayMonthlyPriceForInterval shows the monthly-equivalent for annual billing, not the lump annual total", () => {
    const family = foundingMemberPricing.family;
    // Monthly: unchanged.
    expect(displayMonthlyPriceForInterval(family, "monthly")).toBe(8.99);
    // Annual: 89.90 / 12 = 7.4916... rounded to 7.49, never the full 89.90.
    expect(displayMonthlyPriceForInterval(family, "annual")).toBeCloseTo(7.49);

    const gym = foundingMemberPricing.gym;
    expect(displayAdditionalPersonMonthlyPriceForInterval(gym, "monthly")).toBe(3.99);
    // 39.90 / 12 = 3.325 rounded to 3.33.
    expect(displayAdditionalPersonMonthlyPriceForInterval(gym, "annual")).toBeCloseTo(3.33);

    const self = foundingMemberPricing.self;
    expect(displayAdditionalPersonMonthlyPriceForInterval(self, "monthly")).toBeNull();
    expect(displayAdditionalPersonMonthlyPriceForInterval(self, "annual")).toBeNull();
  });
});
