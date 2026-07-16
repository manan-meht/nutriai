import Link from "next/link";
import { Reveal } from "@/components/motion/Reveal";

export interface UseCaseCard {
  href: string;
  icon: string;
  title: string;
  description: string;
  cta: string;
}

/** The homepage's "For families / For coaches / For myself" card grid,
 * extracted so it's a single reusable primitive rather than markup
 * duplicated wherever a use-case chooser is needed. */
export function UseCaseCards({ cards }: { cards: UseCaseCard[] }) {
  return (
    // Below sm: a horizontally scrollable, snap-aligned row instead of
    // stacking every card vertically — with 4 cards that made the page
    // noticeably long on mobile. At sm+ it reverts to the normal grid
    // (overflow-visible, no scroll/snap behavior at all).
    <div
      className={`flex overflow-x-auto snap-x snap-mandatory gap-4 pb-2 -mx-6 px-6 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:overflow-visible sm:gap-6 ${
        cards.length >= 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3"
      }`}
    >
      {cards.map((card, i) => (
        <Reveal key={card.href} delay={i * 100} className="shrink-0 snap-start w-[80vw] max-w-xs sm:w-auto sm:shrink sm:max-w-none">
          <div className="group bg-white border border-gray-200 hover:border-[#6750A4] hover:shadow-xl transition-all rounded-3xl p-8 flex flex-col h-full">
            <div className="w-14 h-14 rounded-2xl bg-[#F3EEFB] flex items-center justify-center text-2xl mb-6">
              {card.icon}
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">{card.title}</h3>
            <p className="text-gray-600 mb-8 flex-grow">{card.description}</p>
            <Link
              href={card.href}
              className="w-full text-center py-3.5 px-6 border-2 border-[#6750A4] text-[#4F378A] font-semibold rounded-full hover:bg-[#6750A4] hover:text-white transition-all"
            >
              {card.cta}
            </Link>
          </div>
        </Reveal>
      ))}
    </div>
  );
}
