import { displayEmail } from "@/lib/auth";
import { enhancedConversionsAllowed } from "./consent";
import type { ConsentState } from "./consent";

/** The `gtag('set', 'user_data', …)` line for enhanced conversions, or ""
 * when nothing may be sent.
 *
 * Google Ads recommended moving from automatic to in-page collection, and
 * it was right for a specific reason: automatic enhanced conversions
 * scrape the conversion page's DOM for an email field, and the page this
 * runs on — a "your profile is live" confirmation — has no inputs at all.
 * Automatic collection was contributing nothing, which is exactly the
 * coverage gap Ads reported.
 *
 * The address is passed to gtag in the clear; gtag normalises and SHA-256s
 * it in the browser, so the raw address never leaves the device. It is the
 * coach's own address, on their own authenticated, noindex page.
 *
 * Returning "" rather than a denied payload is deliberate. Not emitting is
 * stronger than emitting and trusting Consent Mode to withhold it, and it
 * is auditable: you can read the page source and see nothing was sent.
 */
export function userDataScript(
  email: string | null | undefined,
  consent: { required: boolean; stored: ConsentState }
): string {
  if (!enhancedConversionsAllowed(consent)) return "";
  if (!email) return "";

  // Strip any +nutriai- product scope. Coach accounts are unscoped today,
  // but a scoped address would hash to something Google can never match
  // against a real account.
  const clean = displayEmail(email).trim().toLowerCase();
  if (!clean.includes("@") || clean.startsWith("@") || clean.endsWith("@")) return "";

  // JSON.stringify escapes quotes and backslashes; the < escape stops
  // a crafted local-part from closing the script tag early.
  const json = JSON.stringify({ email: clean }).replace(/</g, "\\u003c");

  // Must precede the conversion event: gtag applies a user_data set to
  // subsequent events, not to one already queued.
  return `gtag('set', 'user_data', ${json});\n`;
}
