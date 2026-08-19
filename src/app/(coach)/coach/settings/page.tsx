import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { CoachShell } from "@/components/coach/CoachShell";
import { CoachPageHeader } from "@/components/coach/CoachShell";
import { CoachSettings, type SettingsData } from "@/components/coach/CoachSettings";
import { publishBlockers } from "@/lib/club/ranking";
import { resolveSignedCoachPhotoUrl, resolveSignedCoachPhotoUrls } from "@/lib/club/media";

// Coach profile / onboarding. This route is also the landing place for a
// brand-new coach: /coach/dashboard redirects here when no coach_profiles
// row exists yet, so it must work for someone who has nothing set up.
export default async function CoachSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/gym/login");

  const admin = createServiceClient();

  // Create the draft profile on first visit rather than making the coach
  // click "become a coach" before they can enter anything.
  let { data: coach } = await admin
    .from("coach_profiles")
    .select("id, display_name, headline, bio, years_coaching, status, photo_url, stripe_payouts_enabled")
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
      .select("id, display_name, headline, bio, years_coaching, status, photo_url, stripe_payouts_enabled")
      .single();
    coach = created;
  }
  if (!coach) redirect("/dashboard");

  const [allSkills, mySkills, services, locations, travel, availability] = await Promise.all([
    admin.from("club_skills").select("id, name, slug").eq("is_active", true).order("sort_order"),
    admin.from("coach_skills").select("skill_id").eq("coach_profile_id", coach.id),
    admin.from("coach_services").select("id, name, duration_minutes, price_cents, is_active, travel_enabled, skill_id").eq("coach_profile_id", coach.id).order("created_at"),
    admin.from("coach_locations").select("id, label, neighbourhood, address_is_public, latitude, longitude, address_line, postal_code").eq("coach_profile_id", coach.id).eq("is_primary", true).maybeSingle(),
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
      status: coach.status,
      photoUrl: signedPortrait ?? null,
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
    location: locations.data
      ? {
          id: locations.data.id,
          label: locations.data.label,
          neighbourhood: locations.data.neighbourhood,
          addressIsPublic: locations.data.address_is_public,
          latitude: locations.data.latitude != null ? Number(locations.data.latitude) : null,
          longitude: locations.data.longitude != null ? Number(locations.data.longitude) : null,
          addressLine: locations.data.address_line,
          postalCode: locations.data.postal_code,
        }
      : null,
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
      hasLocation: !!locations.data,
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
