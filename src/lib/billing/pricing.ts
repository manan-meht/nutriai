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
 * bookkeeping, RLS, or anything besides "which price ID to charge."
 *
 * "additional_person" is used for the Stripe/global path, where the
 * add-on's amount is identical across family/coach in every non-IN market —
 * one shared price ID per market is enough. "additional_person_family"/
 * "additional_person_coach" exist only for the Razorpay/IN path, where the
 * amounts genuinely differ per plan (see ADDITIONAL_PERSON_PRICE.IN) and so
 * need distinct Razorpay Plan objects/price IDs. */
export type BillingPricingTier = BillingModule | "self" | "additional_person" | "additional_person_family" | "additional_person_coach";

export interface PricePoint {
  /** Integer minor units (cents/paise) — e.g. 999 = $9.99. */
  amountMinorUnits: number;
  currency: string; // ISO 4217
  /** Present only when a limited-time launch/introductory price is active —
   * the non-discounted reference price to show crossed out. amountMinorUnits
   * always stays the one true "what's actually charged" figure (used as-is
   * by validatePriceSelection/checkout/price-ID lookups below); this field
   * is display-only. Removing a launch offer later is a one-line change
   * (drop this field, bump amountMinorUnits to the standard price) — no UI
   * changes needed, since display logic only checks whether this is set. */
  standardAmountMinorUnits?: number;
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
  // India launch pricing. Family annual and Self annual (see SELF_PRICING
  // below) currently bill the discounted "India launch" amount — see
  // standardAmountMinorUnits on PricePoint for how the crossed-out
  // reference price and eventual removal of the launch offer both work.
  // Coach has no launch discount.
  IN: {
    adults: {
      monthly: { amountMinorUnits: 49900, currency: "INR" },
      annual: { amountMinorUnits: 299900, currency: "INR", standardAmountMinorUnits: 399900 },
    },
    gym: {
      monthly: { amountMinorUnits: 99900, currency: "INR" },
      annual: { amountMinorUnits: 899900, currency: "INR" },
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
  // India launch pricing — annual bills the discounted launch price today;
  // see standardAmountMinorUnits on PricePoint.
  IN: { monthly: { amountMinorUnits: 29900, currency: "INR" }, annual: { amountMinorUnits: 179900, currency: "INR", standardAmountMinorUnits: 249900 } },
  INTL: { monthly: { amountMinorUnits: 499, currency: "USD" }, annual: { amountMinorUnits: 4900, currency: "USD" } },
};

export type BillingPlan = "self" | "family" | "coach";

/** Plan (not just BillingPlan) that has an additional-person/client concept
 * — Self is always exactly 1 person, so it's excluded here. */
export type AdditionalCapacityPlan = "family" | "coach";

/** Additional tracked person, billed per-person, on top of a plan's base
 * included count — real, confirmed prices (matches the founding-member
 * marketing table's US$3.33/mo). Identical between family/coach in every
 * market except IN, where each is set proportionally to its own plan's base
 * price (see PEOPLE_INCLUDED for the base included count each is added on
 * top of). Wired into checkout via BillingPricingTier "additional_person"
 * (Stripe, shared across plans) or "additional_person_family"/
 * "additional_person_coach" (Razorpay/IN, where the amounts actually
 * differ) — see purchaseAdditionalCapacity in src/app/actions/checkout.ts. */
export const ADDITIONAL_PERSON_PRICE: Record<BillingMarket, Record<AdditionalCapacityPlan, Record<BillingInterval, PricePoint>>> = {
  US: {
    family: { monthly: { amountMinorUnits: 333, currency: "USD" }, annual: { amountMinorUnits: 3330, currency: "USD" } },
    coach: { monthly: { amountMinorUnits: 333, currency: "USD" }, annual: { amountMinorUnits: 3330, currency: "USD" } },
  },
  SG: {
    family: { monthly: { amountMinorUnits: 430, currency: "SGD" }, annual: { amountMinorUnits: 4300, currency: "SGD" } },
    coach: { monthly: { amountMinorUnits: 430, currency: "SGD" }, annual: { amountMinorUnits: 4300, currency: "SGD" } },
  },
  AU: {
    family: { monthly: { amountMinorUnits: 499, currency: "AUD" }, annual: { amountMinorUnits: 4990, currency: "AUD" } },
    coach: { monthly: { amountMinorUnits: 499, currency: "AUD" }, annual: { amountMinorUnits: 4990, currency: "AUD" } },
  },
  // India: proportional to each plan's own base price (see PRICING.IN /
  // SELF_PRICING.IN above) rather than shared flat — Family +₹249/mo
  // (~50% of its ₹499 base), Coach +₹199/mo (~20% of its ₹999 base).
  IN: {
    family: { monthly: { amountMinorUnits: 24900, currency: "INR" }, annual: { amountMinorUnits: 249000, currency: "INR" } },
    coach: { monthly: { amountMinorUnits: 19900, currency: "INR" }, annual: { amountMinorUnits: 199000, currency: "INR" } },
  },
  INTL: {
    family: { monthly: { amountMinorUnits: 333, currency: "USD" }, annual: { amountMinorUnits: 3330, currency: "USD" } },
    coach: { monthly: { amountMinorUnits: 333, currency: "USD" }, annual: { amountMinorUnits: 3330, currency: "USD" } },
  },
};

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

export function getAdditionalPersonPrice(market: BillingMarket, plan: AdditionalCapacityPlan, interval: BillingInterval): PricePoint {
  return ADDITIONAL_PERSON_PRICE[market][plan][interval];
}

// Trial length by module — "adults" covers both Self and Family workspaces
// (both get 14 days, so no further split is needed there), "gym" is Coach
// (30 days). Global, not India-specific: applies to every market. Lives
// here (not entitlements.ts) because entitlements.ts transitively imports
// server-only code (next/headers via @/lib/supabase/server) and this table
// needs to be importable from client components (e.g. IndiaPricingSection)
// that only need the plain numbers, not the server-side entitlement logic.
export const TRIAL_LENGTH_DAYS_BY_MODULE: Record<BillingModule, number> = {
  adults: 14,
  gym: 30,
};

export function trialLengthMs(module: BillingModule): number {
  return TRIAL_LENGTH_DAYS_BY_MODULE[module] * 24 * 60 * 60 * 1000;
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

/** Same idea as formatMinorUnits, but whole-rupee (no ".00") for INR —
 * e.g. ₹1,799 rather than ₹1,799.00 — matching how India prices are
 * actually communicated. Every other currency keeps formatMinorUnits'
 * standard 2-decimal formatting; call sites that don't know the currency
 * ahead of time can call this unconditionally, since it only special-cases
 * INR and otherwise delegates straight to formatMinorUnits. */
export function formatPriceForDisplay(amountMinorUnits: number, currency: string): string {
  if (currency === "INR") {
    const amount = amountMinorUnits / 100;
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
  }
  return formatMinorUnits(amountMinorUnits, currency);
}

/** India consumer prices are already GST-inclusive gross amounts — this is
 * the one place this disclosure copy lives, reused everywhere an India
 * price is shown, so a customer is never shown a base price only to have
 * 18% added at checkout. No GST filing/accounting logic here — display copy
 * only; actual tax accounting is handled by the payment provider/billing
 * system separately. */
export const INDIA_TAX_INCLUSIVE_NOTE = "Including applicable taxes";

/** Display label for a plan's IN annual price when a launch offer is active
 * (i.e. standardAmountMinorUnits is set) — the one place this copy lives. */
export const INDIA_LAUNCH_PRICE_LABEL = "India launch price";

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
