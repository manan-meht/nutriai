import Image from "next/image";
import { T } from "./coach-theme";
import { COACH_MARKET, type CoachMarket } from "@/lib/landing/coach-market";

/** "What do you coach?" — the discipline grid.
 *
 * Image-led on purpose: a coach recognises their own discipline in a photo
 * faster than they read a list, and the whole point of the section is that
 * they see themselves on the page within the first scroll.
 *
 * The four hero categories use the discipline photography already in
 * public/coach-photos, which the marketplace uses as placeholder coach
 * portraits. They are honest depictions of each discipline but they show a
 * single person rather than a coach teaching someone — see the asset notes
 * in the handover. Swapping them is a file replacement, not a code change.
 */
export interface Category {
  slug: string;
  label: string;
  image: string;
  /** Describes the photograph, not the category — the label is already
   * readable text next to it. */
  alt: string;
}

/** The rest, as text chips. Read from the same discipline vocabulary the
 * marketplace filters on, so a coach never sees a category here that they
 * cannot then pick in settings. */
export const MORE = [
  "Yoga", "Muay Thai", "Dance", "Latin Dance", "Mobility",
  "Boxing", "Calisthenics", "Acrobatics", "Pole", "Running",
  "Older Adult Strength", "Inline Skating",
] as const;

export function CategoryCards({ market = COACH_MARKET }: { market?: CoachMarket }) {
  const featured = market.featured;
  return (
    <>
      <div className={`grid grid-cols-2 gap-3 md:gap-4 ${featured.length > 2 ? "md:grid-cols-4" : "md:grid-cols-2"}`}>
        {featured.map((c, i) => (
          <a
            key={c.slug}
            href={`https://tistra.club/coaches?skill=${c.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative block overflow-hidden rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ outlineColor: T.primary }}
          >
            <div className="relative aspect-[3/4] w-full">
              <Image
                src={c.image}
                alt={c.alt}
                fill
                sizes="(max-width: 768px) 50vw, 25vw"
                // Only the first two are near the fold on a phone.
                loading={i < 2 ? "eager" : "lazy"}
                className="object-cover transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.04]"
              />
              {/* Gradient rather than a flat scrim: keeps the face lit while
                  still giving the label a solid ground to sit on. */}
              <div
                aria-hidden="true"
                className="absolute inset-0"
                style={{ background: "linear-gradient(to top, rgba(10,10,10,0.92) 0%, rgba(10,10,10,0.35) 42%, rgba(10,10,10,0) 70%)" }}
              />
              <span
                className="absolute inset-x-3 bottom-3 text-[15px] font-bold uppercase leading-tight tracking-[0.01em] md:inset-x-4 md:bottom-4 md:text-[19px]"
                style={{ color: T.onSurface }}
              >
                {c.label}
              </span>
            </div>
          </a>
        ))}
      </div>

      {/* Deliberately larger than the Stitch reference, where these were
          barely legible at 11px. */}
      <ul className="mt-6 flex flex-wrap gap-2 md:mt-7 md:gap-2.5">
        {MORE.map((label) => (
          <li key={label}>
            <span
              className="inline-flex items-center rounded-full border px-3.5 py-2 text-[14px] font-medium"
              style={{ borderColor: T.outlineVariant, color: T.onSurface, backgroundColor: T.surfaceContainer }}
            >
              {label}
            </span>
          </li>
        ))}
        <li>
          <span
            className="inline-flex items-center rounded-full px-3.5 py-2 text-[14px] font-semibold"
            style={{ backgroundColor: T.primary, color: T.onPrimary }}
          >
            + your skill
          </span>
        </li>
      </ul>
    </>
  );
}
