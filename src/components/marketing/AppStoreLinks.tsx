import Image from "next/image";

/** Store badges for the Tistra Health mobile app.
 *
 * Both are the official artwork as SVG, self-hosted. The Play badge was
 * previously the 646x250 PNG Google serves from its badge endpoint — that
 * file is 8-bit paletted and carries a grey keyline, so it banded on the
 * logo and read as low quality next to everything else on the page. SVG
 * fixes it at any density.
 *
 * Both badges link to live listings as of the iOS release (2026-09-21) —
 * until then the App Store one was dimmed and captioned "Coming soon",
 * since Apple supplies the badge for linking to a real listing.
 */
const PLAY_URL = "https://play.google.com/store/apps/details?id=com.tistrahealth.app";

/** Apple's campaign parameters (ct) only attribute alongside a provider
 * token from App Store Connect, which this app does not have set up — so
 * unlike the Play link there is nothing useful to append here. */
const APP_STORE_URL = "https://apps.apple.com/app/tistra-health/id6811860460";

/** Rendered heights. The two badges have different intrinsic ratios —
 * 180:53.333 for Play, 119.66:40 for Apple — so matching them on height
 * rather than width is what puts them on one visual baseline. */
const BADGE_HEIGHT = 44;

export function AppStoreLinks({
  className = "",
  /** "dark" flips the caption for a coloured hero. The badges themselves
   * are black-on-transparent and read correctly on either. */
  tone = "light",
  /** Appended to the Play URL's utm_campaign so Play Console acquisition
   * reports can tell the three pages apart. */
  source,
}: {
  className?: string;
  tone?: "light" | "dark";
  source: string;
}) {
  const dark = tone === "dark";
  const href = `${PLAY_URL}&utm_source=tistrahealth&utm_medium=web&utm_campaign=${encodeURIComponent(source)}`;

  return (
    <div className={className}>
      <p className="text-[13px] font-medium" style={{ color: dark ? "rgba(255,255,255,0.85)" : "#4A4455" }}>
        For a better experience, download our app
      </p>

      <div className="mt-2.5 flex flex-wrap items-start gap-3">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Get Tistra Health on Google Play"
          className="inline-block rounded-lg transition-opacity hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Image
            src="/store/google-play-badge.svg"
            alt="Get it on Google Play"
            width={180}
            height={53}
            style={{ height: BADGE_HEIGHT, width: "auto" }}
            priority={false}
          />
        </a>

        <a
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Download Tistra Health on the App Store"
          className="inline-block rounded-lg transition-opacity hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Image
            src="/store/app-store-badge.svg"
            alt="Download on the App Store"
            width={120}
            height={40}
            style={{ height: BADGE_HEIGHT, width: "auto" }}
            priority={false}
          />
        </a>
      </div>
    </div>
  );
}
