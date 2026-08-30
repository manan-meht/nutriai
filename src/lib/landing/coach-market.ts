import { CLUB_MARKET, DEFAULT_PLATFORM_FEE_PERCENT } from "@/lib/club/config";
import { FOUNDING_FREE_BOOKINGS } from "@/lib/club/founding-offer";

/** Everything about the coach landing page that changes with the market.
 *
 * One place, so opening a new market is editing this file rather than
 * grepping for "Singapore" across a 600-line page. The marketplace already
 * has CLUB_MARKET for currency/timezone/centre; this adds the
 * marketing-copy half.
 *
 * The commercial numbers are imported, never restated: FOUNDING_FREE_BOOKINGS
 * is what the booking engine enforces and DEFAULT_PLATFORM_FEE_PERCENT is
 * what checkout charges. Copy that quotes its own figure will eventually lie.
 *
 * SINGAPORE IS THE GOOGLE ADS DESTINATION. Its values are pinned by
 * __tests__/coach-market-isolation.test.ts and its rendered HTML is
 * asserted unchanged. Add markets beside it; do not refactor through it.
 */
export interface CoachMarket {
  /** Stable key, used in URLs and analytics. */
  id: "sg" | "in";
  /** How the market is named in copy. */
  name: string;
  /** Eyebrow above the hero headline. */
  eyebrow: string;
  currency: string;
  /** Symbol for prices in body copy. */
  currencySymbol: string;
  /** How many Founding Coach places exist in this market. A real limit:
   * how many coaches we can personally onboard and promote. */
  foundingCoachLimit: number;
  /** Disciplines named in the "we promote you" copy. Market-specific
   * because the mix differs. */
  skillExamples: string[];
  /** Cities we can name in a headline when the visitor's own is known.
   * Lowercased for matching against cf.city. */
  cities: string[];

  // ---- What actually differs between the two pages -------------------
  /** False where Tistra cannot yet take a booking. Drives the "opening
   * soon" notice, the conditional wording on the commission line, and the
   * FAQ set — the page must never imply a client can pay us in a market
   * where they cannot. */
  live: boolean;
  /** The line under the headline. */
  heroSupport: string;
  /** Attribution source on every CTA, so the two markets can be told
   * apart in Ads and GA4. */
  signupSource: string;
  images: { hero: string; closing: string };
  /** The image-led discipline cards. */
  featured: { slug: string; label: string; image: string; alt: string }[];
  /** The card floating over the hero photograph. Priced in the market's
   * own currency — it showed S$120 on the India page until this moved out
   * of the component. It illustrates what can be sold through Tistra and
   * is labelled "Example session"; it is not a claim that anyone booked. */
  exampleSession: { name: string; price: string; duration: string };
}

/** Singapore. The live ads destination — treat as frozen. */
export const SG_COACH_MARKET: CoachMarket = {
  id: "sg",
  name: CLUB_MARKET.displayName,
  eyebrow: `For independent coaches in ${CLUB_MARKET.displayName}`,
  currency: CLUB_MARKET.currency,
  currencySymbol: CLUB_MARKET.currency === "SGD" ? "S$" : "",
  foundingCoachLimit: 20,
  skillExamples: ["strength training", "handstands", "swimming", "mobility"],
  cities: [],
  live: true,
  heroSupport:
    "Offer private 1-on-1 or small-group sessions. Tistra helps new clients discover, book and pay you.",
  signupSource: "coach_landing",
  images: { hero: "/marketing/coach-hero.webp", closing: "/marketing/coach-practice.webp" },
  featured: [
    { slug: "strength-training", label: "Strength", image: "/coach-photos/strength-training.webp", alt: "A strength coach at a squat rack" },
    { slug: "handstands", label: "Handstands", image: "/coach-photos/handstands.webp", alt: "A handstand coach mid-balance" },
    { slug: "tennis", label: "Tennis", image: "/coach-photos/tennis.webp", alt: "A tennis coach on court" },
    { slug: "swimming", label: "Swimming", image: "/coach-photos/swimming.webp", alt: "A swimming coach at the poolside" },
  ],
  exampleSession: { name: "Private strength session", price: "S$120", duration: "60 min" },
};

/** India. Not yet transactable — Razorpay Route is not built, so this
 * market recruits coaches and does not take bookings. Nothing here should
 * imply a client can pay through Tistra in India today. */
export const IN_COACH_MARKET: CoachMarket = {
  id: "in",
  name: "India",
  eyebrow: "For independent coaches in India",
  currency: "INR",
  currencySymbol: "₹",
  foundingCoachLimit: 25,
  skillExamples: ["strength training", "yoga", "swimming", "mobility"],
  cities: ["mumbai", "delhi", "new delhi", "gurgaon", "gurugram", "noida", "bengaluru", "bangalore", "pune", "hyderabad", "chennai"],
  live: false,
  heroSupport:
    "Tistra Club is opening in India. Join as a Founding Coach and be one of the first people clients find when we launch.",
  signupSource: "coach_landing_in",
  images: {
    hero: "/marketing/india/coach-hero-in.webp",
    closing: "/marketing/india/coach-practice-in.webp",
  },
  featured: [
    { slug: "strength-training", label: "Strength", image: "/marketing/india/discipline-strength-in.webp", alt: "A strength coach working with a client in India" },
    { slug: "yoga", label: "Yoga", image: "/marketing/india/discipline-yoga-in.webp", alt: "A yoga teacher guiding a student in India" },
  ],
  exampleSession: { name: "Private strength session", price: "₹1,500", duration: "60 min" },
};

export const COACH_MARKETS = { sg: SG_COACH_MARKET, in: IN_COACH_MARKET } as const;

/** The default market. Unchanged export name and value, so every existing
 * import keeps resolving to Singapore. */
export const COACH_MARKET = SG_COACH_MARKET;

/** Re-exported so page copy has exactly one import for "the offer". */
export const FREE_BOOKINGS = FOUNDING_FREE_BOOKINGS;
export const COMMISSION_PERCENT = DEFAULT_PLATFORM_FEE_PERCENT;

/** Title-cases a city name from cf.city for use in a headline.
 *
 * Cloudflare returns them already capitalised, but casing has varied by
 * PoP, and "MUMBAI" in a headline reads as a bug. */
export function displayCity(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** The visitor's city, only when it is one this market actually serves.
 *
 * City-level IP geolocation is roughly 60-80% accurate and Indian mobile
 * networks often resolve to a circle's gateway city rather than the user's
 * own — so an unrecognised city is dropped rather than guessed at, and the
 * page falls back to naming the country. Getting it wrong in a headline is
 * worse than not personalising at all.
 */
export function cityForMarket(market: CoachMarket, rawCity: string | null | undefined): string | null {
  if (!rawCity) return null;
  const key = rawCity.trim().toLowerCase();
  if (!market.cities.includes(key)) return null;
  // Normalise the aliases people and Cloudflare disagree about.
  const canonical =
    key === "bangalore" ? "Bengaluru"
    : key === "gurgaon" ? "Gurugram"
    : key === "new delhi" ? "Delhi"
    : displayCity(key);
  return canonical;
}

/** Which coach market a request belongs to, from Cloudflare's edge country.
 *
 * cf-ipcountry is set by Cloudflare from the connecting IP and cannot be
 * spoofed through a normal request header. This is a content decision, not
 * a security boundary — the worst a wrong answer does is show the wrong
 * market's copy, and both markets remain reachable by URL regardless.
 *
 * Anything that is not India resolves to Singapore, which keeps the
 * default — and the Google Ads landing page — exactly as it was.
 */
export function coachMarketForCountry(country: string | null | undefined): CoachMarket {
  return (country ?? "").toUpperCase() === "IN" ? IN_COACH_MARKET : SG_COACH_MARKET;
}
