import { headers } from "next/headers";
import { getIpCountry, resolveBillingMarket, type ResolvedBilling } from "./market";

export interface RequestBillingMarket extends ResolvedBilling {
  /** Cloudflare's cf-ipcountry for this request, if usable. */
  ipCountry: string | null;
}

/**
 * The current request's billing market, from the visitor's IP country
 * alone (Cloudflare's cf-ipcountry; INTL when it's missing). Every price
 * shown on the site and every checkout resolves the market here, so a price
 * shown is the price charged.
 *
 * There is deliberately no way for a visitor to pick their country: India's
 * prices are far lower, and a picker let anyone choose them. What stops a
 * VPN user with an Indian IP is the payment side. India checkout runs on
 * Razorpay, and international card payments are off on that account, so
 * only Indian cards (and UPI) can pay an India price.
 */
export async function resolveRequestBillingMarket(): Promise<RequestBillingMarket> {
  const ipCountry = getIpCountry(await headers());
  return { ...resolveBillingMarket({ ipCountry }), ipCountry };
}
