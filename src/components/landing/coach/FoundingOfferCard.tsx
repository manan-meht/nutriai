import type { FoundingSpots as Spots } from "@/lib/landing/founding-spots";
import { FREE_BOOKINGS } from "@/lib/landing/coach-market";
import { FoundingSpotsLine, FoundingSpotsReason } from "./FoundingSpots";
import { TrackedCta } from "./TrackedCta";

/** The offer, as a card you can read in about four seconds.
 *
 * Every line is something we actually do. "Tistra-funded promotion" is a
 * commitment to spend, not to deliver enquiries — the difference is stated
 * rather than left to be inferred, because a coach who joins expecting
 * guaranteed clients is a coach who leaves angry, and says so.
 *
 * The free-booking count is imported from the engine that enforces it, so
 * this card cannot advertise a number checkout does not honour.
 */
const OFFER_LINES = [
  { strong: `0% commission on your first ${FREE_BOOKINGS} bookings`, rest: "" },
  { strong: "Tistra-funded promotion", rest: " of your profile" },
  { strong: "Personal help", rest: " setting up your profile" },
  { strong: "No monthly subscription", rest: "" },
  { strong: "No exclusivity", rest: "" },
] as const;

export function FoundingOfferCard({
  spots,
  signupHref,
  placement = "offer_card",
  className = "",
}: {
  spots: Spots;
  signupHref: string;
  /** Which copy of the card this is. Same event, different breakdown. */
  placement?: "offer_card" | "final";
  className?: string;
}) {
  return (
    <div
      className={`rounded-3xl border p-6 md:p-7 ${className}`}
      style={{ borderColor: "#CCC3D8", backgroundColor: "#FFFFFF" }}
    >
      <p
        className="text-[11px] font-semibold uppercase tracking-[0.09em]"
        style={{ color: "#630ED4" }}
      >
        Founding Coach offer
      </p>

      <ul className="mt-4 flex flex-col gap-2.5">
        {OFFER_LINES.map((line) => (
          <li key={line.strong} className="flex items-start gap-2.5 text-[15px] leading-6">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              className="mt-1 shrink-0"
              aria-hidden="true"
              fill="none"
              stroke="#630ED4"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 8.5l3.2 3.2L13 5" />
            </svg>
            <span style={{ color: "#1A1B22" }}>
              <span className="font-semibold">{line.strong}</span>
              {line.rest}
            </span>
          </li>
        ))}
      </ul>

      <TrackedCta
        href={signupHref}
        event="founding_cta_click"
        props={{ placement, foundingSpotsRemaining: spots.remaining }}
        className="mt-6 flex w-full items-center justify-center rounded-full px-6 py-3.5 text-[16px] font-medium text-white"
        style={{ backgroundColor: "#630ED4" }}
      >
        Claim my Founding Coach spot
      </TrackedCta>

      <p className="mt-3 text-center text-[13px]" style={{ color: "#4A4455" }}>
        Free to join · No card required · No monthly fee
      </p>

      {spots.available && (
        <div className="mt-5 border-t pt-4" style={{ borderColor: "#CCC3D8" }}>
          <FoundingSpotsLine spots={spots} />
          <FoundingSpotsReason className="mt-1.5" />
        </div>
      )}
    </div>
  );
}
