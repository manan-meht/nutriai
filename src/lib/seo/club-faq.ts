import type { FaqEntry } from "./faq";

/** Tistra Club's FAQ — the questions someone in Singapore actually types
 * when they are looking for a coach, rather than the questions a
 * marketplace would prefer to answer.
 *
 * Shares the FaqEntry shape with Tistra Health's FAQ (lib/seo/faq.ts) so
 * both feed the same schema builder and the same rendering contract: the
 * `tldr` must answer the question on its own, because that is the unit an
 * assistant quotes.
 *
 * Deliberately concrete about price, geography and what happens after you
 * book. The skills answer names them rather than counting them — the count
 * was wrong within a week of being written, twice. Vague marketplace copy ("find your perfect coach") answers nothing
 * and gets cited for nothing.
 */
export const CLUB_FAQ: FaqEntry[] = [
  {
    question: "How do I find a personal trainer in Singapore?",
    tldr:
      "Tistra Club lists personal trainers in Singapore with a fixed price, a real calendar, and instant booking. You filter by skill, open a profile, pick a slot that is genuinely free, and pay to confirm it.",
    detail:
      "The usual route — searching Instagram, sending a direct message, waiting, then negotiating times and rates — is what this replaces. Every profile states what each session costs in Singapore dollars and how long it runs, so there is no enquiry step before you know the price.",
  },
  {
    question: "How much does a personal trainer cost in Singapore?",
    tldr:
      "On Tistra Club, private coaching sessions in Singapore currently run from about S$60 to S$160 depending on the coach, the discipline, and whether they travel to you. Every price is shown in Singapore dollars on the coach's profile before you book.",
    detail:
      "Coaches set their own rates rather than the platform setting a band. House-call sessions, where the coach comes to you, are listed as their own service type and priced separately from sessions at a coach's usual location. Several coaches also sell discounted multi-class packs, which lower the per-session cost if you book a block up front.",
  },
  {
    question: "Can a coach come to my home in Singapore?",
    tldr:
      "Yes — coaches who travel to clients are marked as such, and house-call sessions across Singapore appear as their own service with their own price. You can filter the marketplace to show only coaches who travel to your location.",
    detail:
      "Where coaches move between clients, Tistra Club accounts for travel time when it works out availability, so the slots offered are ones the coach can physically reach in time. This is the part that usually breaks when a coach manages a travelling schedule by hand.",
  },
  {
    question: "How do I book a coach without messaging them on Instagram first?",
    tldr:
      "Booking a coach in Singapore on Tistra Club takes no messaging at all. Availability comes from the coach's own calendar, so you pick a slot, pay by card, and the session is confirmed immediately without waiting for a reply.",
    detail:
      "This matters most for the first session, which is where most coaching enquiries die — the gap between sending a message and agreeing a time is where people lose interest. A confirmed booking with a paid slot removes that gap entirely.",
  },
  {
    question: "Are there strength training coaches for older adults in Singapore?",
    tldr:
      "Yes. Older Adult Strength is one of the skill categories on Tistra Club, and some coaches in Singapore list strength training built specifically for seniors, including sessions at the client's home.",
    detail:
      "House-call sessions matter for this group in particular, since travelling to a gym is often the barrier rather than the training itself. Filter by the Older Adult Strength skill, or look for the coaches marked as travelling to clients.",
  },
  {
    question: "What happens if I need to cancel a coaching session?",
    tldr:
      "Each coach on Tistra Club sets a full-refund cancellation window, and it is shown on their profile before you book. Cancel inside that window and the session is refunded in full.",
    detail:
      "The window is stated per coach rather than as one platform-wide rule, because a coach travelling across Singapore has a different cost of a late cancellation than one who does not. It is visible on the profile page, not buried in terms you agree to at checkout.",
  },
  {
    question: "Do I pay the coach directly or through the platform?",
    tldr:
      "You pay through Tistra Club by card when you book, and the coach is paid out to their own account afterwards. Prices are in Singapore dollars, and there is no cash, transfer, or settling up at the end of a session.",
    detail:
      "Paying at booking is what makes a slot a confirmed reservation rather than a request. It also means the cancellation and refund terms on the profile are the actual terms, applied automatically, instead of something you have to raise with the coach.",
  },
  {
    question: "What kinds of coaching can I book in Singapore on Tistra Club?",
    tldr:
      "Tistra Club covers strength, movement, sport and mind-body coaching in Singapore — personal training, strength training, calisthenics, acrobatics, handstands, dance, Latin dance, inline skating, mobility, boxing, Muay Thai, pole, running, swimming, tennis, yoga, and strength for older adults.",
    detail:
      "Coverage is deepest in strength and movement disciplines, which is where the current roster is concentrated. Not every category has a coach listed at any given moment — the marketplace shows who is genuinely published and bookable rather than padding the list.",
  },
  {
    question: "Are the coaches on Tistra Club verified?",
    tldr:
      "Coaches go through identity verification before their profile can be published, and reviews come only from clients who completed a booking. Example profiles used to demonstrate the product are labelled as demos on the page.",
    detail:
      "The roster is small and individually reviewed rather than scraped or bulk-imported, which is the honest trade-off at this stage: fewer coaches, but every one of them is a real person in Singapore who can actually take your booking.",
  },
  {
    question: "Is Tistra Club available outside Singapore?",
    tldr:
      "No — Tistra Club operates in Singapore only, with prices in Singapore dollars and coaches listing Singapore neighbourhoods. There is no coverage in any other market.",
    detail:
      "Availability, travel-time calculations, payment and payouts are all built around Singapore. A coach elsewhere cannot currently list, and a client elsewhere has nothing to book.",
  },
];
