import { CLUB_MARKET, DEFAULT_PLATFORM_FEE_PERCENT } from "@/lib/club/config";
import { FOUNDING_FREE_BOOKINGS } from "@/lib/club/founding-offer";

/** Everything about the coach landing page that changes with the market.
 *
 * One place, so opening Bengaluru or Mumbai is editing this object rather
 * than grepping for "Singapore" across a 600-line page. The marketplace
 * already has CLUB_MARKET for currency/timezone/centre; this adds only the
 * marketing-copy half and reads the rest from there, so the landing page
 * and the product cannot disagree about which market they are in.
 *
 * The commercial numbers are imported, never restated: FOUNDING_FREE_BOOKINGS
 * is what the booking engine actually enforces and
 * DEFAULT_PLATFORM_FEE_PERCENT is what checkout actually charges. Copy that
 * quotes its own figure is copy that will eventually lie.
 */
export interface CoachMarket {
  /** How the market is named in copy. */
  name: string;
  /** Eyebrow above the hero headline. */
  eyebrow: string;
  currency: string;
  /** Symbol for prices in body copy. */
  currencySymbol: string;
  /** How many Founding Coach places exist in this market. Real limit: it
   * is how many coaches we can personally onboard and promote, not a
   * number chosen to look scarce. */
  foundingCoachLimit: number;
  /** Disciplines named in the "we promote you" copy. Market-specific
   * because the mix differs — a Mumbai list would not lead with skating. */
  skillExamples: string[];
}

export const COACH_MARKET: CoachMarket = {
  name: CLUB_MARKET.displayName,
  eyebrow: `For independent coaches in ${CLUB_MARKET.displayName}`,
  currency: CLUB_MARKET.currency,
  currencySymbol: CLUB_MARKET.currency === "SGD" ? "S$" : CLUB_MARKET.currency === "INR" ? "₹" : "",
  foundingCoachLimit: 20,
  skillExamples: ["strength training", "handstands", "swimming", "mobility"],
};

/** Re-exported so page copy has exactly one import for "the offer". */
export const FREE_BOOKINGS = FOUNDING_FREE_BOOKINGS;
export const COMMISSION_PERCENT = DEFAULT_PLATFORM_FEE_PERCENT;
