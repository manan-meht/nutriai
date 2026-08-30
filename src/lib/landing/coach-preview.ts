import { createServiceClient } from "@/lib/supabase/server";
import { resolveSignedCoachPhotoUrl } from "@/lib/club/media";
import { CLUB_MARKET } from "@/lib/club/config";

/** The handful of fields the coach landing page's marketplace preview shows.
 *
 * Deliberately NOT CoachCard, and deliberately not fetched with
 * discoverCoaches, even though that would guarantee the preview matches the
 * marketplace exactly.
 *
 * discoverCoaches is built for a client filtering a search: seven queries, a
 * signed URL per gallery image, availability computed per coach, and a Google
 * Calendar round-trip for every coach with a connected calendar. That measured
 * about a second locally and 3-4 SECONDS from Cloudflare's edge — paid on
 * every Google Ads click, to render three cards. Mobile ad traffic abandons
 * long before that.
 *
 * So this reads only what the cards display, in four queries with no external
 * calls. The casualty is the "next available" chip, which was the sole reason
 * the calendar fetch existed; showing a next slot computed WITHOUT external
 * busy times would have been worse than showing none, because it would
 * advertise slots the coach is unavailable for.
 */
export interface CoachPreview {
  id: string;
  displayName: string;
  photoUrl: string | null;
  skills: string[];
  neighbourhood: string | null;
  startingPriceCents: number | null;
  currency: string;
}

/** Five minutes, in-isolate.
 *
 * Worth keeping even though Cloudflare runs many isolates and most ad clicks
 * hit a cold one: it costs nothing, and it removes the query entirely for
 * bursts of traffic that land on the same isolate. The real fix was making
 * the cold path cheap, which is what this module is. */
const TTL_MS = 5 * 60 * 1000;
let cache: { at: number; coaches: CoachPreview[] } | null = null;

export async function coachPreview(limit: number): Promise<CoachPreview[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.coaches.slice(0, limit);

  try {
    const admin = createServiceClient();

    const { data: profiles, error } = await admin
      .from("coach_profiles")
      .select("id, display_name, photo_url")
      .eq("status", "published")
      .eq("is_demo", false)
      .order("published_at", { ascending: false })
      .limit(12);
    if (error) throw new Error(error.message);

    const rows = profiles ?? [];
    if (rows.length === 0) {
      cache = { at: Date.now(), coaches: [] };
      return [];
    }
    const ids = rows.map((r) => (r as { id: string }).id);

    const [skills, services, locations] = await Promise.all([
      admin.from("coach_skills").select("coach_profile_id, club_skills(name)").in("coach_profile_id", ids),
      admin
        .from("coach_services")
        .select("coach_profile_id, price_cents, currency")
        .in("coach_profile_id", ids)
        .eq("is_active", true),
      admin
        .from("coach_locations")
        .select("coach_profile_id, neighbourhood, is_primary")
        .in("coach_profile_id", ids)
        .eq("is_active", true),
    ]);

    const group = <T extends { coach_profile_id: string }>(list: T[] | null) => {
      const m = new Map<string, T[]>();
      for (const r of list ?? []) {
        const arr = m.get(r.coach_profile_id) ?? [];
        arr.push(r);
        m.set(r.coach_profile_id, arr);
      }
      return m;
    };
    const skillBy = group(skills.data as { coach_profile_id: string; club_skills: { name: string } | null }[] | null);
    const svcBy = group(services.data as { coach_profile_id: string; price_cents: number; currency: string }[] | null);
    const locBy = group(locations.data as { coach_profile_id: string; neighbourhood: string | null; is_primary: boolean }[] | null);

    const signed = new Map<string, string | null>();
    await Promise.all(
      rows.map(async (r) => {
        const row = r as { id: string; photo_url: string | null };
        signed.set(row.id, (await resolveSignedCoachPhotoUrl(admin, row.photo_url)) ?? null);
      })
    );

    const coaches: CoachPreview[] = [];
    for (const r of rows) {
      const row = r as { id: string; display_name: string };
      const svcs = svcBy.get(row.id) ?? [];
      // Unbookable coaches are never shown in the marketplace, so they must
      // not appear in a section claiming to be the marketplace either.
      if (svcs.length === 0) continue;

      const loc = (locBy.get(row.id) ?? []).find((l) => l.is_primary) ?? (locBy.get(row.id) ?? [])[0];
      coaches.push({
        id: row.id,
        displayName: row.display_name,
        photoUrl: signed.get(row.id) ?? null,
        skills: (skillBy.get(row.id) ?? []).map((s) => s.club_skills?.name).filter((n): n is string => !!n),
        // Neighbourhood only — never the street address (privacy rule).
        neighbourhood: loc?.neighbourhood ?? null,
        startingPriceCents: Math.min(...svcs.map((s) => s.price_cents)),
        currency: svcs[0].currency ?? CLUB_MARKET.currency,
      });
    }

    cache = { at: Date.now(), coaches };
    return coaches.slice(0, limit);
  } catch {
    // Serve a stale list rather than dropping the section. This is the
    // destination for paid traffic: a database hiccup must cost one section,
    // not the click that paid for it.
    return cache?.coaches.slice(0, limit) ?? [];
  }
}

/** The coach whose profile is shown in "See what your clients see".
 *
 * Pinned rather than "whichever published most recently", so the section
 * is stable: it is a product screenshot, and a screenshot that changes
 * identity whenever someone new publishes is one nobody can review, brief
 * a photographer against, or get permission for.
 *
 * By id rather than by name — a coach can rename their profile.
 */
export const SHOWCASE_COACH_ID = "a9b347bd-5bd3-4c56-99fc-c5ce6629063b";

/** Resolves the pinned coach, falling back to the most recently published
 * one if that profile is ever unpublished or paused.
 *
 * Reads the same cached list coachPreview builds, so pinning costs no
 * extra query. Returns null only when there are no published coaches at
 * all, in which case the section renders nothing rather than a placeholder
 * pretending to be a real storefront.
 */
export async function showcaseCoach(): Promise<CoachPreview | null> {
  const coaches = await coachPreview(12);
  return coaches.find((c) => c.id === SHOWCASE_COACH_ID) ?? coaches[0] ?? null;
}
