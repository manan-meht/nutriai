import Script from "next/script";

/** Google Ads global site tag.
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

export function GoogleAdsTag() {
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-ads-base" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GOOGLE_ADS_ID}');
        `}
      </Script>
    </>
  );
}
