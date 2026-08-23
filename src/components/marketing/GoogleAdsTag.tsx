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
  // Plain <script>, not next/script.
  //
  // next/script's afterInteractive puts only a <link rel="preload"> in the
  // head and injects the real tag after hydration. The tag worked, but
  // Google's "test installation" check looks for the literal script it
  // gave you and reported the tag as not installed. React hoists an async
  // <script src> to the head, so this produces exactly what Google asks
  // for: the tag in the document head, in the served HTML.
  return (
    <>
      <script async src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`} />
      <script
        dangerouslySetInnerHTML={{
          __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GOOGLE_ADS_ID}');`,
        }}
      />
    </>
  );
}
