// Tistra Club configuration: feature flags, branding and market defaults.
//
// Two rules this file exists to enforce:
//
//  1. The marketplace must be independently brandable (spec). Nothing in
//     Club UI hardcodes "Tistra Health" — copy reads CLUB_BRANDING, which
//     is env-driven, so renaming the product is a config change.
//  2. Market assumptions (SGD, Asia/Singapore, SG) live here rather than
//     being sprinkled through queries and components, so adding a second
//     country later is a data change rather than a grep-and-pray.
//
// Flag semantics match src/lib/billing/feature-flags.ts: explicit "true"
// enables, anything else falls back to the (conservative) default. See that
// file's comment on why each call site passes a static process.env literal
// rather than a computed lookup — the same NEXT_PUBLIC inlining constraint
// applies to any of these read from a client component.
function flag(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined) return defaultValue;
  return raw === "true";
}

// ---- Feature flags ----------------------------------------------------

/** Master switch. Off by default: the marketplace stays invisible in
 * production until every P0 piece is verified, without branching. */
export const MARKETPLACE_ENABLED = flag(process.env.NEXT_PUBLIC_MARKETPLACE_ENABLED, false);

/** Google Calendar free/busy + write-back. Off => availability comes from
 * Tistra bookings and working hours only. */
export const CALENDAR_SYNC_ENABLED = flag(process.env.CLUB_CALENDAR_SYNC_ENABLED, false);

/** Travel-aware availability. Off => location-based sessions still work,
 * but consecutive bookings aren't checked for travel feasibility. Never
 * turn this off in a market where coaches travel. */
export const TRAVEL_TIME_ENABLED = flag(process.env.CLUB_TRAVEL_TIME_ENABLED, true);

/** Consumer opt-in sharing of Tistra Health nutrition summaries with a
 * coach. Off => the permission UI is hidden and reads are refused. */
export const TISTRA_HEALTH_SHARING_ENABLED = flag(process.env.CLUB_TISTRA_HEALTH_SHARING_ENABLED, false);

/** Identity/credential verification workflow. */
export const COACH_VERIFICATION_ENABLED = flag(process.env.CLUB_COACH_VERIFICATION_ENABLED, true);

/** Booking-scoped messaging between coach and client. */
export const MESSAGING_ENABLED = flag(process.env.CLUB_MESSAGING_ENABLED, false);

// ---- Market defaults --------------------------------------------------

export const CLUB_MARKET = {
  countryCode: process.env.CLUB_DEFAULT_COUNTRY ?? "SG",
  currency: process.env.CLUB_DEFAULT_CURRENCY ?? "SGD",
  timezone: process.env.CLUB_DEFAULT_TIMEZONE ?? "Asia/Singapore",
  locale: "en-SG",
  /** Where a map opens before a coach has pinned anything. Central
   * Singapore; a second market changes this alongside the list below. */
  centre: { latitude: 1.3521, longitude: 103.8198 },
} as const;

/** Singapore neighbourhoods used for discovery chips and seed data. Held
 * as data (not a UI constant) so a second market only adds a list. */
export const SG_NEIGHBOURHOODS = [
  "River Valley", "Orchard", "Tiong Bahru", "Novena", "Bukit Timah",
  "Holland Village", "East Coast", "Katong", "Bishan", "Serangoon", "CBD",
] as const;

// ---- Branding (ADR-002) ----------------------------------------------

export const CLUB_BRANDING = {
  productName: process.env.NEXT_PUBLIC_CLUB_PRODUCT_NAME ?? "Tistra Club",
  shortName: process.env.NEXT_PUBLIC_CLUB_SHORT_NAME ?? "Club",
  tagline: process.env.NEXT_PUBLIC_CLUB_TAGLINE ?? "Find highly-rated movement coaches near you.",
  supportEmail: process.env.NEXT_PUBLIC_CLUB_SUPPORT_EMAIL ?? "support@tistra.club",
  // PDPA requires these to be reachable; deliberately left as configuration
  // rather than invented legal text (spec: do not fabricate legal wording).
  privacyPolicyUrl: process.env.NEXT_PUBLIC_CLUB_PRIVACY_URL ?? "",
  termsUrl: process.env.NEXT_PUBLIC_CLUB_TERMS_URL ?? "",
  dataProtectionOfficerEmail: process.env.NEXT_PUBLIC_CLUB_DPO_EMAIL ?? "",
} as const;

// ---- Platform economics ----------------------------------------------

/** Fallback only. The live fee is the newest club_platform_fees row
 * (admin-controlled, spec) — this is what a fresh environment starts from
 * before any row exists. Never hardcoded at a call site. */
/** Private bucket holding coach gallery images. Private for the same
 * reason meal photos are (migration 0040): paths are resolved to
 * short-lived signed URLs server-side, never exposed raw. */
export const COACH_MEDIA_BUCKET = "coach-media";

/** Fallback platform fee. The live value comes from club_platform_fees
 * (see getPlatformFeePercent) so a change is dated and auditable rather
 * than a redeploy — this is only used when that read is unavailable. */
export const DEFAULT_PLATFORM_FEE_PERCENT = Number(process.env.MARKETPLACE_PLATFORM_FEE_PERCENT ?? "1");

/** How long a checkout holds a slot. Server-controlled (spec). */
export const BOOKING_HOLD_MINUTES = Number(process.env.CLUB_BOOKING_HOLD_MINUTES ?? "10");

/** Ranking weights, tunable without a deploy-shaped code change (spec:
 * transparent, no black-box ML). Applied to normalized 0-1 signals. */
export const RANKING_WEIGHTS = {
  availabilitySoon: Number(process.env.CLUB_RANK_W_AVAILABILITY ?? "0.30"),
  rating: Number(process.env.CLUB_RANK_W_RATING ?? "0.25"),
  proximity: Number(process.env.CLUB_RANK_W_PROXIMITY ?? "0.20"),
  reviewVolume: Number(process.env.CLUB_RANK_W_REVIEW_VOLUME ?? "0.10"),
  repeatRate: Number(process.env.CLUB_RANK_W_REPEAT ?? "0.10"),
  profileQuality: Number(process.env.CLUB_RANK_W_PROFILE ?? "0.05"),
} as const;

/** Split a gross amount into platform fee and coach share, in integer
 * cents. Rounds the fee down so the coach is never short-changed by
 * rounding, and the two parts always sum exactly to gross. */
export function splitAmount(grossCents: number, feePercent: number): {
  platformFeeCents: number;
  coachAmountCents: number;
} {
  const platformFeeCents = Math.floor((grossCents * feePercent) / 100);
  return { platformFeeCents, coachAmountCents: grossCents - platformFeeCents };
}

/** SGD display, e.g. 7000 -> "S$70". Cents shown only when non-zero. */
export function formatMoney(cents: number, currency: string = CLUB_MARKET.currency): string {
  const whole = cents / 100;
  return new Intl.NumberFormat(CLUB_MARKET.locale, {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(whole);
}
