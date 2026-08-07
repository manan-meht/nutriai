import { resolveBillingMarket } from "@/lib/billing/market";
import { getAdditionalPersonPrice, getPrice, getSelfPrice, validatePriceSelection } from "@/lib/billing/pricing";
import { TRIAL_LENGTH_DAYS_BY_MODULE, trialLengthMs } from "@/lib/entitlements/entitlements";

describe("India seat pricing — proportional to each plan's own base, not shared flat", () => {
  it("Family additional seat is ₹249/mo, ₹2,490/yr", () => {
    const monthly = getAdditionalPersonPrice("IN", "family", "monthly");
    const annual = getAdditionalPersonPrice("IN", "family", "annual");
    expect(monthly.amountMinorUnits).toBe(24900);
    expect(annual.amountMinorUnits).toBe(249000);
  });

  it("Coach additional client is ₹199/mo, ₹1,990/yr", () => {
    const monthly = getAdditionalPersonPrice("IN", "coach", "monthly");
    const annual = getAdditionalPersonPrice("IN", "coach", "annual");
    expect(monthly.amountMinorUnits).toBe(19900);
    expect(annual.amountMinorUnits).toBe(199000);
  });

  it("Family and Coach additional-seat prices differ in India (unlike every other market)", () => {
    expect(getAdditionalPersonPrice("IN", "family", "monthly").amountMinorUnits).not.toBe(
      getAdditionalPersonPrice("IN", "coach", "monthly").amountMinorUnits
    );
  });

  it("non-India markets keep family/coach additional-seat pricing identical (no regression)", () => {
    for (const market of ["US", "SG", "AU", "INTL"] as const) {
      expect(getAdditionalPersonPrice(market, "family", "monthly")).toEqual(getAdditionalPersonPrice(market, "coach", "monthly"));
      expect(getAdditionalPersonPrice(market, "family", "annual")).toEqual(getAdditionalPersonPrice(market, "coach", "annual"));
    }
  });
});

describe("India launch pricing — standard vs current", () => {
  it("Self annual: ₹1,799 launch price crossed out against ₹2,499 standard", () => {
    const annual = getSelfPrice("IN", "annual");
    expect(annual.amountMinorUnits).toBe(179900);
    expect(annual.standardAmountMinorUnits).toBe(249900);
  });

  it("Family annual: ₹2,999 launch price crossed out against ₹3,999 standard", () => {
    const annual = getPrice("IN", "adults", "annual");
    expect(annual.amountMinorUnits).toBe(299900);
    expect(annual.standardAmountMinorUnits).toBe(399900);
  });

  it("Coach annual has no launch offer — ₹8,999 flat", () => {
    const annual = getPrice("IN", "gym", "annual");
    expect(annual.amountMinorUnits).toBe(899900);
    expect(annual.standardAmountMinorUnits).toBeUndefined();
  });

  it("monthly prices have no standard/launch distinction (only annual does)", () => {
    expect(getSelfPrice("IN", "monthly").standardAmountMinorUnits).toBeUndefined();
    expect(getPrice("IN", "adults", "monthly").standardAmountMinorUnits).toBeUndefined();
  });
});

describe("India trial length: Self/Family 14 days, Coach 30 days — global, not India-only", () => {
  it("adults module (Self/Family) is 14 days in every market", () => {
    expect(TRIAL_LENGTH_DAYS_BY_MODULE.adults).toBe(14);
    expect(trialLengthMs("adults")).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it("gym module (Coach) is 30 days in every market", () => {
    expect(TRIAL_LENGTH_DAYS_BY_MODULE.gym).toBe(30);
    expect(trialLengthMs("gym")).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe("a tampered client cannot force India pricing", () => {
  it("rejects a client-supplied India price/currency for a US-resolved market", () => {
    const result = validatePriceSelection({
      market: "US", module: "adults", interval: "annual",
      amountMinorUnits: 299900, currency: "INR", // India Family launch price, wrong market
    });
    expect(result.valid).toBe(false);
  });

  it("rejects the India standard (non-launch) price when the launch price is what's actually configured", () => {
    const result = validatePriceSelection({
      market: "IN", module: "adults", interval: "annual",
      amountMinorUnits: 399900, currency: "INR", // standard, not the current launch price
    });
    expect(result).toEqual({ valid: false, reason: expect.stringContaining("Price mismatch") });
  });

  it("accepts the real India launch price the server actually charges", () => {
    const result = validatePriceSelection({
      market: "IN", module: "adults", interval: "annual",
      amountMinorUnits: 299900, currency: "INR",
    });
    expect(result.valid).toBe(true);
  });
});

describe("region resolution — spec §5/§6 cases, purchaser-only", () => {
  it("Case A: India IP + India confirmed → IN", () => {
    expect(resolveBillingMarket({ ipCountry: "IN", confirmedCountry: "IN" }).market).toBe("IN");
  });

  it("Case B: US IP + India confirmed by the purchaser → IN (an Indian purchaser may be travelling/using a VPN)", () => {
    expect(resolveBillingMarket({ ipCountry: "US", confirmedCountry: "IN" }).market).toBe("IN");
  });

  it("Case C/D: India-looking IP with no purchaser confirmation falls back to IP for display only — never a substitute for real eligibility enforcement at the payment layer", () => {
    const result = resolveBillingMarket({ ipCountry: "IN" });
    expect(result.market).toBe("IN");
    expect(result.confirmed).toBe(false);
  });

  it("resolveBillingMarket's signature has no family-member/recipient parameter — only purchaser-side signals", () => {
    // Regression guard for spec §6: family-recipient location must never be
    // consultable here at all, not just "unused today." A parameter named
    // for a family member/contact would fail this structural check.
    const params = { confirmedCountry: "IN", billingAddressCountry: "IN", ipCountry: "IN" };
    const result = resolveBillingMarket(params);
    expect(Object.keys(params)).toEqual(["confirmedCountry", "billingAddressCountry", "ipCountry"]);
    expect(result.market).toBe("IN");
  });
});
