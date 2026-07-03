"use server";

import { setConfirmedBillingCountry } from "@/lib/billing/country-cookie";
import { marketForCountry } from "@/lib/billing/market";

/** Client-invocable action backing the country selector: persists the
 * user's explicit country choice, which overrides IP-based detection on
 * subsequent visits. Server-side re-validation still happens at checkout
 * time (see validatePriceSelection) — this cookie is a UX preference only. */
export async function confirmBillingCountry(countryCode: string): Promise<{ market: string }> {
  const normalized = countryCode.toUpperCase().trim();
  if (!/^[A-Z]{2}$/.test(normalized)) {
    throw new Error("Invalid country code");
  }
  await setConfirmedBillingCountry(normalized);
  return { market: marketForCountry(normalized) };
}
