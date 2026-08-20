import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { CoachShell } from "@/components/coach/CoachShell";
import { CoachPageHeader } from "@/components/coach/CoachShell";
import { CoachSettings, type SettingsData } from "@/components/coach/CoachSettings";
import { publishBlockers } from "@/lib/club/ranking";
import { resolveSignedCoachPhotoUrl, resolveSignedCoachPhotoUrls } from "@/lib/club/media";
import { getPlatformFeePercent } from "@/lib/club/platform-fee";
import { getCalendarState } from "@/lib/club/calendar";

// Coach profile / onboarding. This route is also the landing place for a
// brand-new coach: /coach/dashboard redirects here when no coach_profiles
// row exists yet, so it must work for someone who has nothing set up.
export default async function CoachSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?product=coach");

  const admin = createServiceClient();

  // Create the draft profile on first visit rather than making the coach
  // click "become a coach" before they can enter anything.
  let { data: coach } = await admin
    .from("coach_profiles")
    .select("id, display_name, headline, bio, years_coaching, status, photo_url, languages, stripe_payouts_enabled, stripe_account_id, stripe_onboarding_status, buffer_before_minutes, buffer_after_minutes, min_notice_hours, max_advance_days, cancellation_full_refund_hours, cancellation_partial_refund_percent")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!coach) {
    const { data: profile } = await admin.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    const { data: created } = await admin
      .from("coach_profiles")
      .insert({
        profile_id: user.id,
        display_name: profile?.full_name?.trim() || "New coach",
        status: "draft",
      })
      .select("id, display_name, headline, bio, years_coaching, status, photo_url, languages, stripe_payouts_enabled, stripe_account_id, stripe_onboarding_status, buffer_before_minutes, buffer_after_minutes, min_notice_hours, max_advance_days, cancellation_full_refund_hours, cancellation_partial_refund_percent")
      .single();
    coach = created;
  }
  if (!coach) redirect("/dashboard");

  const [allSkills, mySkills, services, locations, travel, availability] = await Promise.all([
    admin.from("club_skills").select("id, name, slug").eq("is_active", true).order("sort_order"),
    admin.from("coach_skills").select("skill_id").eq("coach_profile_id", coach.id),
    admin.from("coach_services").select("id, name, duration_minutes, price_cents, is_active, travel_enabled, skill_id").eq("coach_profile_id", coach.id).order("created_at"),
    admin.from("coach_locations").select("id, label, neighbourhood, address_is_public, is_primary, latitude, longitude, address_line, postal_code").eq("coach_profile_id", coach.id).eq("is_active", true).order("is_primary", { ascending: false }).order("created_at"),
    admin.from("coach_travel_rules").select("travel_enabled, max_travel_km, travel_buffer_minutes").eq("coach_profile_id", coach.id).maybeSingle(),
    admin.from("coach_availability_rules").select("weekday, start_minute, end_minute").eq("coach_profile_id", coach.id).eq("is_active", true),
  ]);

  // Photos live in a private bucket, so both the portrait and the gallery
  // are resolved to signed URLs here rather than handing paths to the
  // browser.
  const { data: media } = await admin
    .from("coach_media")
    .select("id, storage_path")
    .eq("coach_profile_id", coach.id)
    .eq("media_type", "image")
    .order("sort_order");

  const [signedPortrait, signedGallery] = await Promise.all([
    resolveSignedCoachPhotoUrl(admin, coach.photo_url),
    resolveSignedCoachPhotoUrls(admin, (media ?? []).map((m: any) => m.storage_path)),
  ]);

  // Upcoming closures only — past time off is history a coach can't act on.
  const { data: timeOff } = await admin
    .from("coach_availability_exceptions")
    .select("id, starts_at, ends_at, reason")
    .eq("coach_profile_id", coach.id)
    .eq("exception_type", "blocked")
    .gte("ends_at", new Date().toISOString())
    .order("starts_at");

  const { data: areas } = await admin
    .from("coach_service_areas")
    .select("area_name")
    .eq("coach_profile_id", coach.id);

  const activeServices = (services.data ?? []).filter((s: any) => s.is_active);

  const data: SettingsData = {
    profile: {
      displayName: coach.display_name,
      headline: coach.headline,
      bio: coach.bio,
      yearsCoaching: coach.years_coaching,
      languages: Array.isArray(coach.languages) ? coach.languages : [],
      status: coach.status,
      photoUrl: signedPortrait ?? null,
    },
    calendar: await getCalendarState(admin, coach.id),
    timeOff: (timeOff ?? []).map((e: any) => ({
      id: e.id,
      startsAt: e.starts_at,
      endsAt: e.ends_at,
      reason: e.reason,
    })),
    payouts: {
      status: coach.stripe_onboarding_status,
      payoutsEnabled: coach.stripe_payouts_enabled,
      hasAccount: !!coach.stripe_account_id,
      feePercent: await getPlatformFeePercent(admin),
    },
    bookingPreferences: {
      bufferBeforeMinutes: coach.buffer_before_minutes,
      bufferAfterMinutes: coach.buffer_after_minutes,
      minNoticeHours: coach.min_notice_hours,
      maxAdvanceDays: coach.max_advance_days,
      cancellationFullRefundHours: coach.cancellation_full_refund_hours,
      cancellationPartialRefundPercent: coach.cancellation_partial_refund_percent,
    },
    gallery: (media ?? [])
      .map((m: any, i: number) => ({ id: m.id, url: signedGallery[i] }))
      // A photo that failed to sign is dropped rather than rendered broken.
      .filter((g: any): g is { id: string; url: string } => !!g.url),
    allSkills: allSkills.data ?? [],
    selectedSkillIds: (mySkills.data ?? []).map((s: any) => s.skill_id),
    services: (services.data ?? []).map((s: any) => ({
      id: s.id,
      name: s.name,
      durationMinutes: s.duration_minutes,
      priceCents: s.price_cents,
      isActive: s.is_active,
      travelEnabled: s.travel_enabled,
      skillId: s.skill_id,
    })),
    locations: (locations.data ?? []).map((l: any) => ({
      id: l.id,
      label: l.label,
      neighbourhood: l.neighbourhood,
      addressIsPublic: l.address_is_public,
      isPrimary: l.is_primary,
      latitude: l.latitude != null ? Number(l.latitude) : null,
      longitude: l.longitude != null ? Number(l.longitude) : null,
      addressLine: l.address_line,
      postalCode: l.postal_code,
    })),
    travel: travel.data
      ? {
          travelEnabled: travel.data.travel_enabled,
          maxTravelKm: Number(travel.data.max_travel_km),
          travelBufferMinutes: travel.data.travel_buffer_minutes,
          serviceAreas: (areas ?? []).map((a: any) => a.area_name),
        }
      : null,
    availability: (availability.data ?? []).map((r: any) => ({
      weekday: r.weekday,
      startMinute: r.start_minute,
      endMinute: r.end_minute,
    })),
    publishBlockers: publishBlockers({
      hasPhoto: !!coach.photo_url,
      hasBio: !!coach.bio,
      serviceCount: activeServices.length,
      skillCount: mySkills.data?.length ?? 0,
      // An empty array is truthy — count it, or a coach with no location
      // clears the publish blocker.
      hasLocation: (locations.data ?? []).length > 0,
      hasAvailability: (availability.data?.length ?? 0) > 0,
      payoutsEnabled: !!coach.stripe_payouts_enabled,
    }),
  };

  return (
    <CoachShell active="settings" coachName={coach.display_name} photoUrl={signedPortrait}>
      <CoachPageHeader title="Your profile" />
      <CoachSettings data={data} />
    </CoachShell>
  );
}
