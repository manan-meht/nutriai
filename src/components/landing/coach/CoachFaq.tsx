import { COACH_MARKET, FREE_BOOKINGS, COMMISSION_PERCENT } from "@/lib/landing/coach-market";
import { SectionView } from "./SectionView";

/** The objections a coach actually has before signing up.
 *
 * Written to be answerable in one read, and written to be true: the "am I
 * guaranteed clients" answer says no. A landing page that dodges that
 * question gets a coach to sign up and lose trust a fortnight later, which
 * costs more than the signup was worth — they talk to other coaches.
 */
const FAQ = [
  {
    q: "Is it really free to join?",
    a: `Yes. Creating your profile and staying listed costs nothing — no monthly subscription, no upfront fee, and no card required to join.`,
  },
  {
    q: "What does Tistra charge?",
    a: `Nothing on your first ${FREE_BOOKINGS} bookings. After that, Tistra takes ${COMMISSION_PERCENT}% only when you get paid, and card processing is included in that — there is no second deduction.`,
  },
  {
    q: "What does Tistra-funded promotion mean?",
    a: `We spend our own marketing budget bringing people to Tistra Club and to the skills our coaches teach, and Founding Coaches are the profiles that promotion points at. It is a commitment to spend, not a promise of results.`,
  },
  {
    q: "Am I guaranteed clients?",
    a: `No. Tistra does not guarantee enquiries or bookings. We can promise active promotion and a profile built to convert — we cannot promise how many people book.`,
  },
  {
    q: "Do I need to leave Instagram or my existing clients?",
    a: `No. Most coaches keep their existing clients and channels exactly as they are. Tistra is an additional way to be found, not a replacement for what already works.`,
  },
  {
    q: "Do I need to use Tistra exclusively?",
    a: `No. There is no exclusivity. List elsewhere, take direct bookings, keep your own rates — nothing here asks you to stop.`,
  },
  {
    q: "Can Tistra help create my profile?",
    a: `Yes. Send us your Instagram, website or a few details about what you teach and we will help get your profile ready. Founding Coaches get this personally.`,
  },
  {
    q: `What happens after my first ${FREE_BOOKINGS} bookings?`,
    a: `Your profile stays live and nothing changes except the commission: ${COMMISSION_PERCENT}% on bookings that come through Tistra, taken only when a client pays. Still no subscription and no listing fee.`,
  },
  {
    q: "Who can join as a coach?",
    a: `Independent coaches and instructors working in ${COACH_MARKET.name} — strength, movement, sport, mobility and related disciplines. We verify identity before a profile goes live.`,
  },
] as const;

export function CoachFaq({ className = "" }: { className?: string }) {
  return (
    <SectionView event="faq_view" className={className} id="faq">
      <h2
        className="max-w-2xl text-[1.75rem] font-semibold leading-9 tracking-[-0.02em] text-balance md:text-[2.25rem] md:leading-[2.75rem]"
        style={{ color: "#1A1B22" }}
      >
        Questions coaches ask us.
      </h2>

      <dl className="mt-8 flex flex-col gap-5">
        {FAQ.map((item) => (
          <div
            key={item.q}
            className="rounded-2xl border p-5"
            style={{ borderColor: "#CCC3D8", backgroundColor: "#FFFFFF" }}
          >
            <dt className="text-[16px] font-semibold leading-6" style={{ color: "#1A1B22" }}>
              {item.q}
            </dt>
            <dd className="mt-2 text-[15px] leading-6" style={{ color: "#4A4455" }}>
              {item.a}
            </dd>
          </div>
        ))}
      </dl>
    </SectionView>
  );
}
