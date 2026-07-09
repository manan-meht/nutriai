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
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {cards.map((card, i) => (
        <Reveal key={card.href} delay={i * 100}>
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
