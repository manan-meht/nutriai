// Server-authoritative pricing configuration. Prices are integer minor
// units (cents for USD/SGD/AUD, paise for INR) — never floats — and must be
// looked up server-side for checkout/webhook processing. The browser must
// never be trusted to supply a price, plan, or currency; see
// validatePriceSelection() below, used at checkout time.

export type BillingMarket = "US" | "SG" | "AU" | "IN" | "INTL";
export type BillingModule = "adults" | "gym";
export type BillingInterval = "monthly" | "annual";

/** Which price/price-ID a checkout should actually charge — distinct from
 * BillingModule (the entitlement/workspace-type dimension, "adults" vs
 * "gym"). Self and Family are both `module: "adults"` workspaces (one
 * entitlement row, same trial/subscription lifecycle), but are billed at
 * different amounts — see SELF_PRICING vs PRICING.adults below, and
 * createCheckoutSession's `pricingTier` computation, which is the only
 * place this distinction is ever made. Never used for entitlement
 * bookkeeping, RLS, or anything besides "which price ID to charge." */
export type BillingPricingTier = BillingModule | "self";

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

// ---- Self-tracking plan (base = 1 person) + per-person add-ons ----
// Real, confirmed prices (matches the founding-member marketing table in
// src/lib/pricing/founding-member.ts's US $4.99/mo number exactly) — wired
// into validatePriceSelection() and createCheckoutSession() below via
// BillingPricingTier "self", same as the adults/gym tiers.
export const SELF_PRICING: Record<BillingMarket, Record<BillingInterval, PricePoint>> = {
  US: { monthly: { amountMinorUnits: 499, currency: "USD" }, annual: { amountMinorUnits: 4900, currency: "USD" } },
  SG: { monthly: { amountMinorUnits: 690, currency: "SGD" }, annual: { amountMinorUnits: 6900, currency: "SGD" } },
  AU: { monthly: { amountMinorUnits: 799, currency: "AUD" }, annual: { amountMinorUnits: 7900, currency: "AUD" } },
  IN: { monthly: { amountMinorUnits: 19900, currency: "INR" }, annual: { amountMinorUnits: 199900, currency: "INR" } },
  INTL: { monthly: { amountMinorUnits: 499, currency: "USD" }, annual: { amountMinorUnits: 4900, currency: "USD" } },
};

/** Additional tracked person, billed per-person, on top of a plan's base
 * included count. Shared across self/family/coach since the "add one more
 * person" concept is identical; only the base included count (see
 * PEOPLE_INCLUDED) differs per plan. Not yet wired into checkout (no
 * per-additional-person Stripe price IDs exist) — extra capacity is
 * currently sold as a manual/support-assisted add-on, not self-serve. */
export const ADDITIONAL_PERSON_PRICE: Record<BillingMarket, Record<BillingInterval, PricePoint>> = {
  US: { monthly: { amountMinorUnits: 299, currency: "USD" }, annual: { amountMinorUnits: 2900, currency: "USD" } }, // PLACEHOLDER
  SG: { monthly: { amountMinorUnits: 390, currency: "SGD" }, annual: { amountMinorUnits: 3900, currency: "SGD" } }, // PLACEHOLDER
  AU: { monthly: { amountMinorUnits: 450, currency: "AUD" }, annual: { amountMinorUnits: 4500, currency: "AUD" } }, // PLACEHOLDER
  IN: { monthly: { amountMinorUnits: 9900, currency: "INR" }, annual: { amountMinorUnits: 99900, currency: "INR" } }, // PLACEHOLDER
  INTL: { monthly: { amountMinorUnits: 299, currency: "USD" }, annual: { amountMinorUnits: 2900, currency: "USD" } }, // PLACEHOLDER
};

export type BillingPlan = "self" | "family" | "coach";

/** Base tracked-people count included in each plan before add-on pricing
 * kicks in. "family"/"coach" match the existing hardcoded limits in
 * src/lib/limits.ts and the DB triggers (migrations 0002-0004, 0009) —
 * kept here too so pricing copy and enforcement never drift apart. */
export const PEOPLE_INCLUDED: Record<BillingPlan, number> = {
  self: 1,
  family: 2,
  coach: 5,
};

export function getSelfPrice(market: BillingMarket, interval: BillingInterval): PricePoint {
  return SELF_PRICING[market][interval];
}

export function getAdditionalPersonPrice(market: BillingMarket, interval: BillingInterval): PricePoint {
  return ADDITIONAL_PERSON_PRICE[market][interval];
}

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
