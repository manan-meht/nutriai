import { cookies, headers } from "next/headers";
import {
  CONSENT_COOKIE,
  consentDefaultPayload,
  consentRequiredFor,
  parseConsent,
  shouldShowBanner,
} from "@/lib/privacy/consent";
import { ConsentBanner } from "./ConsentBanner";

/** The Google tag: Google Ads plus GA4, from one loader.
 *
 * Google's install instructions say to paste its snippet on every page and
 * to keep one tag per page. Those two instructions conflict once a tag
 * already exists — pasting the GA4 snippet verbatim would put a SECOND
 * gtag/js loader on the page. One loader can serve several destinations, so
 * GA4 is added as another config command here instead.
 *
 * The loader still requests the Ads ID. Google's "test installation" check
 * looks for the account it gave you, and that check has already reported
 * this tag missing twice; there is no reason to make it hunt again.
 *
 * Belongs on every page an ad click can land on, NOT only on the
 * conversion page. The click arrives carrying a gclid, and this tag is what
 * writes it into a first-party _gcl_aw cookie; without it on the landing
 * page there is nothing to attribute a later conversion to, and Google's
 * own "test installation" check reports the tag as missing because it
 * fetches the domain root.
 *
 * Loading the tag is not a conversion. Counting one requires a separate
 * event carrying a conversion label, which fires on /settings/published
 * only — see that page.
 */
export const GOOGLE_ADS_ID = "AW-18404074450";

/** GA4 measurement ID. Scoped to the same surfaces as the Ads tag — the
 * club marketplace and the coach product — which is deliberate: analytics
 * that covers a different surface than the ads cannot explain them. Tistra
 * Health carries no Google tag at all and is not measured here. */
export const GA4_MEASUREMENT_ID = "G-HWYL5L7KL2";

export async function GoogleAdsTag() {
  // cf-ipcountry is set by Cloudflare's edge and cannot be spoofed through a
  // normal request header. This is a UX/compliance default, never a security
  // boundary — the same posture as billing's country detection.
  const headerStore = await headers();
  const country = headerStore.get("cf-ipcountry");
  const required = consentRequiredFor(country);

  const cookieStore = await cookies();
  const stored = parseConsent(cookieStore.get(CONSENT_COOKIE)?.value);

  // ONE inline script, deliberately.
  //
  // Consent Mode is order-sensitive: the 'default' command must be processed
  // before any config or event, or the tag fires under the wrong state. React
  // hoists <script async src> into the head independently of where the JSX
  // sits, so relying on the loader landing after a separate inline script
  // would be relying on undefined ordering. Keeping the queue init, the
  // consent default and the config in a single script makes their relative
  // order a property of the script itself rather than of React's hoisting.
  const bootstrap = `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent','default',${consentDefaultPayload({ required, stored })});
gtag('js', new Date());
gtag('config', '${GOOGLE_ADS_ID}');
gtag('config', '${GA4_MEASUREMENT_ID}');`;

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: bootstrap }} />
      {/* Plain <script>, not next/script: next/script's afterInteractive
          emits only a <link rel="preload"> into the head and injects the real
          tag after hydration, and Google's "test installation" check looks
          for the literal script it gave you. */}
      <script async src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`} />
      {shouldShowBanner({ required, stored }) && <ConsentBanner />}
    </>
  );
}
