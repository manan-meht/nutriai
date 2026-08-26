import { CLUB_FAQ } from "@/lib/seo/club-faq";
import { CLUB_TOKENS as T } from "@/components/coach/tokens";

/** Tistra Club's FAQ, rendered from the same source as the FAQPage
 * JSON-LD on the marketplace page.
 *
 * Server-rendered with no animation wrapper, for the same reason as the
 * Health FAQ: a renderer that snapshots the page without scrolling must
 * still see the text. Each question is its own <h3> so the heading is the
 * retrieval key, and the one-sentence answer sits directly beneath it.
 *
 * Placed below the coach list rather than above it — a visitor who came to
 * browse should reach coaches first, and a crawler reads the whole
 * document regardless of order.
 */
export function ClubFaq() {
  return (
    <section
      id="faq"
      aria-labelledby="club-faq-heading"
      className="mt-14 border-t pt-10"
      style={{ borderColor: T.outlineVariant }}
    >
      <h2
        id="club-faq-heading"
        className="text-[1.5rem] font-semibold leading-8 tracking-[-0.02em] text-balance"
        style={{ color: T.onSurface }}
      >
        Booking a coach in Singapore
      </h2>
      <p className="mt-2 text-[15px]" style={{ color: T.onSurfaceVariant }}>
        What things cost, who travels to you, and what happens after you book.
      </p>

      <div className="mt-8 flex flex-col gap-4">
        {CLUB_FAQ.map((entry) => (
          <article
            key={entry.question}
            className="rounded-3xl p-5"
            style={{ backgroundColor: T.surfaceContainerLowest, border: `1px solid ${T.outlineVariant}` }}
          >
            <h3
              className="text-[17px] font-semibold leading-snug tracking-[-0.01em]"
              style={{ color: T.onSurface }}
            >
              {entry.question}
            </h3>

            {/* The quotable answer: first thing after the heading. */}
            <p
              className="mt-3 border-l-4 pl-4 text-[15px] font-medium leading-relaxed"
              style={{ borderColor: T.primary, color: T.onSurface }}
            >
              {entry.tldr}
            </p>

            <p className="mt-3 text-[15px] leading-relaxed" style={{ color: T.onSurfaceVariant }}>
              {entry.detail}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
