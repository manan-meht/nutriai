import { HEALTH_FAQ } from "@/lib/seo/faq";

/** The FAQ section, rendered from the same source as the FAQPage JSON-LD.
 *
 * Three deliberate choices, all of them about being readable by a machine
 * that gets one pass at the page:
 *
 * 1. No <Reveal> wrapper. Reveal renders its children at inline opacity:0
 *    until an IntersectionObserver fires, so a renderer that snapshots
 *    before scrolling sees invisible text. Every other section on this page
 *    animates; this one deliberately does not.
 *
 * 2. Each question is a real <h3> containing the whole question, so the
 *    heading itself is the retrieval key. Section titles like "FAQ" or
 *    "How it works" match nothing a person would actually ask.
 *
 * 3. The one-sentence answer comes first, before any elaboration, and is
 *    written to survive being quoted on its own — it names Tistra Health
 *    rather than "it", and depends on no earlier sentence.
 */
export function HealthFaq() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="bg-gray-50 py-16 scroll-mt-20 border-t border-gray-100"
    >
      <div className="max-w-3xl mx-auto px-6">
        <h2
          id="faq-heading"
          className="text-xl md:text-2xl font-bold text-gray-900 mb-3 text-center"
        >
          Common questions from families
        </h2>
        <p className="text-sm text-gray-600 text-center mb-10 max-w-xl mx-auto">
          Straight answers about how meal tracking works when the person logging meals is not the
          person reading the results.
        </p>

        <div className="flex flex-col gap-5">
          {HEALTH_FAQ.map((entry) => (
            <article
              key={entry.question}
              className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm"
            >
              <h3 className="text-base md:text-lg font-bold text-gray-900 leading-snug">
                {entry.question}
              </h3>

              {/* The extractable answer: first child after the heading, one
                  or two sentences, visually marked as the short version. */}
              <p className="mt-3 pl-4 border-l-4 border-[#6750A4] text-sm md:text-base text-gray-900 font-medium leading-relaxed">
                {entry.tldr}
              </p>

              <p className="mt-3 text-sm text-gray-600 leading-relaxed">{entry.detail}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
