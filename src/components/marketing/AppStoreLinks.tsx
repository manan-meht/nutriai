import Image from "next/image";

/** Store badges for the Tistra Health mobile app.
 *
 * Both are the official artwork as SVG, self-hosted. The Play badge was
 * previously the 646x250 PNG Google serves from its badge endpoint — that
 * file is 8-bit paletted and carries a grey keyline, so it banded on the
 * logo and read as low quality next to everything else on the page. SVG
 * fixes it at any density.
 *
 * The App Store badge is shown but NOT linked: Tistra Health is on Google
 * Play and is not on the App Store. Apple supplies the badge for linking
 * to a live listing, so pointing it at nothing would be both against their
 * guidelines and a small lie to the visitor. It is presented at reduced
 * emphasis with "Coming soon" beside it until there is a listing to point
 * at, at which point this becomes an <a> and the note goes.
 */
const PLAY_URL = "https://play.google.com/store/apps/details?id=com.tistrahealth.app";

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

        {/* Not an <a>. There is no listing behind it yet.
            The label sits UNDER the badge rather than beside it for two
            reasons: it belongs to that badge and not to the pair, and
            beside it the row overflowed 390px and wrapped, which put the
            two stores on separate lines. */}
        <span className="inline-flex flex-col items-center gap-1">
          <Image
            src="/store/app-store-badge.svg"
            alt="Download on the App Store"
            width={120}
            height={40}
            // Dimmed enough to read as not-yet-available, not so far that
            // it reads as a failed image.
            style={{ height: BADGE_HEIGHT, width: "auto", opacity: 0.68 }}
            priority={false}
          />
          <span
            className="text-[11px] font-medium leading-none"
            style={{ color: dark ? "rgba(255,255,255,0.8)" : "#6B6478" }}
          >
            Coming soon
          </span>
        </span>
      </div>
    </div>
  );
}
