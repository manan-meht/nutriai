// Server-authoritative pricing configuration. Prices are integer minor
// units (cents for USD/SGD/AUD, paise for INR) — never floats — and must be
// looked up server-side for checkout/webhook processing. The browser must
// never be trusted to supply a price, plan, or currency; see
// validatePriceSelection() below, used at checkout time.

export type BillingMarket = "US" | "SG" | "AU" | "IN" | "INTL";
export type BillingModule = "adults" | "gym";
export type BillingInterval = "monthly" | "annual";

export interface PricePoint {
  /** Integer minor units (cents/paise) — e.g. 999 = $9.99. */
  amountMinorUnits: number;
  currency: string; // ISO 4217
}

type MarketPricing = Record<BillingModule, Record<BillingInterval, PricePoint>>;

// Introductory pricing per your spec. INTL always bills in USD and is never
// dynamically converted — see the disclosure copy in INTL_USD_DISCLOSURE.
export const PRICING: Record<BillingMarket, MarketPricing> = {
  US: {
    adults: {
      monthly: { amountMinorUnits: 999, currency: "USD" },
      annual: { amountMinorUnits: 9900, currency: "USD" },
    },
    gym: {
      monthly: { amountMinorUnits: 2499, currency: "USD" },
      annual: { amountMinorUnits: 24900, currency: "USD" },
    },
  },
  SG: {
    adults: {
      monthly: { amountMinorUnits: 1290, currency: "SGD" },
      annual: { amountMinorUnits: 12900, currency: "SGD" },
    },
    gym: {
      monthly: { amountMinorUnits: 3290, currency: "SGD" },
      annual: { amountMinorUnits: 32900, currency: "SGD" },
    },
  },
  AU: {
    adults: {
      monthly: { amountMinorUnits: 1499, currency: "AUD" },
      annual: { amountMinorUnits: 14900, currency: "AUD" },
    },
    gym: {
      monthly: { amountMinorUnits: 3999, currency: "AUD" },
      annual: { amountMinorUnits: 39900, currency: "AUD" },
    },
  },
  IN: {
    adults: {
      monthly: { amountMinorUnits: 39900, currency: "INR" },
      annual: { amountMinorUnits: 399900, currency: "INR" },
    },
    gym: {
      monthly: { amountMinorUnits: 129900, currency: "INR" },
      annual: { amountMinorUnits: 1299900, currency: "INR" },
    },
  },
  // INTL: every country outside the 4 launch markets. Always USD, same
  // amounts as the US price points — never classify these users as "US".
  INTL: {
    adults: {
      monthly: { amountMinorUnits: 999, currency: "USD" },
      annual: { amountMinorUnits: 9900, currency: "USD" },
    },
    gym: {
      monthly: { amountMinorUnits: 2499, currency: "USD" },
      annual: { amountMinorUnits: 24900, currency: "USD" },
    },
  },
};

export const INTL_USD_DISCLOSURE =
  "Your payment will be processed in US dollars. Your bank or card provider may apply currency-conversion or foreign-transaction fees.";

export function getPrice(market: BillingMarket, module: BillingModule, interval: BillingInterval): PricePoint {
  return PRICING[market][module][interval];
}

/** Annual savings vs. paying monthly for 12 months, as a fraction (e.g. ~0.17 for "2 months free"). */
export function annualSavingsFraction(market: BillingMarket, module: BillingModule): number {
  const { monthly, annual } = PRICING[market][module];
  const monthlyAnnualized = monthly.amountMinorUnits * 12;
  return (monthlyAnnualized - annual.amountMinorUnits) / monthlyAnnualized;
}

export function formatMinorUnits(amountMinorUnits: number, currency: string): string {
  const amount = amountMinorUnits / 100;
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(amount);
}

/**
 * Server-side validation for checkout: rejects any client-supplied
 * market/module/interval/amount/currency combination that doesn't exactly
 * match the server's own pricing table. Never trust a price, plan, or
 * currency submitted by the browser — always re-derive and compare.
 */
export function validatePriceSelection(input: {
  market: string;
  module: string;
  interval: string;
  amountMinorUnits: number;
  currency: string;
}): { valid: true } | { valid: false; reason: string } {
  const { market, module, interval, amountMinorUnits, currency } = input;

  if (!(market in PRICING)) return { valid: false, reason: `Unknown market: ${market}` };
  const marketPricing = PRICING[market as BillingMarket];

  if (module !== "adults" && module !== "gym") return { valid: false, reason: `Unknown module: ${module}` };
  if (interval !== "monthly" && interval !== "annual") return { valid: false, reason: `Unknown interval: ${interval}` };

  const expected = marketPricing[module as BillingModule][interval as BillingInterval];
  if (expected.currency !== currency) {
    return { valid: false, reason: `Currency mismatch: expected ${expected.currency}, got ${currency}` };
  }
  if (expected.amountMinorUnits !== amountMinorUnits) {
    return { valid: false, reason: `Price mismatch: expected ${expected.amountMinorUnits}, got ${amountMinorUnits}` };
  }

  return { valid: true };
}
