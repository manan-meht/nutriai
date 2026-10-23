import { headers } from "next/headers";
import { getConfirmedBillingCountry } from "./country-cookie";
import { getIpCountry, resolveBillingMarket, type ResolvedBilling } from "./market";

export interface RequestBillingMarket extends ResolvedBilling {
  /** Cloudflare's cf-ipcountry for this request, if usable. */
  ipCountry: string | null;
  /** The visitor's explicit choice from the country selector, if any. */
  confirmedCountry: string | null;
}

/**
 * The current request's billing market. This is the one resolution both the
 * public pricing page and checkout use, so a price shown from it is the
 * price checkout charges: the confirmed country cookie wins, then
 * Cloudflare's IP country, then INTL.
 */
export async function resolveRequestBillingMarket(): Promise<RequestBillingMarket> {
  const ipCountry = getIpCountry(await headers());
  const confirmedCountry = await getConfirmedBillingCountry();
  return { ...resolveBillingMarket({ confirmedCountry, ipCountry }), ipCountry, confirmedCountry };
}
