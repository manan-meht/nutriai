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
