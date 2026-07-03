import { PRICING, getPrice, validatePriceSelection, annualSavingsFraction, INTL_USD_DISCLOSURE } from "@/lib/billing/pricing";
import { marketForCountry, resolveBillingMarket, getIpCountry } from "@/lib/billing/market";

describe("marketForCountry — the 4 launch markets", () => {
  it("US resolves to US market (USD)", () => {
    expect(marketForCountry("US")).toBe("US");
    expect(getPrice("US", "adults", "monthly").currency).toBe("USD");
  });

  it("SG resolves to SG market (SGD)", () => {
    expect(marketForCountry("SG")).toBe("SG");
    expect(getPrice("SG", "adults", "monthly").currency).toBe("SGD");
  });

  it("AU resolves to AU market (AUD)", () => {
    expect(marketForCountry("AU")).toBe("AU");
    expect(getPrice("AU", "adults", "monthly").currency).toBe("AUD");
  });

  it("IN resolves to IN market (INR)", () => {
    expect(marketForCountry("IN")).toBe("IN");
    expect(getPrice("IN", "adults", "monthly").currency).toBe("INR");
  });

  it("is case-insensitive", () => {
    expect(marketForCountry("us")).toBe("US");
    expect(marketForCountry("in")).toBe("IN");
  });
});

describe("marketForCountry — everything else resolves to INTL (USD)", () => {
  const nonLaunchCountries = ["GB", "CA", "TH", "NZ", "DE", "AE"];

  it.each(nonLaunchCountries)("%s resolves to INTL, not US", (country) => {
    const market = marketForCountry(country);
    expect(market).toBe("INTL");
    expect(market).not.toBe("US"); // must not be misclassified as a US customer
  });

  it("INTL pricing is in USD, matching the US price points", () => {
    expect(getPrice("INTL", "adults", "monthly")).toEqual(getPrice("US", "adults", "monthly"));
    expect(getPrice("INTL", "gym", "annual")).toEqual(getPrice("US", "gym", "annual"));
  });

  it("unknown/missing country falls back to INTL", () => {
    expect(marketForCountry(null)).toBe("INTL");
    expect(marketForCountry(undefined)).toBe("INTL");
    expect(marketForCountry("XX")).toBe("INTL");
  });

  it("shows the USD payment disclosure for international users", () => {
    expect(INTL_USD_DISCLOSURE).toMatch(/US dollars/i);
    expect(INTL_USD_DISCLOSURE).toMatch(/currency-conversion|foreign-transaction/i);
  });
});

describe("resolveBillingMarket — confirmation precedence", () => {
  it("uses IP-derived country when nothing is confirmed", () => {
    const result = resolveBillingMarket({ ipCountry: "IN" });
    expect(result.market).toBe("IN");
    expect(result.confirmed).toBe(false);
  });

  it("manual country selection overrides IP detection", () => {
    const result = resolveBillingMarket({ ipCountry: "US", confirmedCountry: "IN" });
    expect(result.market).toBe("IN");
    expect(result.confirmed).toBe(true);
  });

  it("billing-address-confirmed country overrides the earlier confirmed selection and IP", () => {
    const result = resolveBillingMarket({
      ipCountry: "US",
      confirmedCountry: "IN",
      billingAddressCountry: "SG",
    });
    expect(result.market).toBe("SG");
    expect(result.confirmed).toBe(true);
  });

  it("falls back to INTL when nothing is known", () => {
    const result = resolveBillingMarket({});
    expect(result.market).toBe("INTL");
    expect(result.country).toBeNull();
    expect(result.confirmed).toBe(false);
  });

  it("a non-launch country stays INTL even after being explicitly confirmed", () => {
    const result = resolveBillingMarket({ confirmedCountry: "GB" });
    expect(result.market).toBe("INTL");
    expect(result.confirmed).toBe(true);
  });
});

describe("getIpCountry — trusted Cloudflare header, never a security boundary", () => {
  it("reads cf-ipcountry when present", () => {
    const headers = new Headers({ "cf-ipcountry": "IN" });
    expect(getIpCountry(headers)).toBe("IN");
  });

  it("treats Cloudflare's XX (unknown) and T1 (Tor) sentinels as no country", () => {
    expect(getIpCountry(new Headers({ "cf-ipcountry": "XX" }))).toBeNull();
    expect(getIpCountry(new Headers({ "cf-ipcountry": "T1" }))).toBeNull();
  });

  it("returns null when the header is absent (non-Cloudflare environments)", () => {
    expect(getIpCountry(new Headers())).toBeNull();
  });
});

describe("monetary values are integer minor units, never floats", () => {
  const markets = Object.keys(PRICING) as (keyof typeof PRICING)[];

  it.each(markets)("%s: all price points are safe integers", (market) => {
    for (const billingModule of ["adults", "gym"] as const) {
      for (const interval of ["monthly", "annual"] as const) {
        const price = getPrice(market, billingModule, interval);
        expect(Number.isInteger(price.amountMinorUnits)).toBe(true);
        expect(Number.isSafeInteger(price.amountMinorUnits)).toBe(true);
      }
    }
  });

  it("US Family: $9.99/mo = 999 cents, $99/yr = 9900 cents", () => {
    expect(getPrice("US", "adults", "monthly").amountMinorUnits).toBe(999);
    expect(getPrice("US", "adults", "annual").amountMinorUnits).toBe(9900);
  });

  it("India Coaching: ₹1,299/mo = 129900 paise, ₹12,999/yr = 1299900 paise", () => {
    expect(getPrice("IN", "gym", "monthly").amountMinorUnits).toBe(129900);
    expect(getPrice("IN", "gym", "annual").amountMinorUnits).toBe(1299900);
  });

  it("annual pricing is presented as roughly 2 months free vs. monthly", () => {
    for (const market of markets) {
      for (const billingModule of ["adults", "gym"] as const) {
        const savings = annualSavingsFraction(market, billingModule);
        // ~2 free months out of 12 ≈ 16.7% — allow a reasonable band since
        // the introductory prices aren't exactly round multiples.
        expect(savings).toBeGreaterThan(0.1);
        expect(savings).toBeLessThan(0.25);
      }
    }
  });
});

describe("validatePriceSelection — server rejects client-supplied mismatches", () => {
  it("accepts a selection that matches the server's own pricing table", () => {
    const result = validatePriceSelection({
      market: "US", module: "adults", interval: "monthly",
      amountMinorUnits: 999, currency: "USD",
    });
    expect(result.valid).toBe(true);
  });

  it("rejects a currency mismatch", () => {
    const result = validatePriceSelection({
      market: "IN", module: "adults", interval: "monthly",
      amountMinorUnits: 39900, currency: "USD", // should be INR
    });
    expect(result).toEqual({ valid: false, reason: expect.stringContaining("Currency mismatch") });
  });

  it("rejects a price mismatch (client tampering with amount)", () => {
    const result = validatePriceSelection({
      market: "US", module: "gym", interval: "monthly",
      amountMinorUnits: 1, currency: "USD", // tampered — real price is 2499
    });
    expect(result).toEqual({ valid: false, reason: expect.stringContaining("Price mismatch") });
  });

  it("rejects an unknown market", () => {
    const result = validatePriceSelection({
      market: "FR", module: "adults", interval: "monthly",
      amountMinorUnits: 999, currency: "USD",
    });
    expect(result.valid).toBe(false);
  });

  it("rejects an unknown module or interval", () => {
    expect(validatePriceSelection({
      market: "US", module: "premium", interval: "monthly", amountMinorUnits: 999, currency: "USD",
    }).valid).toBe(false);
    expect(validatePriceSelection({
      market: "US", module: "adults", interval: "weekly", amountMinorUnits: 999, currency: "USD",
    }).valid).toBe(false);
  });
});
