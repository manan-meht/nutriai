import { createServiceClient } from "@/lib/supabase/server";
import { resolveSignedCoachPhotoUrl } from "@/lib/club/media";

/** Coach roster for the admin console.
 *
 * Reads coach_profiles directly rather than going through discoverCoaches,
 * because the whole point of this view is the coaches discovery will NOT
 * show: drafts, paused profiles, and anyone stuck partway through setup.
 *
 * Nothing here is cached. It is a handful of rows behind an admin gate, and
 * a stale answer to "did anyone sign up today" is worse than a slow one.
 */

export interface CoachBlockers {
  photo: boolean;
  bio: boolean;
  skills: number;
  services: number;
  locations: number;
  availability: number;
  payouts: boolean;
}

export interface AdminCoachRow {
  id: string;
  displayName: string;
  email: string | null;
  status: string;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  lastSignInAt: string | null;
  headline: string | null;
  bio: string | null;
  yearsCoaching: number | null;
  languages: string[];
  /** A short-lived signed URL, not the storage path: coach portraits live in
   * a private bucket and would render as a broken image otherwise. */
  photoUrl: string | null;
  /** Asked for help building their profile at signup — see AuthForm's
   * onboardingHelp. Read from auth user metadata, which is where the
   * preference is captured; there is no coach_profiles column for it. */
  needsOnboardingHelp: boolean;
  foundingFreeBookings: number;
  foundingFreeUsed: number;
  stripeAccountId: string | null;
  stripeOnboardingStatus: string | null;
  stripePayoutsEnabled: boolean;
  identityStatus: string | null;
  blockers: CoachBlockers;
  skills: { name: string; isPrimary: boolean }[];
  services: { name: string; priceCents: number; durationMinutes: number; isActive: boolean }[];
  locations: { label: string | null; neighbourhood: string | null; postalCode: string | null; isActive: boolean; isPrimary: boolean }[];
  availability: { weekday: number; startMinute: number; endMinute: number; isActive: boolean }[];
}

/** True when nothing stands between this coach and a published profile. */
export function isReadyToPublish(b: CoachBlockers): boolean {
  return b.photo && b.bio && b.skills > 0 && b.services > 0 && b.locations > 0 && b.availability > 0 && b.payouts;
}

/** The steps still outstanding, in the order the coach meets them. */
export function outstanding(b: CoachBlockers): string[] {
  const out: string[] = [];
  if (!b.photo) out.push("photo");
  if (!b.bio) out.push("bio");
  if (b.skills === 0) out.push("skills");
  if (b.services === 0) out.push("services");
  if (b.locations === 0) out.push("location");
  if (b.availability === 0) out.push("availability");
  if (!b.payouts) out.push("payouts");
  return out;
}

export async function listCoaches(): Promise<AdminCoachRow[]> {
  const admin = createServiceClient();

  const { data: profiles } = await admin
    .from("coach_profiles")
    .select("*")
    .order("created_at", { ascending: false });
  const rows = (profiles ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id as string);
  const profileIds = rows.map((r) => r.profile_id as string);

  const [skills, services, locations, rules, clubSkills, payments, authUsers] = await Promise.all([
    admin.from("coach_skills").select("coach_profile_id, skill_id, is_primary").in("coach_profile_id", ids),
    admin.from("coach_services").select("coach_profile_id, name, price_cents, duration_minutes, is_active").in("coach_profile_id", ids),
    admin.from("coach_locations").select("coach_profile_id, label, neighbourhood, postal_code, is_active, is_primary").in("coach_profile_id", ids),
    admin.from("coach_availability_rules").select("coach_profile_id, weekday, start_minute, end_minute, is_active").in("coach_profile_id", ids),
    admin.from("club_skills").select("id, name"),
    admin.from("club_payments").select("coach_profile_id").eq("founding_free", true).eq("status", "succeeded").in("coach_profile_id", ids),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  const by = <T extends { coach_profile_id: string }>(list: T[] | null) => {
    const m = new Map<string, T[]>();
    for (const r of list ?? []) {
      const arr = m.get(r.coach_profile_id) ?? [];
      arr.push(r);
      m.set(r.coach_profile_id, arr);
    }
    return m;
  };
  const skillBy = by(skills.data as { coach_profile_id: string; skill_id: string; is_primary: boolean }[] | null);
  const svcBy = by(services.data as { coach_profile_id: string; name: string; price_cents: number; duration_minutes: number; is_active: boolean }[] | null);
  const locBy = by(locations.data as { coach_profile_id: string; label: string | null; neighbourhood: string | null; postal_code: string | null; is_active: boolean; is_primary: boolean }[] | null);
  const ruleBy = by(rules.data as { coach_profile_id: string; weekday: number; start_minute: number; end_minute: number; is_active: boolean }[] | null);
  const freeBy = by(payments.data as { coach_profile_id: string }[] | null);

  // Signed in one pass rather than per card. A failure signs as null and the
  // card falls back to initials — one unreadable portrait must not blank the
  // roster.
  const signedPhoto = new Map<string, string | null>();
  await Promise.all(
    rows.map(async (r) => {
      signedPhoto.set(
        r.id as string,
        (await resolveSignedCoachPhotoUrl(admin, (r.photo_url as string) ?? null)) ?? null
      );
    })
  );

  const skillName = new Map(((clubSkills.data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
  const userById = new Map(
    (authUsers.data?.users ?? []).map((u) => [
      u.id,
      {
        email: u.email ?? null,
        lastSignInAt: u.last_sign_in_at ?? null,
        needsOnboardingHelp: (u.user_metadata as Record<string, unknown> | null)?.needs_onboarding_help === true,
      },
    ])
  );
  void profileIds;

  return rows.map((r) => {
    const id = r.id as string;
    const activeSvcs = (svcBy.get(id) ?? []).filter((s) => s.is_active);
    const activeLocs = (locBy.get(id) ?? []).filter((l) => l.is_active);
    const activeRules = (ruleBy.get(id) ?? []).filter((a) => a.is_active);
    const user = userById.get(r.profile_id as string);

    const blockers: CoachBlockers = {
      // The raw column, not the signed URL: a signing failure is our problem,
      // not a missing photo on the coach's part.
      photo: !!r.photo_url,
      bio: !!r.bio,
      skills: (skillBy.get(id) ?? []).length,
      services: activeSvcs.length,
      locations: activeLocs.length,
      availability: activeRules.length,
      payouts: !!r.stripe_payouts_enabled,
    };

    return {
      id,
      displayName: (r.display_name as string) ?? "(unnamed)",
      email: user?.email ?? null,
      status: (r.status as string) ?? "unknown",
      isDemo: !!r.is_demo,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
      publishedAt: (r.published_at as string) ?? null,
      lastSignInAt: user?.lastSignInAt ?? null,
      headline: (r.headline as string) ?? null,
      bio: (r.bio as string) ?? null,
      yearsCoaching: (r.years_coaching as number) ?? null,
      languages: (r.languages as string[]) ?? [],
      photoUrl: signedPhoto.get(id) ?? null,
      needsOnboardingHelp: user?.needsOnboardingHelp ?? false,
      foundingFreeBookings: Number(r.founding_free_bookings ?? 0),
      foundingFreeUsed: (freeBy.get(id) ?? []).length,
      stripeAccountId: (r.stripe_account_id as string) ?? null,
      stripeOnboardingStatus: (r.stripe_onboarding_status as string) ?? null,
      stripePayoutsEnabled: !!r.stripe_payouts_enabled,
      identityStatus: (r.identity_verification_status as string) ?? null,
      blockers,
      skills: (skillBy.get(id) ?? []).map((s) => ({
        name: skillName.get(s.skill_id) ?? s.skill_id,
        isPrimary: !!s.is_primary,
      })),
      services: (svcBy.get(id) ?? []).map((s) => ({
        name: s.name,
        priceCents: s.price_cents,
        durationMinutes: s.duration_minutes,
        isActive: s.is_active,
      })),
      locations: (locBy.get(id) ?? []).map((l) => ({
        label: l.label,
        neighbourhood: l.neighbourhood,
        postalCode: l.postal_code,
        isActive: l.is_active,
        isPrimary: l.is_primary,
      })),
      availability: (ruleBy.get(id) ?? []).map((a) => ({
        weekday: a.weekday,
        startMinute: a.start_minute,
        endMinute: a.end_minute,
        isActive: a.is_active,
      })),
    };
  });
}
