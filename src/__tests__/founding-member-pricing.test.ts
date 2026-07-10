import { foundingMemberPricing, formatFoundingPrice, CURRENCY_LABEL, PUBLIC_PRICING_CURRENCY } from "@/lib/pricing/founding-member";

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
});
