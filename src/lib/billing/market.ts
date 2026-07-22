import type { BillingMarket } from "./pricing";

/** Reconstructs the request origin (scheme + host) for building Stripe/
 * Razorpay redirect URLs (success/cancel, billing portal return). Always
 * https in production (behind Cloudflare, which sets x-forwarded-proto),
 * but a local dev server only ever serves plain http — hardcoding https
 * would send provider redirects back to an https:// localhost URL the dev
 * server can't answer (ERR_SSL_PROTOCOL_ERROR). Falls back to checking for
 * a loopback host when x-forwarded-proto is absent (local dev). */
export function requestOrigin(headerStore: Headers): string {
  const host = headerStore.get("host") ?? "localhost:3001";
  const forwardedProto = headerStore.get("x-forwarded-proto");
  const isLocalHost = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const protocol = forwardedProto ?? (isLocalHost ? "http" : "https");
  return `${protocol}://${host}`;
}

const LAUNCH_COUNTRY_MARKETS: Record<string, BillingMarket> = {
  US: "US",
  SG: "SG",
  AU: "AU",
  IN: "IN",
};

/** ISO 3166-1 alpha-2 country code -> billing market. Every country outside
 * the 4 launch markets resolves to INTL (USD), and stays INTL even once the
 * user's actual country is known/confirmed — see spec: "For users outside
 * the four named launch countries, continue using INTL USD pricing even
 * after their actual country is selected." */
export function marketForCountry(countryCode: string | null | undefined): BillingMarket {
  if (!countryCode) return "INTL";
  return LAUNCH_COUNTRY_MARKETS[countryCode.toUpperCase()] ?? "INTL";
}

/**
 * Reads the trusted, server-set country header. On Cloudflare (Pages/Workers),
 * `cf-ipcountry` is set by Cloudflare's edge from the connecting IP and
 * cannot be spoofed by the client through normal request headers (Cloudflare
 * overwrites it). This must never be treated as a security boundary — it's
 * a UX default only. The actual billing country (collected explicitly, see
 * below) is what's used for tax/invoicing/compliance.
 */
export function getIpCountry(headers: Headers): string | null {
  const cfCountry = headers.get("cf-ipcountry");
  if (cfCountry && cfCountry !== "XX" && cfCountry !== "T1") return cfCountry.toUpperCase();
  return null;
}

export interface ResolvedBilling {
  market: BillingMarket;
  /** The country actually used to select the market — may be null if
   * nothing could be determined (falls back to INTL). */
  country: string | null;
  /** True if this came from a user confirmation rather than IP inference. */
  confirmed: boolean;
}

/**
 * Resolves the billing market + country to use for pricing display.
 * Precedence: user-confirmed country > billing-address-confirmed country >
 * IP-derived country > INTL fallback. IP detection is a UX default only —
 * never a security or entitlement boundary.
 */
export function resolveBillingMarket(params: {
  confirmedCountry?: string | null;
  billingAddressCountry?: string | null;
  ipCountry?: string | null;
}): ResolvedBilling {
  const country = params.billingAddressCountry ?? params.confirmedCountry ?? params.ipCountry ?? null;
  const confirmed = !!(params.billingAddressCountry ?? params.confirmedCountry);
  return { market: marketForCountry(country), country, confirmed };
}
