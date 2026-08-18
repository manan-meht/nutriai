import { RANKING_WEIGHTS } from "./config";

// Discovery ranking (spec: simple, transparent, tunable, no black-box ML).
//
// Every signal is normalized to 0-1, multiplied by a configured weight, and
// summed. The per-signal contributions are returned alongside the score so
// the admin UI can show *why* a coach ranked where they did — a marketplace
// whose operators can't explain its ordering can't be tuned or defended.
//
// Ranking NEVER overrides explicit user filters (spec): filtering happens
// in the query, and only the surviving candidates are ordered here.

export interface RankableCoach {
  coachProfileId: string;
  /** Hours until the coach's next bookable slot; null = nothing available. */
  hoursUntilNextSlot: number | null;
  ratingAverage: number | null;
  reviewCount: number;
  /** Km from the searcher; null when distance is irrelevant (online, or no
   * location given) — treated as neutral rather than worst. */
  distanceKm: number | null;
  /** 0-1 share of this coach's clients who booked more than once. */
  repeatBookingRate: number;
  /** 0-1 completeness of the marketplace profile (photo, bio, media, etc). */
  profileQuality: number;
}

export interface RankedCoach extends RankableCoach {
  score: number;
  contributions: Record<keyof typeof RANKING_WEIGHTS, number>;
}

/** Sooner is better, decaying over a week. Something bookable today should
 * clearly outrank something bookable next Friday. */
function availabilitySignal(hours: number | null): number {
  if (hours == null) return 0; // nothing bookable: no availability credit
  if (hours <= 0) return 1;
  const WEEK_HOURS = 168;
  return Math.max(0, 1 - hours / WEEK_HOURS);
}

/** Ratings below 3 carry no positive signal; 3->5 maps onto 0->1. An unrated
 * coach sits at neutral rather than bottom, so new coaches are discoverable
 * (a marketplace that buries every newcomer never onboards anyone). */
function ratingSignal(rating: number | null): number {
  if (rating == null) return 0.5;
  return Math.max(0, Math.min(1, (rating - 3) / 2));
}

/** Closer is better within 15km; beyond that the difference stops mattering
 * much in a city the size of Singapore. */
function proximitySignal(distanceKm: number | null): number {
  if (distanceKm == null) return 0.5;
  const MAX_KM = 15;
  return Math.max(0, 1 - Math.min(distanceKm, MAX_KM) / MAX_KM);
}

/** Logarithmic: the gap between 0 and 10 reviews should matter far more
 * than the gap between 100 and 110. Saturates around 50. */
function reviewVolumeSignal(count: number): number {
  if (count <= 0) return 0;
  return Math.min(1, Math.log10(count + 1) / Math.log10(51));
}

export function rankCoaches(coaches: RankableCoach[]): RankedCoach[] {
  const w = RANKING_WEIGHTS;
  return coaches
    .map((c) => {
      const contributions = {
        availabilitySoon: availabilitySignal(c.hoursUntilNextSlot) * w.availabilitySoon,
        rating: ratingSignal(c.ratingAverage) * w.rating,
        proximity: proximitySignal(c.distanceKm) * w.proximity,
        reviewVolume: reviewVolumeSignal(c.reviewCount) * w.reviewVolume,
        repeatRate: Math.max(0, Math.min(1, c.repeatBookingRate)) * w.repeatRate,
        profileQuality: Math.max(0, Math.min(1, c.profileQuality)) * w.profileQuality,
      };
      const score = Object.values(contributions).reduce((sum, v) => sum + v, 0);
      return { ...c, score, contributions };
    })
    .sort((a, b) =>
      // Deterministic ordering: ties break on id so paging is stable rather
      // than reshuffling between requests.
      b.score - a.score || a.coachProfileId.localeCompare(b.coachProfileId)
    );
}

/** Profile completeness, also used to gate publishing (a profile missing
 * these reads as spam in discovery). Returns 0-1. */
export function profileQualityScore(input: {
  hasPhoto: boolean;
  hasBio: boolean;
  hasCoverMedia: boolean;
  serviceCount: number;
  skillCount: number;
  hasLocation: boolean;
  hasAvailability: boolean;
}): number {
  const checks = [
    input.hasPhoto,
    input.hasBio,
    input.hasCoverMedia,
    input.serviceCount > 0,
    input.skillCount > 0,
    input.hasLocation,
    input.hasAvailability,
  ];
  return checks.filter(Boolean).length / checks.length;
}

/** The subset of profile completeness that is REQUIRED before a coach can
 * publish to the marketplace (spec) — a published profile with no service,
 * no location or no availability is unbookable and wastes consumer taps. */
export function publishBlockers(input: {
  hasPhoto: boolean;
  hasBio: boolean;
  serviceCount: number;
  skillCount: number;
  hasLocation: boolean;
  hasAvailability: boolean;
  payoutsEnabled: boolean;
}): string[] {
  const blockers: string[] = [];
  if (!input.hasPhoto) blockers.push("Add a profile photo");
  if (!input.hasBio) blockers.push("Write a short introduction");
  if (input.skillCount === 0) blockers.push("Select at least one skill");
  if (input.serviceCount === 0) blockers.push("Create at least one service");
  if (!input.hasLocation) blockers.push("Add where you coach");
  if (!input.hasAvailability) blockers.push("Set your weekly availability");
  if (!input.payoutsEnabled) blockers.push("Finish payout setup to accept bookings");
  return blockers;
}
