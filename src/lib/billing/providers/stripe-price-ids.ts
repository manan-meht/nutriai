import type { BillingMarket, BillingModule, BillingInterval } from "@/lib/billing/pricing";

/**
 * Env var name for a given (market, module, interval) Stripe Price ID, e.g.
 * STRIPE_PRICE_US_ADULTS_MONTHLY. Pure/testable — the actual env var lookup
 * happens in getStripePriceId, kept separate so the naming convention can
 * be unit tested without needing real env vars set.
 */
export function stripePriceEnvVarName(market: BillingMarket, module: BillingModule, interval: BillingInterval): string {
  return `STRIPE_PRICE_${market}_${module.toUpperCase()}_${interval.toUpperCase()}`;
}

export function getStripePriceId(market: BillingMarket, module: BillingModule, interval: BillingInterval): string {
  const envVar = stripePriceEnvVarName(market, module, interval);
  const priceId = process.env[envVar];
  if (!priceId) {
    throw new Error(`Missing Stripe price ID env var ${envVar} — configure it in the Stripe Dashboard and set it here.`);
  }
  return priceId;
}
