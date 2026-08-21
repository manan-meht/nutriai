import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateAvailableSlots, type WorkingRule } from "./availability";
import { splitAmount, DEFAULT_PLATFORM_FEE_PERCENT, CLUB_MARKET } from "./config";
import { profileQualityScore, publishBlockers } from "./ranking";
import { resolveSignedCoachPhotoUrl } from "./media";
import { fetchBusyBlocks } from "./calendar";
import { zonedDateString, zonedWeekday, zonedTimeToInstant, eachZonedDate } from "./time";

// Data layer for the Coach OS. Every screen reads from here rather than
// querying Supabase inline, so authorization ("is this row actually this
// coach's?") lives in one place instead of being re-derived per page.
//
// Every function takes the coach's PROFILE id (the auth user) and resolves
// their coach_profiles row itself. A page can therefore never accidentally
// read another coach's calendar by passing the wrong identifier — there is
// no identifier to get wrong.

export interface CoachProfileRow {
  id: string;
  displayName: string;
  status: "draft" | "published" | "paused" | "suspended";
  /** Signed URL for display. Undefined if signing failed — check
   * hasPhoto, never this, when deciding whether a photo EXISTS: a
   * transient signing failure must not tell a coach their photo is
   * missing and block them from publishing. */
  photoUrl: string | null;
  /** Whether a photo is actually stored, independent of signing. */
  hasPhoto: boolean;
  headline: string | null;
  bio: string | null;
  timezone: string;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minNoticeHours: number;
  maxAdvanceDays: number;
  stripePayoutsEnabled: boolean;
  ratingAverage: number | null;
  reviewCount: number;
  sessionCount: number;
}

export async function getCoachProfile(
  admin: SupabaseClient,
  profileId: string
): Promise<CoachProfileRow | null> {
  const { data } = await admin
    .from("coach_profiles")
    .select(
      "id, display_name, status, photo_url, headline, bio, buffer_before_minutes, buffer_after_minutes, min_notice_hours, max_advance_days, stripe_payouts_enabled, rating_average, review_count, session_count"
    )
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    displayName: data.display_name,
    status: data.status,
    photoUrl: (await resolveSignedCoachPhotoUrl(admin, data.photo_url)) ?? null,
    hasPhoto: !!data.photo_url,
    headline: data.headline,
    bio: data.bio,
    timezone: CLUB_MARKET.timezone,
    bufferBeforeMinutes: data.buffer_before_minutes,
    bufferAfterMinutes: data.buffer_after_minutes,
    minNoticeHours: data.min_notice_hours,
    maxAdvanceDays: data.max_advance_days,
    stripePayoutsEnabled: data.stripe_payouts_enabled,
    ratingAverage: data.rating_average,
    reviewCount: data.review_count,
    sessionCount: data.session_count,
  };
}

export interface SessionSummary {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  clientName: string;
  serviceName: string | null;
  durationMinutes: number;
  priceCents: number;
  locationLabel: string | null;
  locationType: string | null;
  /** True when this is the client's first session with this coach — the
   * dashboard flags it, because a first session needs different prep. */
  isFirstSession: boolean;
}

/** Bookings in a window, joined to the names a human needs to read them.
 * Ordered by start time: every Coach OS screen wants chronological. */
async function getBookingsBetween(
  admin: SupabaseClient,
  coachProfileId: string,
  from: Date,
  to: Date,
  statuses: string[] = ["CONFIRMED", "COMPLETED", "PAYMENT_PENDING"]
): Promise<SessionSummary[]> {
  const { data } = await admin
    .from("bookings")
    .select(
      "id, starts_at, ends_at, status, price_cents, client_profile_id, service_id, coach_services(name), booking_locations(location_type, coach_location_id, neighbourhood), profiles!bookings_client_profile_id_fkey(full_name)"
    )
    .eq("coach_profile_id", coachProfileId)
    .gte("starts_at", from.toISOString())
    .lt("starts_at", to.toISOString())
    .in("status", statuses)
    .order("starts_at");

  const rows = data ?? [];
  if (rows.length === 0) return [];

  // "First session" needs each client's earliest booking with this coach —
  // one grouped query rather than one per row.
  const clientIds = [...new Set(rows.map((r: any) => r.client_profile_id))];
  const { data: firsts } = await admin
    .from("bookings")
    .select("client_profile_id, starts_at")
    .eq("coach_profile_id", coachProfileId)
    .in("client_profile_id", clientIds)
    .in("status", ["CONFIRMED", "COMPLETED"])
    .order("starts_at");
  const firstByClient = new Map<string, string>();
  for (const f of firsts ?? []) {
    if (!firstByClient.has(f.client_profile_id)) firstByClient.set(f.client_profile_id, f.starts_at);
  }

  return rows.map((r: any) => {
    const loc = Array.isArray(r.booking_locations) ? r.booking_locations[0] : r.booking_locations;
    const svc = Array.isArray(r.coach_services) ? r.coach_services[0] : r.coach_services;
    const prof = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    return {
      id: r.id,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      status: r.status,
      clientName: prof?.full_name ?? "Client",
      serviceName: svc?.name ?? null,
      durationMinutes: Math.round((new Date(r.ends_at).getTime() - new Date(r.starts_at).getTime()) / 60000),
      priceCents: r.price_cents,
      locationLabel: loc?.neighbourhood ?? null,
      locationType: loc?.location_type ?? null,
      isFirstSession: firstByClient.get(r.client_profile_id) === r.starts_at,
    };
  });
}

export interface CoachDashboardData {
  profile: CoachProfileRow;
  todaySessions: SessionSummary[];
  nextSession: SessionSummary | null;
  week: {
    earningsCents: number;
    sessionCount: number;
    /** Bookable slots still unsold this week — drives the "you have N open
     * slots" nudge, which is the dashboard's one growth lever. */
    openSlots: number;
    /** 0-1 share of offered slots that sold. */
    bookedRate: number;
  };
  activeClients: number;
  publishBlockers: string[];
  profileQuality: number;
}

export async function getCoachDashboard(
  admin: SupabaseClient,
  profileId: string,
  now: Date = new Date()
): Promise<CoachDashboardData | null> {
  const profile = await getCoachProfile(admin, profileId);
  if (!profile) return null;

  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 864e5);
  const weekEnd = new Date(dayStart.getTime() + 7 * 864e5);

  const [todaySessions, weekSessions, services, skills, locations, rules, clients] = await Promise.all([
    getBookingsBetween(admin, profile.id, dayStart, dayEnd),
    getBookingsBetween(admin, profile.id, dayStart, weekEnd),
    admin.from("coach_services").select("id, duration_minutes").eq("coach_profile_id", profile.id).eq("is_active", true),
    admin.from("coach_skills").select("id").eq("coach_profile_id", profile.id),
    admin.from("coach_locations").select("id").eq("coach_profile_id", profile.id).eq("is_active", true),
    admin.from("coach_availability_rules").select("weekday, start_minute, end_minute").eq("coach_profile_id", profile.id).eq("is_active", true),
    admin.from("coach_client_relationships").select("id").eq("coach_profile_id", profile.id).eq("status", "active"),
  ]);

  // Upcoming session = first one that hasn't ended yet, today or later.
  const upcoming = weekSessions.find((s) => new Date(s.endsAt) > now) ?? null;

  const workingRules: WorkingRule[] = (rules.data ?? []).map((r: any) => ({
    weekday: r.weekday,
    startMinute: r.start_minute,
    endMinute: r.end_minute,
  }));

  // Open capacity: run the real availability engine over the rest of the
  // week, using booked sessions as busy time, so the number a coach sees is
  // the same number a client could actually book.
  const defaultDuration = (services.data ?? [])[0]?.duration_minutes ?? 60;

  // The coach's own connected calendar counts here too, or their dashboard
  // would claim open capacity that discovery and the booking page both
  // refuse to offer — the number is supposed to be what a client could
  // actually book.
  const externalBusy = await fetchBusyBlocks(admin, profile.id, now, weekEnd);

  const { slots } = calculateAvailableSlots({
    now,
    timezone: profile.timezone,
    dateRange: { from: now, to: weekEnd },
    serviceDurationMinutes: defaultDuration,
    slotIntervalMinutes: 60,
    workingRules,
    busy: [
      ...weekSessions.map((s) => ({ startsAt: new Date(s.startsAt), endsAt: new Date(s.endsAt) })),
      ...(externalBusy ?? []),
    ],
    bufferBeforeMinutes: profile.bufferBeforeMinutes,
    bufferAfterMinutes: profile.bufferAfterMinutes,
    minNoticeHours: profile.minNoticeHours,
    maxAdvanceDays: profile.maxAdvanceDays,
  });

  const earnedSessions = weekSessions.filter((s) => s.status === "CONFIRMED" || s.status === "COMPLETED");
  const earningsCents = earnedSessions.reduce(
    (sum, s) => sum + splitAmount(s.priceCents, DEFAULT_PLATFORM_FEE_PERCENT).coachAmountCents,
    0
  );
  const offered = slots.length + earnedSessions.length;

  const quality = profileQualityScore({
    hasPhoto: profile.hasPhoto,
    hasBio: !!profile.bio,
    hasCoverMedia: false,
    serviceCount: services.data?.length ?? 0,
    skillCount: skills.data?.length ?? 0,
    hasLocation: (locations.data?.length ?? 0) > 0,
    hasAvailability: workingRules.length > 0,
  });

  return {
    profile,
    todaySessions,
    nextSession: upcoming,
    week: {
      earningsCents,
      sessionCount: earnedSessions.length,
      openSlots: slots.length,
      bookedRate: offered > 0 ? earnedSessions.length / offered : 0,
    },
    activeClients: clients.data?.length ?? 0,
    publishBlockers: publishBlockers({
      hasPhoto: profile.hasPhoto,
      hasBio: !!profile.bio,
      serviceCount: services.data?.length ?? 0,
      skillCount: skills.data?.length ?? 0,
      hasLocation: (locations.data?.length ?? 0) > 0,
      hasAvailability: workingRules.length > 0,
      payoutsEnabled: profile.stripePayoutsEnabled,
    }),
    profileQuality: quality,
  };
}

export interface CalendarWeek {
  days: Array<{
    date: string;
    weekday: number;
    /** Working windows in local minutes, for the background shading. */
    workingWindows: Array<{ startMinute: number; endMinute: number }>;
    sessions: SessionSummary[];
    /** Google Calendar busy blocks, as opaque ranges. Times only — the
     * free/busy scope means no title, guest or location ever reaches us,
     * so there is nothing here that could leak what the coach is doing. */
    busyBlocks: Array<{ startsAt: string; endsAt: string }>;
  }>;
}

/** A week of the coach's calendar: working hours as background, real
 * bookings on top, and Google busy blocks as opaque ranges — sanitized to
 * times only, never event details (spec).
 *
 * Showing them matters beyond decoration: without them a coach sees a slot
 * missing from their availability with no visible reason, which reads as a
 * bug in Tistra rather than as their own dentist appointment. */
export async function getCoachCalendarWeek(
  admin: SupabaseClient,
  profileId: string,
  weekStart: Date
): Promise<CalendarWeek | null> {
  const profile = await getCoachProfile(admin, profileId);
  if (!profile) return null;

  const weekEnd = new Date(weekStart.getTime() + 7 * 864e5);
  const [sessions, rules, externalBusy] = await Promise.all([
    getBookingsBetween(admin, profile.id, weekStart, weekEnd),
    admin.from("coach_availability_rules").select("weekday, start_minute, end_minute").eq("coach_profile_id", profile.id).eq("is_active", true),
    fetchBusyBlocks(admin, profile.id, weekStart, weekEnd),
  ]);

  // Every key here is the coach's MARKET day, not the server's.
  //
  // This previously mixed three clocks: the day key came from UTC, busy
  // blocks were grouped by the server's local date, and the grid positions
  // everything in Singapore time. On Workers the server is UTC, so a busy
  // block between 00:00 and 06:00 SGT was filed under the previous day AND
  // drawn above the top of the grid — it vanished. Sessions had the same
  // flaw: an 01:00 SGT booking is 17:00Z the day before.
  //
  // zonedDateString/zonedWeekday are the same helpers the availability
  // engine uses, so the calendar and the slots a client is offered now
  // agree about which day a time belongs to.
  const tz = CLUB_MARKET.timezone;
  const dayKeys = eachZonedDate(weekStart, new Date(weekStart.getTime() + 6 * 864e5), tz).slice(0, 7);

  const days = dayKeys.map((dayKey) => {
    // Midday avoids any ambiguity at a DST edge when reading the weekday.
    const weekday = zonedWeekday(zonedTimeToInstant(dayKey, 12 * 60, tz), tz);
    return {
      date: dayKey,
      weekday,
      workingWindows: (rules.data ?? [])
        .filter((r: any) => r.weekday === weekday)
        .map((r: any) => ({ startMinute: r.start_minute, endMinute: r.end_minute })),
      sessions: sessions.filter((s) => zonedDateString(new Date(s.startsAt), tz) === dayKey),
      busyBlocks: (externalBusy ?? [])
        .filter((b) => zonedDateString(b.startsAt, tz) === dayKey)
        .map((b) => ({ startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString() })),
    };
  });

  return { days };
}

export interface CoachClientRow {
  clientProfileId: string;
  name: string;
  sessionCount: number;
  lastSessionAt: string | null;
  nextSessionAt: string | null;
  nutritionSharingEnabled: boolean;
}

export async function getCoachClients(
  admin: SupabaseClient,
  profileId: string
): Promise<CoachClientRow[]> {
  const profile = await getCoachProfile(admin, profileId);
  if (!profile) return [];

  const { data: rels } = await admin
    .from("coach_client_relationships")
    .select("client_profile_id, session_count, last_session_at, profiles!coach_client_relationships_client_profile_id_fkey(full_name)")
    .eq("coach_profile_id", profile.id)
    .order("last_session_at", { ascending: false, nullsFirst: false });

  const rows = rels ?? [];
  if (rows.length === 0) return [];
  const clientIds = rows.map((r: any) => r.client_profile_id);

  const [{ data: upcoming }, { data: perms }] = await Promise.all([
    admin
      .from("bookings")
      .select("client_profile_id, starts_at")
      .eq("coach_profile_id", profile.id)
      .in("client_profile_id", clientIds)
      .eq("status", "CONFIRMED")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at"),
    admin
      .from("client_coach_permissions")
      .select("client_profile_id, nutrition_summary_enabled, revoked_at")
      .eq("coach_profile_id", profile.id)
      .in("client_profile_id", clientIds),
  ]);

  const nextByClient = new Map<string, string>();
  for (const b of upcoming ?? []) if (!nextByClient.has(b.client_profile_id)) nextByClient.set(b.client_profile_id, b.starts_at);
  // Revocation is checked on read, so switching sharing off takes effect
  // immediately with no cache to purge (ADR-007).
  const sharingByClient = new Map<string, boolean>();
  for (const p of perms ?? []) sharingByClient.set(p.client_profile_id, p.nutrition_summary_enabled && !p.revoked_at);

  return rows.map((r: any) => {
    const prof = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    return {
      clientProfileId: r.client_profile_id,
      name: prof?.full_name ?? "Client",
      sessionCount: r.session_count,
      lastSessionAt: r.last_session_at,
      nextSessionAt: nextByClient.get(r.client_profile_id) ?? null,
      nutritionSharingEnabled: sharingByClient.get(r.client_profile_id) ?? false,
    };
  });
}

export interface CoachPaymentsSummary {
  lifetimeEarningsCents: number;
  pendingPayoutCents: number;
  payoutsEnabled: boolean;
  currency: string;
  recent: Array<{
    id: string;
    createdAt: string;
    clientName: string;
    grossCents: number;
    platformFeeCents: number;
    coachAmountCents: number;
    status: string;
  }>;
}

export async function getCoachPayments(
  admin: SupabaseClient,
  profileId: string
): Promise<CoachPaymentsSummary | null> {
  const profile = await getCoachProfile(admin, profileId);
  if (!profile) return null;

  const { data } = await admin
    .from("club_payments")
    .select("id, created_at, gross_amount_cents, platform_fee_cents, coach_amount_cents, status, currency, profiles!club_payments_client_profile_id_fkey(full_name)")
    .eq("coach_profile_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = data ?? [];
  const succeeded = rows.filter((r: any) => r.status === "succeeded");
  return {
    lifetimeEarningsCents: succeeded.reduce((s: number, r: any) => s + r.coach_amount_cents, 0),
    // Everything succeeded but not yet paid out. Real payout scheduling
    // arrives with Stripe Connect; until then this is what's owed.
    pendingPayoutCents: succeeded.reduce((s: number, r: any) => s + r.coach_amount_cents, 0),
    payoutsEnabled: profile.stripePayoutsEnabled,
    currency: rows[0]?.currency ?? CLUB_MARKET.currency,
    recent: rows.map((r: any) => {
      const prof = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
      return {
        id: r.id,
        createdAt: r.created_at,
        clientName: prof?.full_name ?? "Client",
        grossCents: r.gross_amount_cents,
        platformFeeCents: r.platform_fee_cents,
        coachAmountCents: r.coach_amount_cents,
        status: r.status,
      };
    }),
  };
}
