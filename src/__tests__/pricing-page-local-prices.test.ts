import fs from "fs";
import path from "path";
import { getPrice, getSelfPrice, getAdditionalPersonPrice, type BillingMarket, type BillingInterval, type PricePoint } from "@/lib/billing/pricing";
import { publicPlanPrices, perMonth, annualSavingsPercent, bestAnnualSavingsPercent, type PublicPlanPrices } from "@/lib/pricing/plan-prices";

// The public /pricing (and /billing) page once showed its own static US$
// list, which disagreed with checkout: US$8.99 vs US$9.99 for Family, and
// US$ shown to India visitors who were then charged in ₹. These tests pin
// the page to checkout's own prices and market resolution instead.

const MARKETS: BillingMarket[] = ["US", "SG", "AU", "IN", "INTL"];
const INTERVALS: BillingInterval[] = ["monthly", "annual"];

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("public pricing page shows exactly what checkout charges", () => {
  it.each(MARKETS)("%s: every plan and add-on price is checkout's own price", (market) => {
    const prices = publicPlanPrices(market);
    for (const interval of INTERVALS) {
      expect(prices.self[interval]).toEqual(getSelfPrice(market, interval));
      expect(prices.family[interval]).toEqual(getPrice(market, "adults", interval));
      expect(prices.gym[interval]).toEqual(getPrice(market, "gym", interval));
      expect(prices.family.additionalPerson?.[interval]).toEqual(getAdditionalPersonPrice(market, "family", interval));
      expect(prices.gym.additionalPerson?.[interval]).toEqual(getAdditionalPersonPrice(market, "coach", interval));
    }
    expect(prices.self.additionalPerson).toBeNull();
  });

  it.each([
    ["US", "USD"],
    ["SG", "SGD"],
    ["AU", "AUD"],
    ["IN", "INR"],
    ["INTL", "USD"],
  ] as const)("%s visitors see %s", (market, currency) => {
    const prices = publicPlanPrices(market);
    const points: PricePoint[] = Object.values(prices).flatMap((p) => [
      p.monthly,
      p.annual,
      ...(p.additionalPerson ? [p.additionalPerson.monthly, p.additionalPerson.annual] : []),
    ]);
    expect(new Set(points.map((p) => p.currency))).toEqual(new Set([currency]));
  });

  it("the page and checkout resolve the market the same way", () => {
    expect(read("src/components/pricing/LocalPricingSection.tsx")).toMatch(/resolveRequestBillingMarket\(\)/);
    const checkout = read("src/app/actions/checkout.ts");
    expect(checkout).toMatch(/resolveRequestBillingMarket\(\)/);
    // No second, hand-rolled resolution left in checkout to drift from it.
    expect(checkout).not.toMatch(/resolveBillingMarket\(/);
  });

  it.each(["src/app/(public)/pricing/page.tsx", "src/app/billing/page.tsx"])("%s renders the localized section", (page) => {
    const contents = read(page);
    expect(contents).toMatch(/<LocalPricingSection /);
    expect(contents).not.toMatch(/<PricingSection /);
  });

  it("PricingSection no longer formats the static US$ founding-member list", () => {
    const contents = read("src/components/pricing/PricingSection.tsx");
    expect(contents).not.toMatch(/formatFoundingPrice|displayMonthlyPriceForInterval|displayAdditionalPersonMonthlyPriceForInterval/);
  });
});

describe("per-month display and annual savings", () => {
  it("shows a monthly price as-is and an annual price as a rounded twelfth", () => {
    const monthly = { amountMinorUnits: 49900, currency: "INR" };
    const annual = { amountMinorUnits: 299900, currency: "INR" };
    expect(perMonth(monthly, "monthly")).toBe(monthly);
    expect(perMonth(annual, "annual")).toEqual({ amountMinorUnits: 24992, currency: "INR" });
  });

  it("computes the annual saving against twelve monthly payments", () => {
    expect(annualSavingsPercent({ monthly: { amountMinorUnits: 999, currency: "USD" }, annual: { amountMinorUnits: 9900, currency: "USD" } })).toBe(17);
    expect(annualSavingsPercent({ monthly: { amountMinorUnits: 49900, currency: "INR" }, annual: { amountMinorUnits: 299900, currency: "INR" } })).toBe(50);
  });

  it("quotes the best saving across plans on the interval toggle", () => {
    const plan = (monthly: number, annual: number): PublicPlanPrices => ({
      monthly: { amountMinorUnits: monthly, currency: "USD" },
      annual: { amountMinorUnits: annual, currency: "USD" },
      additionalPerson: null,
      includedPeople: 1,
    });
    expect(bestAnnualSavingsPercent({ self: plan(1000, 10000), family: plan(1000, 6000), gym: plan(1000, 9000) })).toBe(50);
  });
});

describe("prices are only offered where checkout can take them", () => {
  const original = process.env.NEXT_PUBLIC_RAZORPAY_ENABLED;
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_RAZORPAY_ENABLED;
    else process.env.NEXT_PUBLIC_RAZORPAY_ENABLED = original;
    jest.resetModules();
  });

  it.each([
    ["true", true],
    ["false", false],
  ] as const)("India with NEXT_PUBLIC_RAZORPAY_ENABLED=%s → %s", async (value, expected) => {
    jest.resetModules();
    process.env.NEXT_PUBLIC_RAZORPAY_ENABLED = value;
    const { isCheckoutEnabledForMarket } = await import("@/lib/billing/provider-registry");
    expect(isCheckoutEnabledForMarket("IN")).toBe(expected);
  });
});
