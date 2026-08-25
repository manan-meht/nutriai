"use client";

import { track } from "@/lib/landing/track";

/** The founding-coach offer, collapsed to a strip.
 *
 * It used to be a bordered box with three paragraphs sitting directly under
 * the hero CTA. That is a lot of reading demanded of someone who has not yet
 * decided they care about Tistra at all — the offer answers "why now", which
 * is the second question, not the first.
 *
 * Native <details>, not React state: it opens with JavaScript disabled, is
 * keyboard-operable and screen-reader-announced for free, and needs no
 * hydration to work. The click handler only reports the interaction.
 */
export function OfferDetails({ freeBookings, feePercent }: { freeBookings: number; feePercent: number }) {
  return (
    <details
      className="group mt-5 max-w-xl rounded-2xl border px-4 py-3"
      style={{ borderColor: "#CCC3D8", backgroundColor: "#EDE0FF" }}
      onToggle={(e) => {
        // Fires on open only — a close is not interest in the offer.
        if ((e.currentTarget as HTMLDetailsElement).open) track("founding_offer_details_click");
      }}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span className="min-w-0 text-[14px] leading-5">
          <span className="font-semibold" style={{ color: "#630ED4" }}>
            Founding Coach Offer ·{" "}
          </span>
          <span style={{ color: "#1A1B22" }}>Keep 100% of your first {freeBookings} bookings.</span>
        </span>
        <span
          className="shrink-0 whitespace-nowrap text-[13px] font-medium underline underline-offset-2"
          style={{ color: "#630ED4" }}
        >
          <span className="group-open:hidden">See offer details</span>
          <span className="hidden group-open:inline">Hide details</span>
        </span>
      </summary>
      <div className="mt-3 space-y-2 text-[14px] leading-6" style={{ color: "#4A4455" }}>
        <p>
          We&rsquo;re onboarding our first Singapore coaches before launch. Join now and we waive our
          commission on your first {freeBookings} bookings — locked in from the day you publish,
          however long they take to come.
        </p>
        <p>
          We&rsquo;re also running Google and Instagram campaigns to bring clients to the marketplace,
          so the profiles that are live at launch are the ones those clients find first.
        </p>
        <p>
          After those {freeBookings}, Tistra takes {feePercent}% only when you get paid — card
          processing included. No contract, no notice period, unpublish whenever you like.
        </p>
      </div>
    </details>
  );
}
