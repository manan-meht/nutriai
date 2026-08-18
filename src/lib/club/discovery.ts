import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateAvailableSlots, type AvailableSlot, type WorkingRule } from "./availability";
import { rankCoaches, type RankableCoach } from "./ranking";
import { haversineKm } from "./travel/provider";
import { CLUB_MARKET } from "./config";
import { resolveCoachPhoto } from "./placeholder-photos";

// Consumer-side discovery and booking reads.
//
// Two rules shape everything here:
//
//  1. Only PUBLISHED coaches are ever visible. Draft and paused profiles
//     are excluded at the query, not filtered in the UI.
//  2. A coach's exact address is never returned to a consumer. Discovery
//     and profiles expose the neighbourhood only; the precise location is
//     released after a booking is confirmed (see resolveBookingAddress).
//
// Availability is computed with the same engine the Coach OS uses, so the
// slots a consumer is offered are exactly the slots the coach believes
// they have — there is no second, drifting implementation.

export interface DiscoveryFilters {
  skillSlug?: string;
  /** Consumer's location, for distance and "near me" ordering. */
  near?: { latitude: number; longitude: number };
  maxPriceCents?: number;
  travelsToClient?: boolean;
  availableWithinDays?: number;
}

export interface CoachCard {
  coachProfileId: string;
  displayName: string;
  headline: string | null;
  photoUrl: string | null;
  neighbourhood: string | null;
  skills: string[];
  startingPriceCents: number | null;
  currency: string;
  ratingAverage: number | null;
  reviewCount: number;
  sessionCount: number;
  identityVerified: boolean;
  travelsToClient: boolean;
  distanceKm: number | null;
  nextSlot: AvailableSlot | null;
  isNew: boolean;
}

/** Everything discovery needs, in a handful of queries rather than one per
 * coach — availability then runs in-process against the fetched rows. */
export async function discoverCoaches(
  admin: SupabaseClient,
  filters: DiscoveryFilters = {},
  now: Date = new Date()
): Promise<CoachCard[]> {
  const { data: coaches } = await admin
    .from("coach_profiles")
    .select(
      "id, display_name, headline, photo_url, rating_average, review_count, session_count, identity_verification_status, buffer_before_minutes, buffer_after_minutes, min_notice_hours, max_advance_days"
    )
    .eq("status", "published");

  const rows = coaches ?? [];
  if (rows.length === 0) return [];
  const ids = rows.map((c: any) => c.id);

  const [services, skills, locations, rules, travel, bookings] = await Promise.all([
    admin.from("coach_services").select("coach_profile_id, duration_minutes, price_cents, currency, travel_enabled, skill_id").in("coach_profile_id", ids).eq("is_active", true),
    admin.from("coach_skills").select("coach_profile_id, skill_id, club_skills(name, slug)").in("coach_profile_id", ids),
    admin.from("coach_locations").select("coach_profile_id, neighbourhood, latitude, longitude, is_primary").in("coach_profile_id", ids).eq("is_active", true),
    admin.from("coach_availability_rules").select("coach_profile_id, weekday, start_minute, end_minute").in("coach_profile_id", ids).eq("is_active", true),
    admin.from("coach_travel_rules").select("coach_profile_id, travel_enabled, max_travel_km").in("coach_profile_id", ids),
    admin.from("bookings").select("coach_profile_id, starts_at, ends_at").in("coach_profile_id", ids).in("status", ["CONFIRMED", "PAYMENT_PENDING"]).gte("starts_at", now.toISOString()),
  ]);

  /** Groups joined rows by coach. Typed as any[] deliberately: these come
   * from PostgREST selects whose shapes differ per query, and the repo has
   * no generated database types to narrow against. */
  const by = (list: any[] | null): Map<string, any[]> => {
    const m = new Map<string, any[]>();
    for (const r of list ?? []) {
      const arr = m.get(r.coach_profile_id) ?? [];
      arr.push(r);
      m.set(r.coach_profile_id, arr);
    }
    return m;
  };
  const svcBy = by(services.data as any[]);
  const skillBy = by(skills.data as any[]);
  const locBy = by(locations.data as any[]);
  const ruleBy = by(rules.data as any[]);
  const travelBy = by(travel.data as any[]);
  const bookingBy = by(bookings.data as any[]);

  const horizonDays = filters.availableWithinDays ?? 14;
  const cards: CoachCard[] = [];

  for (const c of rows) {
    const mySkills = (skillBy.get(c.id) ?? []).map((s: any) => {
      const k = Array.isArray(s.club_skills) ? s.club_skills[0] : s.club_skills;
      return { name: k?.name as string, slug: k?.slug as string };
    }).filter((s) => s.name);

    // Skill filter is a hard constraint: ranking must never surface a coach
    // who doesn't teach what was asked for (spec).
    if (filters.skillSlug && !mySkills.some((s) => s.slug === filters.skillSlug)) continue;

    const mySvcs = svcBy.get(c.id) ?? [];
    if (mySvcs.length === 0) continue; // unbookable; never show

    const travelsToClient = (travelBy.get(c.id) ?? [])[0]?.travel_enabled === true;
    if (filters.travelsToClient && !travelsToClient) continue;

    const startingPrice = Math.min(...mySvcs.map((s: any) => s.price_cents));
    if (filters.maxPriceCents != null && startingPrice > filters.maxPriceCents) continue;

    const primary = (locBy.get(c.id) ?? []).find((l: any) => l.is_primary) ?? (locBy.get(c.id) ?? [])[0];
    const distanceKm =
      filters.near && primary?.latitude != null && primary?.longitude != null
        ? Number(
            haversineKm(filters.near, {
              latitude: Number(primary.latitude),
              longitude: Number(primary.longitude),
            }).toFixed(1)
          )
        : null;

    const workingRules: WorkingRule[] = (ruleBy.get(c.id) ?? []).map((r: any) => ({
      weekday: r.weekday,
      startMinute: r.start_minute,
      endMinute: r.end_minute,
    }));

    const { slots } = calculateAvailableSlots({
      now,
      timezone: CLUB_MARKET.timezone,
      dateRange: { from: now, to: new Date(now.getTime() + horizonDays * 864e5) },
      serviceDurationMinutes: mySvcs[0].duration_minutes,
      slotIntervalMinutes: 60,
      workingRules,
      busy: (bookingBy.get(c.id) ?? []).map((b: any) => ({
        startsAt: new Date(b.starts_at),
        endsAt: new Date(b.ends_at),
      })),
      bufferBeforeMinutes: c.buffer_before_minutes,
      bufferAfterMinutes: c.buffer_after_minutes,
      minNoticeHours: c.min_notice_hours,
      maxAdvanceDays: c.max_advance_days,
    });

    cards.push({
      coachProfileId: c.id,
      displayName: c.display_name,
      headline: c.headline,
      photoUrl: resolveCoachPhoto(c.photo_url, mySkills.map((s) => s.slug)),
      // Neighbourhood only — never the street address (privacy rule).
      neighbourhood: primary?.neighbourhood ?? null,
      skills: mySkills.map((s) => s.name),
      startingPriceCents: Number.isFinite(startingPrice) ? startingPrice : null,
      currency: mySvcs[0].currency ?? CLUB_MARKET.currency,
      ratingAverage: c.rating_average != null ? Number(c.rating_average) : null,
      reviewCount: c.review_count,
      sessionCount: c.session_count,
      identityVerified: c.identity_verification_status === "verified",
      travelsToClient,
      distanceKm,
      nextSlot: slots[0] ?? null,
      isNew: c.review_count === 0,
    });
  }

  const rankable: RankableCoach[] = cards.map((c) => ({
    coachProfileId: c.coachProfileId,
    hoursUntilNextSlot: c.nextSlot ? (c.nextSlot.startsAt.getTime() - now.getTime()) / 3_600_000 : null,
    ratingAverage: c.ratingAverage,
    reviewCount: c.reviewCount,
    distanceKm: c.distanceKm,
    repeatBookingRate: 0,
    profileQuality: (c.photoUrl ? 0.5 : 0) + (c.headline ? 0.5 : 0),
  }));
  const order = new Map(rankCoaches(rankable).map((r, i) => [r.coachProfileId, i]));
  return cards.sort((a, b) => (order.get(a.coachProfileId) ?? 0) - (order.get(b.coachProfileId) ?? 0));
}

export interface CoachPublicProfile extends Omit<CoachCard, "nextSlot"> {
  bio: string | null;
  yearsCoaching: number | null;
  languages: string[];
  services: Array<{
    id: string;
    name: string;
    description: string | null;
    durationMinutes: number;
    priceCents: number;
    currency: string;
    travelEnabled: boolean;
  }>;
  reviews: Array<{ id: string; rating: number; body: string | null; tags: string[]; createdAt: string; authorName: string }>;
  cancellationFullRefundHours: number;
}

export async function getCoachPublicProfile(
  admin: SupabaseClient,
  coachProfileId: string
): Promise<CoachPublicProfile | null> {
  const { data: c } = await admin
    .from("coach_profiles")
    .select("id, display_name, headline, bio, photo_url, years_coaching, languages, rating_average, review_count, session_count, identity_verification_status, cancellation_full_refund_hours")
    .eq("id", coachProfileId)
    .eq("status", "published") // unpublished profiles are not publicly readable
    .maybeSingle();
  if (!c) return null;

  const [services, skills, locations, travel, reviews] = await Promise.all([
    admin.from("coach_services").select("id, name, description, duration_minutes, price_cents, currency, travel_enabled").eq("coach_profile_id", c.id).eq("is_active", true).order("price_cents"),
    admin.from("coach_skills").select("club_skills(name, slug)").eq("coach_profile_id", c.id),
    admin.from("coach_locations").select("neighbourhood, is_primary").eq("coach_profile_id", c.id).eq("is_active", true),
    admin.from("coach_travel_rules").select("travel_enabled").eq("coach_profile_id", c.id).maybeSingle(),
    admin.from("club_reviews").select("id, rating, body, tags, created_at, profiles!club_reviews_client_profile_id_fkey(full_name)").eq("coach_profile_id", c.id).eq("moderation_status", "published").order("created_at", { ascending: false }).limit(10),
  ]);

  const primary = (locations.data ?? []).find((l: any) => l.is_primary) ?? (locations.data ?? [])[0];

  return {
    coachProfileId: c.id,
    displayName: c.display_name,
    headline: c.headline,
    bio: c.bio,
    photoUrl: resolveCoachPhoto(
      c.photo_url,
      (skills.data ?? []).map((s: any) => {
        const k = Array.isArray(s.club_skills) ? s.club_skills[0] : s.club_skills;
        return k?.slug;
      })
    ),
    yearsCoaching: c.years_coaching,
    languages: Array.isArray(c.languages) ? c.languages : [],
    neighbourhood: primary?.neighbourhood ?? null,
    skills: (skills.data ?? []).map((s: any) => {
      const k = Array.isArray(s.club_skills) ? s.club_skills[0] : s.club_skills;
      return k?.name;
    }).filter(Boolean),
    services: (services.data ?? []).map((s: any) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      durationMinutes: s.duration_minutes,
      priceCents: s.price_cents,
      currency: s.currency,
      travelEnabled: s.travel_enabled,
    })),
    startingPriceCents: (services.data ?? [])[0]?.price_cents ?? null,
    currency: (services.data ?? [])[0]?.currency ?? CLUB_MARKET.currency,
    ratingAverage: c.rating_average != null ? Number(c.rating_average) : null,
    reviewCount: c.review_count,
    sessionCount: c.session_count,
    identityVerified: c.identity_verification_status === "verified",
    travelsToClient: travel.data?.travel_enabled === true,
    distanceKm: null,
    isNew: c.review_count === 0,
    reviews: (reviews.data ?? []).map((r: any) => {
      const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
      return {
        id: r.id,
        rating: r.rating,
        body: r.body,
        tags: Array.isArray(r.tags) ? r.tags : [],
        createdAt: r.created_at,
        // First name only: a review is public, a full name needn't be.
        authorName: (p?.full_name ?? "A client").split(" ")[0],
      };
    }),
    cancellationFullRefundHours: c.cancellation_full_refund_hours,
  };
}

/** Bookable slots for one coach and service. Used by the slot picker, and
 * re-run server-side at hold time so a stale page can't book a gone slot. */
export async function getBookableSlots(
  admin: SupabaseClient,
  coachProfileId: string,
  serviceId: string,
  days = 14,
  now: Date = new Date()
): Promise<AvailableSlot[]> {
  const [{ data: coach }, { data: service }] = await Promise.all([
    admin.from("coach_profiles").select("id, buffer_before_minutes, buffer_after_minutes, min_notice_hours, max_advance_days").eq("id", coachProfileId).eq("status", "published").maybeSingle(),
    admin.from("coach_services").select("duration_minutes").eq("id", serviceId).eq("coach_profile_id", coachProfileId).eq("is_active", true).maybeSingle(),
  ]);
  if (!coach || !service) return [];

  const [{ data: rules }, { data: booked }, { data: exceptions }, { data: holds }] = await Promise.all([
    admin.from("coach_availability_rules").select("weekday, start_minute, end_minute").eq("coach_profile_id", coachProfileId).eq("is_active", true),
    admin.from("bookings").select("starts_at, ends_at").eq("coach_profile_id", coachProfileId).in("status", ["CONFIRMED", "PAYMENT_PENDING"]).gte("starts_at", now.toISOString()),
    admin.from("coach_availability_exceptions").select("starts_at, ends_at, exception_type").eq("coach_profile_id", coachProfileId).gte("ends_at", now.toISOString()),
    // Live holds block slots too, or two people in checkout would both be
    // offered the same time.
    admin.from("booking_holds").select("starts_at, ends_at").eq("coach_profile_id", coachProfileId).is("released_at", null).is("booking_id", null).gt("expires_at", now.toISOString()),
  ]);

  return calculateAvailableSlots({
    now,
    timezone: CLUB_MARKET.timezone,
    dateRange: { from: now, to: new Date(now.getTime() + days * 864e5) },
    serviceDurationMinutes: service.duration_minutes,
    slotIntervalMinutes: 30,
    workingRules: (rules ?? []).map((r: any) => ({
      weekday: r.weekday,
      startMinute: r.start_minute,
      endMinute: r.end_minute,
    })),
    busy: [
      ...(booked ?? []).map((b: any) => ({ startsAt: new Date(b.starts_at), endsAt: new Date(b.ends_at) })),
      ...(holds ?? []).map((h: any) => ({ startsAt: new Date(h.starts_at), endsAt: new Date(h.ends_at) })),
    ],
    exceptions: (exceptions ?? []).map((e: any) => ({
      startsAt: new Date(e.starts_at),
      endsAt: new Date(e.ends_at),
      type: e.exception_type,
    })),
    bufferBeforeMinutes: coach.buffer_before_minutes,
    bufferAfterMinutes: coach.buffer_after_minutes,
    minNoticeHours: coach.min_notice_hours,
    maxAdvanceDays: coach.max_advance_days,
  }).slots;
}

export async function listSkills(admin: SupabaseClient) {
  const { data } = await admin
    .from("club_skills")
    .select("id, name, slug")
    .eq("is_active", true)
    .order("sort_order");
  return data ?? [];
}
