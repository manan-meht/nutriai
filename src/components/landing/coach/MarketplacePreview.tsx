import Link from "next/link";
import type { CoachPreview } from "@/lib/landing/coach-preview";
import { COACH_MARKET } from "@/lib/landing/coach-market";
import { SectionView } from "./SectionView";

/** Where clients actually see you — shown, not described.
 *
 * These are real published coaches from tistra.club, rendered in the shape
 * the consumer marketplace renders them. Two reasons it is not a screenshot:
 * a screenshot goes stale the day the marketplace changes, and it cannot
 * carry a real coach's real price and neighbourhood, which is the part that
 * makes the section persuasive rather than decorative.
 *
 * Deliberately little copy. The sequence — search a skill, see a coach,
 * open the profile, book — should be legible from the pictures alone.
 */

function priceLabel(cents: number | null, currency: string): string | null {
  if (cents == null) return null;
  const symbol = currency === "SGD" ? "S$" : COACH_MARKET.currencySymbol || `${currency} `;
  return `From ${symbol}${Math.round(cents / 100)}`;
}

function CoachCard({ coach }: { coach: CoachPreview }) {
  const price = priceLabel(coach.startingPriceCents, coach.currency);
  return (
    <div
      className="overflow-hidden rounded-2xl border"
      style={{ borderColor: "#CCC3D8", backgroundColor: "#FFFFFF" }}
    >
      <div className="aspect-square w-full overflow-hidden" style={{ backgroundColor: "#F4F2FD" }}>
        {coach.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed storage URL, not a static asset
          <img
            src={coach.photoUrl}
            alt={`${coach.displayName}, a coach on Tistra Club`}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
            style={{ objectPosition: "center 30%" }}
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-2xl font-semibold"
            style={{ color: "#CCC3D8" }}
            aria-hidden="true"
          >
            {coach.displayName.slice(0, 1)}
          </div>
        )}
      </div>
      <div className="p-3.5">
        <p className="text-[15px] font-semibold leading-5" style={{ color: "#1A1B22" }}>
          {coach.displayName}
        </p>
        {coach.skills.length > 0 && (
          <p className="mt-0.5 text-[13px] leading-5" style={{ color: "#4A4455" }}>
            {coach.skills.slice(0, 2).join(" · ")}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]" style={{ color: "#4A4455" }}>
          {coach.neighbourhood && <span>{coach.neighbourhood}</span>}
          {coach.neighbourhood && price && <span aria-hidden="true">·</span>}
          {price && <span className="font-medium" style={{ color: "#1A1B22" }}>{price}</span>}
        </div>
      </div>
    </div>
  );
}

/** The three moments of the client journey, as labels over the cards. */
const STEPS = ["Searches a skill", "Sees your profile", "Books a session"] as const;

export function MarketplacePreview({
  coaches,
  className = "",
}: {
  coaches: CoachPreview[];
  className?: string;
}) {
  if (coaches.length === 0) return null;

  return (
    <SectionView event="marketplace_preview_view" className={className}>
      <h2
        className="max-w-2xl text-[1.75rem] font-semibold leading-9 tracking-[-0.02em] text-balance md:text-[2.25rem] md:leading-[2.75rem]"
        style={{ color: "#1A1B22" }}
      >
        This is where clients discover you.
      </h2>

      <ol className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px]" style={{ color: "#4A4455" }}>
        {STEPS.map((step, i) => (
          <li key={step} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden="true">→</span>}
            <span>{step}</span>
          </li>
        ))}
      </ol>

      {/* The real marketplace surface, at the real URL, so a coach can go
          and check that it exists. */}
      <div
        className="mt-6 overflow-hidden rounded-3xl border p-4 md:p-6"
        style={{ borderColor: "#CCC3D8", backgroundColor: "#F4F2FD" }}
      >
        <div className="flex items-center gap-2 pb-4">
          <span className="flex gap-1.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#CCC3D8" }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#CCC3D8" }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#CCC3D8" }} />
          </span>
          <span
            className="truncate rounded-full px-3 py-1 text-[12px]"
            style={{ backgroundColor: "#FFFFFF", color: "#4A4455" }}
          >
            tistra.club/coaches
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
          {coaches.map((c, i) => (
            // The third card is noise on a phone; two read as a marketplace
            // just as well and keep the section short.
            <div key={c.id} className={i === 2 ? "hidden md:block" : ""}>
              <CoachCard coach={c} />
            </div>
          ))}
        </div>
      </div>

      <p className="mt-4 text-[14px]" style={{ color: "#4A4455" }}>
        Real coaches on Tistra Club today.{" "}
        <Link
          href="https://tistra.club/coaches"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium underline underline-offset-2"
          style={{ color: "#630ED4" }}
        >
          See the marketplace
        </Link>
      </p>
    </SectionView>
  );
}
