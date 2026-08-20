"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { publishBlockers } from "@/lib/club/ranking";
import { CLUB_MARKET, COACH_MEDIA_BUCKET } from "@/lib/club/config";
import { CLUB_CANONICAL_ORIGIN } from "@/lib/club/host";
import { disconnectCalendar } from "@/lib/club/calendar";
import { checkUpload, coachMediaPath, MAX_GALLERY_IMAGES } from "@/lib/club/media";
import { validateBookingPreferences, type BookingPreferences } from "@/lib/club/booking-preferences";
import {
  ensureConnectAccount,
  createOnboardingLink,
  createDashboardLink,
  refreshAccountState,
} from "@/lib/club/stripe-connect";

// Every write a coach can make to their own marketplace presence.
//
// Authorization pattern, applied without exception: each action resolves
// the coach_profiles row from the SIGNED-IN user, then scopes every
// subsequent query by that row's id. No action accepts a coachProfileId
// from the caller, so no caller can act on another coach's data — the
// dangerous parameter simply doesn't exist in any signature.
//
// Server actions rather than API routes because these are form submissions
// from the coach's own pages; the marketplace's public read APIs (for the
// consumer app and any future native client) are separate.

/** Resolves the signed-in user's coach profile, creating one on first use.
 * Returns null only when nobody is signed in. */
async function requireCoachProfile(): Promise<{ id: string; profileId: string } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createServiceClient();
  const { data: existing } = await admin
    .from("coach_profiles")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (existing) return { id: existing.id, profileId: user.id };

  // First visit to the coach product: create the draft profile rather than
  // making the coach click "become a coach" before they can do anything.
  const { data: profile } = await admin.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  const { data: created, error } = await admin
    .from("coach_profiles")
    .insert({
      profile_id: user.id,
      display_name: profile?.full_name?.trim() || "New coach",
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !created) return null;
  return { id: created.id, profileId: user.id };
}

type ActionResult = { ok: true } | { ok: false; error: string };

const NOT_AUTHED: ActionResult = { ok: false, error: "Please sign in again." };

function revalidateCoach() {
  revalidatePath("/dashboard");
  revalidatePath("/settings");
}

// ---- Profile basics --------------------------------------------------

export async function updateCoachProfile(input: {
  displayName: string;
  headline?: string;
  bio?: string;
  yearsCoaching?: number;
  languages?: string[];
  preferredClients?: string;
}): Promise<ActionResult> {
  const coach = await requireCoachProfile();
  if (!coach) return NOT_AUTHED;

  const displayName = input.displayName?.trim();
  if (!displayName) return { ok: false, error: "Your name can't be empty." };

  const admin = createServiceClient();
  const { error } = await admin
    .from("coach_profiles")
    .update({
      display_name: displayName,
      headline: input.headline?.trim() || null,
      bio: input.bio?.trim() || null,
      years_coaching: input.yearsCoaching ?? null,
      languages: input.languages?.length ? input.languages : ["English"],
      preferred_clients: input.preferredClients?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", coach.id);

  if (error) return { ok: false, error: error.message };
  revalidateCoach();
  return { ok: true };
}

/** Scheduling guardrails. Kept separate from profile basics because these
 * change availability for everyone who can see this coach, and a mistake
 * here silently costs bookings. */
export async function updateCoachScheduling(input: {
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minNoticeHours: number;
  maxAdvanceDays: number;
}): Promise<ActionResult> {
  const coach = await requireCoachProfile();
  if (!coach) return NOT_AUTHED;

  // Clamp rather than reject: these arrive from number inputs, and a coach
  // typing 999 means "a lot", not "fail my form".
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n || 0)));

  const admin = createServiceClient();
  const { error } = await admin
    .from("coach_profiles")
    .update({
      buffer_before_minutes: clamp(input.bufferBeforeMinutes, 0, 120),
      buffer_after_minutes: clamp(input.bufferAfterMinutes, 0, 120),
      min_notice_hours: clamp(input.minNoticeHours, 0, 168),
      max_advance_days: clamp(input.maxAdvanceDays, 1, 365),
      updated_at: new Date().toISOString(),
    })
    .eq("id", coach.id);

  if (error) return { ok: false, error: error.message };
  revalidateCoach();
  return { ok: true };
}

// ---- Skills ----------------------------------------------------------

export async function setCoachSkills(skillIds: string[]): Promise<ActionResult> {
  const coach = await requireCoachProfile();
  if (!coach) return NOT_AUTHED;

  const admin = createServiceClient();
  // Replace wholesale: the UI submits the complete selection, and diffing
  // would leave orphans whenever a request is retried.
  await admin.from("coach_skills").delete().eq("coach_profile_id", coach.id);
  if (skillIds.length > 0) {
    const { error } = await admin.from("coach_skills").insert(
      skillIds.map((skillId, i) => ({
        coach_profile_id: coach.id,
        skill_id: skillId,
        is_primary: i === 0,
      }))
    );
    if (error) return { ok: false, error: error.message };
  }
  revalidateCoach();
  return { ok: true };
}

// ---- Services --------------------------------------------------------

export async function upsertCoachService(input: {
  id?: string;
  name: string;
  skillId?: string | null;
  description?: string;
  durationMinutes: number;
  priceCents: number;
  travelEnabled: boolean;
  allowedLocationTypes: string[];
}): Promise<ActionResult> {
  const coach = await requireCoachProfile();
  if (!coach) return NOT_AUTHED;

  if (!input.name?.trim()) return { ok: false, error: "Give this service a name." };
  if (input.durationMinutes <= 0) return { ok: false, error: "Duration must be more than zero." };
  if (input.priceCents < 0) return { ok: false, error: "Price can't be negative." };

  const admin = createServiceClient();
  const payload = {
    coach_profile_id: coach.id,
    name: input.name.trim(),
    skill_id: input.skillId || null,
    description: input.description?.trim() || null,
    duration_minutes: Math.round(input.durationMinutes),
    price_cents: Math.round(input.priceCents),
    currency: CLUB_MARKET.currency,
    travel_enabled: input.travelEnabled,
    allowed_location_types: input.allowedLocationTypes.length
      ? input.allowedLocationTypes
      : ["COACH_LOCATION"],
    updated_at: new Date().toISOString(),
  };

  // Scoped by coach id as well as row id, so a forged service id belonging
  // to another coach matches nothing rather than being updated.
  const { error } = input.id
    ? await admin.from("coach_services").update(payload).eq("id", input.id).eq("coach_profile_id", coach.id)
    : await admin.from("coach_services").insert(payload);

  if (error) return { ok: false, error: error.message };
  revalidateCoach();
  return { ok: true };
}

export async function setServiceActive(serviceId: string, isActive: boolean): Promise<ActionResult> {
  const coach = await requireCoachProfile();
  if (!coach) return NOT_AUTHED;
  const admin = createServiceClient();
  const { error } = await admin
    .from("coach_services")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", serviceId)
    .eq("coach_profile_id", coach.id);
  if (error) return { ok: false, error: error.message };
  revalidateCoach();
  return { ok: true };
}

// ---- Locations and travel -------------------------------------------

export async function upsertCoachLocation(input: {
  id?: string;
  label: string;
  locationType: "COACH_LOCATION" | "OUTDOOR" | "ONLINE";
  neighbourhood?: string;
  addressLine?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  /** Default false. A home studio must not be published by accident, so
   * this is only ever true when the coach explicitly opts in. */
  addressIsPublic?: boolean;
  isPrimary?: boolean;
}): Promise<ActionResult> {
  const coach = await requireCoachProfile();
  if (!coach) return NOT_AUTHED;

  // A name is only useful to a coach juggling several places. With one
  // location it is a required field asking someone to invent a label for
  // the only answer, so it falls back to their neighbourhood.
  const label = input.label?.trim() || input.neighbourhood?.trim() || "Main location";

  const admin = createServiceClient();
  const payload = {
    coach_profile_id: coach.id,
    label,
    location_type: input.locationType,
    neighbourhood: input.neighbourhood?.trim() || null,
    address_line: input.addressLine?.trim() || null,
    postal_code: input.postalCode?.trim() || null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    country_code: CLUB_MARKET.countryCode,
    address_is_public: input.addressIsPublic === true,
    is_primary: input.isPrimary === true,
    updated_at: new Date().toISOString(),
  };

  if (input.isPrimary) {
    // Only one primary; demote the rest first so travel origin stays
    // unambiguous.
    await admin.from("coach_locations").update({ is_primary: false }).eq("coach_profile_id", coach.id);
  }

  const { error } = input.id
    ? await admin.from("coach_locations").update(payload).eq("id", input.id).eq("coach_profile_id", coach.id)
    : await admin.from("coach_locations").insert(payload);

  if (error) return { ok: false, error: error.message };
  revalidateCoach();
  return { ok: true };
}

export async function updateTravelRules(input: {
  travelEnabled: boolean;
  maxTravelKm: number;
  travelBufferMinutes: number;
  serviceAreas: string[];
  feeBands?: Array<{ uptoKm: number; feeCents: number }>;
}): Promise<ActionResult> {
  const coach = await requireCoachProfile();
  if (!coach) return NOT_AUTHED;

  const admin = createServiceClient();
  const { data: primary } = await admin
    .from("coach_locations")
    .select("id")
    .eq("coach_profile_id", coach.id)
    .eq("is_primary", true)
    .maybeSingle();

  const { error } = await admin.from("coach_travel_rules").upsert(
    {
      coach_profile_id: coach.id,
      travel_enabled: input.travelEnabled,
      origin_location_id: primary?.id ?? null,
      max_travel_km: Math.max(0, input.maxTravelKm || 0),
      travel_buffer_minutes: Math.max(0, Math.round(input.travelBufferMinutes || 0)),
      ...(input.feeBands?.length ? { fee_bands: input.feeBands } : {}),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "coach_profile_id" }
  );
  if (error) return { ok: false, error: error.message };

  await admin.from("coach_service_areas").delete().eq("coach_profile_id", coach.id);
  if (input.serviceAreas.length > 0) {
    await admin.from("coach_service_areas").insert(
      input.serviceAreas.map((area) => ({
        coach_profile_id: coach.id,
        area_name: area,
        country_code: CLUB_MARKET.countryCode,
      }))
    );
  }

  revalidateCoach();
  return { ok: true };
}

// ---- Availability ----------------------------------------------------

export async function setAvailabilityRules(
  rules: Array<{ weekday: number; startMinute: number; endMinute: number }>
): Promise<ActionResult> {
  const coach = await requireCoachProfile();
  if (!coach) return NOT_AUTHED;

  for (const r of rules) {
    if (r.weekday < 0 || r.weekday > 6) return { ok: false, error: "Invalid day." };
    if (r.endMinute <= r.startMinute) return { ok: false, error: "End time must be after start time." };
  }

  // A day may hold several windows — mornings and evenings, with a gap for
  // a day job. They must not overlap: the availability engine unions
  // windows per day, so an overlap silently collapses into one long block,
  // and a coach who thought they had closed the middle of the day gets
  // booked in it.
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  for (let weekday = 0; weekday <= 6; weekday++) {
    const sameDay = rules
      .filter((r) => r.weekday === weekday)
      .sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 1; i < sameDay.length; i++) {
      if (sameDay[i].startMinute < sameDay[i - 1].endMinute) {
        return { ok: false, error: `Your ${DAY_NAMES[weekday]} times overlap. Adjust them so they don't run into each other.` };
      }
    }
  }

  const admin = createServiceClient();
  await admin.from("coach_availability_rules").delete().eq("coach_profile_id", coach.id);
  if (rules.length > 0) {
    const { error } = await admin.from("coach_availability_rules").insert(
      rules.map((r) => ({
        coach_profile_id: coach.id,
        weekday: r.weekday,
        start_minute: r.startMinute,
        end_minute: r.endMinute,
      }))
    );
    if (error) return { ok: false, error: error.message };
  }
  revalidateCoach();
  return { ok: true };
}

/** One-off blocked time (holiday, injury) or an extra window outside normal
 * hours. Absolute instants, so a block spanning midnight is unambiguous. */
export async function addAvailabilityException(input: {
  startsAt: string;
  endsAt: string;
  type: "blocked" | "extra";
  reason?: string;
}): Promise<ActionResult> {
  const coach = await requireCoachProfile();
  if (!coach) return NOT_AUTHED;
  if (new Date(input.endsAt) <= new Date(input.startsAt)) {
    return { ok: false, error: "End must be after start." };
  }

  const admin = createServiceClient();

  // Blocking time that already has sessions in it would strand real
  // clients: the booking survives, but it now sits outside the coach's
  // availability, so nobody is told and the coach may not notice until
  // someone turns up. Name the clash and let them cancel deliberately.
  if (input.type === "blocked") {
    const { data: clashes } = await admin
      .from("bookings")
      .select("starts_at, coach_services(name)")
      .eq("coach_profile_id", coach.id)
      .in("status", ["CONFIRMED", "PAYMENT_PENDING"])
      .lt("starts_at", input.endsAt)
      .gt("ends_at", input.startsAt)
      .order("starts_at");

    if (clashes && clashes.length > 0) {
      const when = new Intl.DateTimeFormat("en-SG", {
        timeZone: CLUB_MARKET.timezone,
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(new Date((clashes[0] as any).starts_at));
      const extra = clashes.length > 1 ? ` and ${clashes.length - 1} more` : "";
      return {
        ok: false,
        error: `You have a session booked on ${when}${extra} in that period. Cancel it first if you're not available.`,
      };
    }
  }

  const { error } = await admin.from("coach_availability_exceptions").insert({
    coach_profile_id: coach.id,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    exception_type: input.type,
    reason: input.reason?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidateCoach();
  return { ok: true };
}

export async function removeAvailabilityException(exceptionId: string): Promise<ActionResult> {
  const coach = await requireCoachProfile();
  if (!coach) return NOT_AUTHED;
  const admin = createServiceClient();
  const { error } = await admin
    .from("coach_availability_exceptions")
    .delete()
    .eq("id", exceptionId)
    .eq("coach_profile_id", coach.id);
  if (error) return { ok: false, error: error.message };
  revalidateCoach();
  return { ok: true };
}

// ---- Publishing ------------------------------------------------------

/**
 * Publishing is gated on the profile actually being bookable — a published
 * profile with no service, location or availability wastes every consumer
 * tap it receives and makes the marketplace look broken. The blocker list
 * is computed server-side so a client that hides the button isn't the only
 * thing standing between an empty profile and search results.
 */
export async function setCoachPublished(publish: boolean): Promise<ActionResult & { blockers?: string[] }> {
  const coach = await requireCoachProfile();
  if (!coach) return NOT_AUTHED;

  const admin = createServiceClient();

  if (publish) {
    const [{ data: profile }, services, skills, locations, rules] = await Promise.all([
      admin.from("coach_profiles").select("photo_url, bio, stripe_payouts_enabled").eq("id", coach.id).single(),
      admin.from("coach_services").select("id").eq("coach_profile_id", coach.id).eq("is_active", true),
      admin.from("coach_skills").select("id").eq("coach_profile_id", coach.id),
      admin.from("coach_locations").select("id").eq("coach_profile_id", coach.id).eq("is_active", true),
      admin.from("coach_availability_rules").select("id").eq("coach_profile_id", coach.id).eq("is_active", true),
    ]);

    const blockers = publishBlockers({
      hasPhoto: !!profile?.photo_url,
      hasBio: !!profile?.bio,
      serviceCount: services.data?.length ?? 0,
      skillCount: skills.data?.length ?? 0,
      hasLocation: (locations.data?.length ?? 0) > 0,
      hasAvailability: (rules.data?.length ?? 0) > 0,
      payoutsEnabled: !!profile?.stripe_payouts_enabled,
    });

    if (blockers.length > 0) {
      return { ok: false, error: "Your profile isn't ready to publish yet.", blockers };
    }
  }

  const { error } = await admin
    .from("coach_profiles")
    .update({
      status: publish ? "published" : "paused",
      published_at: publish ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", coach.id);

  if (error) return { ok: false, error: error.message };
  revalidateCoach();
  return { ok: true };
}

/** Uploads (or replaces) the coach's profile photo.
 *
 * Stores a bare storage path, never a URL: the bucket is private, so reads
 * go through a signed URL generated at render time. The old file is deleted
 * after the new path is saved — that order means a failed delete leaves an
 * orphan rather than a profile pointing at nothing. */
export async function uploadCoachPhoto(formData: FormData): Promise<ActionResult> {
  const profile = await requireCoachProfile();
  if (!profile) return NOT_AUTHED;

  const file = formData.get("photo");
  if (!(file instanceof File)) return { ok: false, error: "No photo was selected." };
  const check = checkUpload(file);
  if (!check.ok) return { ok: false, error: check.error };

  const admin = createServiceClient();
  const { data: existing } = await admin
    .from("coach_profiles")
    .select("photo_url")
    .eq("id", profile.id)
    .maybeSingle();

  const path = coachMediaPath(profile.id, "profile", file);
  const { error: uploadError } = await admin.storage
    .from(COACH_MEDIA_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return { ok: false, error: uploadError.message };

  const { error } = await admin.from("coach_profiles").update({ photo_url: path }).eq("id", profile.id);
  if (error) return { ok: false, error: error.message };

  const previous = existing?.photo_url;
  if (previous && !previous.startsWith("http")) {
    await admin.storage.from(COACH_MEDIA_BUCKET).remove([previous]).catch(() => {});
  }

  revalidateCoach();
  return { ok: true };
}

/** Adds an image to the coach's gallery, which is what the discovery card
 * pages through. Bounded so one coach can't upload without limit. */
export async function addCoachGalleryImage(formData: FormData): Promise<ActionResult> {
  const profile = await requireCoachProfile();
  if (!profile) return NOT_AUTHED;

  const file = formData.get("photo");
  if (!(file instanceof File)) return { ok: false, error: "No photo was selected." };
  const check = checkUpload(file);
  if (!check.ok) return { ok: false, error: check.error };

  const admin = createServiceClient();
  const { data: current } = await admin
    .from("coach_media")
    .select("id, sort_order")
    .eq("coach_profile_id", profile.id)
    .eq("media_type", "image")
    .order("sort_order", { ascending: false });

  if ((current ?? []).length >= MAX_GALLERY_IMAGES) {
    return { ok: false, error: `You can have up to ${MAX_GALLERY_IMAGES} gallery photos.` };
  }

  const path = coachMediaPath(profile.id, "gallery", file);
  const { error: uploadError } = await admin.storage
    .from(COACH_MEDIA_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return { ok: false, error: uploadError.message };

  const { error } = await admin.from("coach_media").insert({
    coach_profile_id: profile.id,
    media_type: "image",
    storage_path: path,
    sort_order: ((current ?? [])[0]?.sort_order ?? 0) + 1,
  });
  if (error) {
    // Don't leave a file behind that no row points at.
    await admin.storage.from(COACH_MEDIA_BUCKET).remove([path]).catch(() => {});
    return { ok: false, error: error.message };
  }

  revalidateCoach();
  return { ok: true };
}

/** Removes a gallery image. Scoped by coach profile id so the media id
 * alone can't be used to delete another coach's photo. */
export async function deleteCoachGalleryImage(formData: FormData): Promise<ActionResult> {
  const profile = await requireCoachProfile();
  if (!profile) return NOT_AUTHED;

  const mediaId = String(formData.get("mediaId") ?? "");
  if (!mediaId) return { ok: false, error: "Nothing to remove." };

  const admin = createServiceClient();
  const { data: row } = await admin
    .from("coach_media")
    .select("id, storage_path")
    .eq("id", mediaId)
    .eq("coach_profile_id", profile.id)
    .maybeSingle();
  if (!row) return { ok: false, error: "That photo no longer exists." };

  await admin.from("coach_media").delete().eq("id", row.id).eq("coach_profile_id", profile.id);
  await admin.storage.from(COACH_MEDIA_BUCKET).remove([row.storage_path]).catch(() => {});

  revalidateCoach();
  return { ok: true };
}

/**
 * Booking rules and cancellation policy.
 *
 * Changing the cancellation policy affects FUTURE bookings only. Existing
 * ones carry a snapshot taken at checkout (see convertHoldToBooking), so a
 * client keeps the terms they actually agreed to — a coach cannot tighten
 * their policy and have it apply retroactively to sessions already sold.
 */
export async function updateBookingPreferences(
  input: Partial<Record<keyof BookingPreferences, unknown>>
): Promise<ActionResult> {
  const coach = await requireCoachProfile();
  if (!coach) return NOT_AUTHED;

  const parsed = validateBookingPreferences(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const v = parsed.value;

  const admin = createServiceClient();
  const { error } = await admin
    .from("coach_profiles")
    .update({
      buffer_before_minutes: v.bufferBeforeMinutes,
      buffer_after_minutes: v.bufferAfterMinutes,
      min_notice_hours: v.minNoticeHours,
      max_advance_days: v.maxAdvanceDays,
      cancellation_full_refund_hours: v.cancellationFullRefundHours,
      cancellation_partial_refund_percent: v.cancellationPartialRefundPercent,
      updated_at: new Date().toISOString(),
    })
    .eq("id", coach.id);

  if (error) return { ok: false, error: error.message };

  revalidateCoach();
  return { ok: true };
}

type LinkResult = { ok: true; url: string } | { ok: false; error: string };

/** Starts (or resumes) Stripe Connect onboarding and returns the hosted
 * link to send the coach to.
 *
 * Onboarding links are single-use and expire in minutes, so one is minted
 * per click rather than stored. Stripe collects identity, bank details and
 * tax information itself — none of it passes through us. */
export async function startPayoutOnboarding(origin: string): Promise<LinkResult> {
  const coach = await requireCoachProfile();
  if (!coach) return { ok: false, error: "Please sign in again." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createServiceClient();
  try {
    const accountId = await ensureConnectAccount(
      admin,
      coach.id,
      user?.email,
      CLUB_MARKET.countryCode,
      CLUB_CANONICAL_ORIGIN
    );
    const url = await createOnboardingLink(
      accountId,
      `${origin}/payouts/return`,
      `${origin}/payouts/refresh`
    );
    return { ok: true, url };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't reach Stripe." };
  }
}

/** Link into Stripe's Express dashboard, where a coach changes their bank
 * details and sees payouts. */
export async function openPayoutDashboard(): Promise<LinkResult> {
  const coach = await requireCoachProfile();
  if (!coach) return { ok: false, error: "Please sign in again." };

  const admin = createServiceClient();
  const { data } = await admin
    .from("coach_profiles")
    .select("stripe_account_id")
    .eq("id", coach.id)
    .maybeSingle();
  if (!data?.stripe_account_id) return { ok: false, error: "Set up payouts first." };

  try {
    return { ok: true, url: await createDashboardLink(data.stripe_account_id) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't reach Stripe." };
  }
}

/** Re-reads the account from Stripe. Called when a coach returns from
 * onboarding, and available as a manual retry — Stripe can take a moment
 * to finish verifying after the coach is redirected back. */
export async function refreshPayoutStatus(): Promise<ActionResult> {
  const coach = await requireCoachProfile();
  if (!coach) return NOT_AUTHED;

  const admin = createServiceClient();
  const { data } = await admin
    .from("coach_profiles")
    .select("stripe_account_id")
    .eq("id", coach.id)
    .maybeSingle();
  if (!data?.stripe_account_id) return { ok: false, error: "Payouts haven't been set up yet." };

  try {
    await refreshAccountState(admin, coach.id, data.stripe_account_id);
    revalidateCoach();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't reach Stripe." };
  }
}

/** Detaches the coach's Google Calendar. The stored tokens are deleted
 * rather than flagged — keeping credentials for a connection a coach has
 * explicitly ended is not defensible. */
export async function disconnectCoachCalendar(): Promise<ActionResult> {
  const coach = await requireCoachProfile();
  if (!coach) return NOT_AUTHED;

  await disconnectCalendar(createServiceClient(), coach.id);
  revalidateCoach();
  return { ok: true };
}

/** Makes one location the primary, unsetting the others.
 *
 * The primary is what discovery shows and what a booking defaults to, so
 * exactly one must hold the flag — the column has no constraint enforcing
 * that, and two primaries would make "where do you coach" answer
 * arbitrarily. */
export async function setPrimaryCoachLocation(locationId: string): Promise<ActionResult> {
  const coach = await requireCoachProfile();
  if (!coach) return NOT_AUTHED;

  const admin = createServiceClient();
  const { data: owned } = await admin
    .from("coach_locations")
    .select("id")
    .eq("id", locationId)
    .eq("coach_profile_id", coach.id)
    .maybeSingle();
  if (!owned) return { ok: false, error: "That location no longer exists." };

  await admin
    .from("coach_locations")
    .update({ is_primary: false })
    .eq("coach_profile_id", coach.id);
  const { error } = await admin
    .from("coach_locations")
    .update({ is_primary: true, updated_at: new Date().toISOString() })
    .eq("id", locationId)
    .eq("coach_profile_id", coach.id);
  if (error) return { ok: false, error: error.message };

  revalidateCoach();
  return { ok: true };
}

/**
 * Removes a location.
 *
 * Two refusals, both protecting someone other than the coach:
 *
 *  - The last location can't go. "Add where you coach" is a publish
 *    blocker, so deleting the only one would silently unpublish a live
 *    profile from a screen that says nothing about publishing.
 *  - A location with upcoming sessions can't go. booking_locations
 *    references it with ON DELETE SET NULL, so the booking would survive
 *    while quietly losing the exact address the client was promised on
 *    confirmation.
 */
export async function deleteCoachLocation(locationId: string): Promise<ActionResult> {
  const coach = await requireCoachProfile();
  if (!coach) return NOT_AUTHED;

  const admin = createServiceClient();
  const [{ data: mine }, { data: upcoming }] = await Promise.all([
    admin.from("coach_locations").select("id, is_primary").eq("coach_profile_id", coach.id).eq("is_active", true),
    admin
      .from("booking_locations")
      .select("booking_id, bookings!inner(starts_at, status)")
      .eq("coach_location_id", locationId)
      .gte("bookings.starts_at", new Date().toISOString())
      .in("bookings.status", ["CONFIRMED", "PAYMENT_PENDING"]),
  ]);

  const locations = mine ?? [];
  if (!locations.some((l: any) => l.id === locationId)) {
    return { ok: false, error: "That location no longer exists." };
  }
  if (locations.length <= 1) {
    return { ok: false, error: "This is your only location. Add another before removing this one." };
  }
  if ((upcoming ?? []).length > 0) {
    const n = (upcoming ?? []).length;
    return {
      ok: false,
      error: `${n} upcoming ${n === 1 ? "session is" : "sessions are"} booked at this location. Move or cancel ${n === 1 ? "it" : "them"} first.`,
    };
  }

  const wasPrimary = locations.find((l: any) => l.id === locationId)?.is_primary;
  const { error } = await admin
    .from("coach_locations")
    .delete()
    .eq("id", locationId)
    .eq("coach_profile_id", coach.id);
  if (error) return { ok: false, error: error.message };

  // Never leave a coach with locations but no primary.
  if (wasPrimary) {
    const next = locations.find((l: any) => l.id !== locationId);
    if (next) {
      await admin.from("coach_locations").update({ is_primary: true }).eq("id", next.id);
    }
  }

  revalidateCoach();
  return { ok: true };
}
