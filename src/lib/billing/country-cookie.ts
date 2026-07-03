import { cookies } from "next/headers";

// Server-only helpers (next/headers) — not a client-callable server action
// file. See src/app/actions/billing.ts for the client-invocable mutation.
//
// Stores only the confirmed billing country/market — never the user's raw
// IP address (we don't want or need it beyond the single request where
// Cloudflare's cf-ipcountry header is read; nothing IP-derived is persisted).
const COUNTRY_COOKIE = "tistra_billing_country";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export async function getConfirmedBillingCountry(): Promise<string | null> {
  const store = await cookies();
  return store.get(COUNTRY_COOKIE)?.value ?? null;
}

/**
 * Persists the user's explicit country selection (from the country
 * selector), which overrides IP-based detection on subsequent visits.
 * This is a UX preference only — checkout must still validate the price
 * server-side (see validatePriceSelection) rather than trusting this cookie.
 */
export async function setConfirmedBillingCountry(countryCode: string): Promise<void> {
  const store = await cookies();
  store.set(COUNTRY_COOKIE, countryCode.toUpperCase(), {
    maxAge: COOKIE_MAX_AGE,
    httpOnly: false,
    sameSite: "lax",
    path: "/",
  });
}
