import { cookies, headers } from "next/headers";
import {
  CONSENT_COOKIE,
  consentDefaultPayload,
  consentRequiredFor,
  parseConsent,
  shouldShowBanner,
} from "@/lib/privacy/consent";
import { isClubHost } from "@/lib/club/host";
import { isCoachHost } from "@/lib/coach/routes";
import { ConsentBanner } from "./ConsentBanner";

/** GA4 for Tistra Health.
 *
 * Separate from GoogleAdsTag, and on a separate GA4 property, for the
 * reason that component already gives: analytics covering a different
 * surface than the ads cannot explain them. The coach property exists to
 * explain coach ad spend; folding Health's traffic into it would leave
 * neither question answerable. No ad spend points at Health, so there is
 * no Ads ID here — this is measurement only.
 *
 * Unset by default. With no measurement id configured nothing renders and
 * nothing is collected, which is the right posture for an env var that has
 * to be set per environment: a missing id must mean "no analytics", never
 * "analytics into whichever property was hardcoded".
 */
const GA4_HEALTH_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA4_HEALTH_MEASUREMENT_ID;

export async function HealthAnalyticsTag() {
  if (!GA4_HEALTH_MEASUREMENT_ID) return null;

  const headerStore = await headers();
  const host = headerStore.get("host");

  // The (public) route group serves Tistra Health, the club marketplace and
  // the coach landing pages from one set of routes, chosen by host. Those
  // other two already carry GoogleAdsTag, so tagging them here would both
  // double-load gtag and report their traffic into Health's property.
  if (isCoachHost(host) || isClubHost(host)) return null;

  // cf-ipcountry is set by Cloudflare's edge and cannot be spoofed through a
  // normal request header. A UX/compliance default, never a security
  // boundary — same posture as GoogleAdsTag and billing's country detection.
  const required = consentRequiredFor(headerStore.get("cf-ipcountry"));
  const cookieStore = await cookies();
  const stored = parseConsent(cookieStore.get(CONSENT_COOKIE)?.value);

  // ONE inline script, for the ordering reason GoogleAdsTag documents:
  // Consent Mode's 'default' must be processed before any config, and React
  // hoists <script async src> into the head independently of where the JSX
  // sits. Keeping the queue init, the consent default and the config
  // together makes their order a property of the script, not of hoisting.
  const bootstrap = `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent','default',${consentDefaultPayload({ required, stored })});
gtag('js', new Date());
gtag('config', '${GA4_HEALTH_MEASUREMENT_ID}');`;

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: bootstrap }} />
      {/* Plain <script>, not next/script — see GoogleAdsTag for why. */}
      <script async src={`https://www.googletagmanager.com/gtag/js?id=${GA4_HEALTH_MEASUREMENT_ID}`} />
      {shouldShowBanner({ required, stored }) && <ConsentBanner />}
    </>
  );
}
