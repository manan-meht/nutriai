/**
 * Seeds a realistic Singapore marketplace for development.
 *
 * Twelve coaches with real neighbourhoods, SGD pricing, believable services,
 * working hours, travel rules, reviews and progress — no Lorem Ipsum in any
 * core flow (spec). Everything here is fake *people* but real *shapes*: the
 * data is what the discovery, availability and booking code actually has to
 * cope with (coaches who don't travel, coaches with one skill, a brand-new
 * coach with no reviews, an unpublished draft).
 *
 * Requires migration 0056. Idempotent: re-running updates the same rows,
 * keyed on a deterministic seed email per coach, so it's safe to iterate.
 *
 *   npx tsx scripts/seed-tistra-club.ts
 *
 * Coaches are created as real auth users (ADR-001: a coach is an ordinary
 * account), with a fixed dev password so you can log in as any of them.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";

function loadEnv() {
  const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    if (!line.includes("=") || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

const DEV_PASSWORD = "ClubDev!2026";

/** Real Singapore neighbourhood centroids — coordinates are persisted and
 * drive distance/travel maths, so they must be plausible, not placeholders. */
const AREAS: Record<string, { lat: number; lng: number; postal: string }> = {
  "River Valley": { lat: 1.2936, lng: 103.8354, postal: "238351" },
  Orchard: { lat: 1.3048, lng: 103.8318, postal: "238823" },
  "Tiong Bahru": { lat: 1.2859, lng: 103.8267, postal: "168731" },
  Novena: { lat: 1.3203, lng: 103.8438, postal: "307683" },
  "Bukit Timah": { lat: 1.3294, lng: 103.8021, postal: "269707" },
  "Holland Village": { lat: 1.3111, lng: 103.7961, postal: "278115" },
  "East Coast": { lat: 1.3016, lng: 103.9065, postal: "449876" },
  Katong: { lat: 1.3048, lng: 103.9021, postal: "428769" },
  Bishan: { lat: 1.3508, lng: 103.8485, postal: "579827" },
  Serangoon: { lat: 1.3554, lng: 103.8679, postal: "556083" },
  CBD: { lat: 1.2806, lng: 103.8507, postal: "048621" },
};

interface SeedCoach {
  email: string;
  displayName: string;
  headline: string;
  bio: string;
  skills: string[]; // club_skills slugs; first is primary
  area: keyof typeof AREAS;
  languages: string[];
  yearsCoaching: number;
  services: Array<{ name: string; skill: string; minutes: number; priceCents: number; travel?: boolean }>;
  travel?: { maxKm: number; areas: string[] };
  /** Weekday -> [startHour, endHour] in SGT. */
  hours: Record<number, [number, number]>;
  rating?: number;
  reviewCount?: number;
  sessionCount?: number;
  status?: "published" | "draft";
  verified?: boolean;
}

const COACHES: SeedCoach[] = [
  {
    email: "sarah.chen@club-seed.tistra.dev",
    displayName: "Sarah Chen",
    headline: "Handstands & Acrobatics",
    bio: "Former competitive gymnast turned movement coach. I break handstands down into pieces that actually make sense — most of my clients hold their first freestanding handstand within three months. Patient with total beginners, and happy to work outdoors.",
    skills: ["handstands", "acrobatics"],
    area: "River Valley",
    languages: ["English", "Mandarin"],
    yearsCoaching: 8,
    services: [
      { name: "Handstand Foundations", skill: "handstands", minutes: 60, priceCents: 7000, travel: true },
      { name: "Private Acrobatics", skill: "acrobatics", minutes: 60, priceCents: 9000 },
      { name: "Handstand Intensive", skill: "handstands", minutes: 90, priceCents: 10000 },
    ],
    travel: { maxKm: 12, areas: ["River Valley", "Orchard", "Tiong Bahru", "CBD"] },
    hours: { 1: [9, 18], 2: [9, 18], 3: [9, 18], 4: [9, 18], 5: [9, 15], 6: [8, 13] },
    rating: 4.9, reviewCount: 47, sessionCount: 86, verified: true,
  },
  {
    email: "arjun.nair@club-seed.tistra.dev",
    displayName: "Arjun Nair",
    headline: "Strength & Calisthenics",
    bio: "I coach barbell strength and bodyweight skills side by side — squat and deadlift mechanics for people who want to get genuinely strong, plus the pull-up and muscle-up progressions everyone gets stuck on.",
    skills: ["strength-training", "calisthenics"],
    area: "Tiong Bahru",
    languages: ["English", "Tamil", "Hindi"],
    yearsCoaching: 6,
    services: [
      { name: "Strength Fundamentals", skill: "strength-training", minutes: 60, priceCents: 8500 },
      { name: "Calisthenics Skills", skill: "calisthenics", minutes: 60, priceCents: 8000, travel: true },
    ],
    travel: { maxKm: 8, areas: ["Tiong Bahru", "CBD", "River Valley"] },
    hours: { 1: [7, 12], 2: [7, 20], 3: [7, 12], 4: [7, 20], 6: [8, 14] },
    rating: 5.0, reviewCount: 62, sessionCount: 142, verified: true,
  },
  {
    email: "marcus.lim@club-seed.tistra.dev",
    displayName: "Marcus Lim",
    headline: "Muay Thai & Conditioning",
    bio: "Fifteen years in the ring, ten coaching. Technique first — stance, guard, footwork — then pads and conditioning. I work with complete beginners and with fighters preparing for interclub.",
    skills: ["muay-thai", "boxing"],
    area: "Katong",
    languages: ["English", "Mandarin", "Malay"],
    yearsCoaching: 10,
    services: [
      { name: "Muay Thai Private", skill: "muay-thai", minutes: 60, priceCents: 9500 },
      { name: "Boxing Technique", skill: "boxing", minutes: 45, priceCents: 7500 },
    ],
    hours: { 1: [16, 21], 2: [16, 21], 3: [16, 21], 4: [16, 21], 5: [16, 20] },
    rating: 4.8, reviewCount: 38, sessionCount: 210, verified: true,
  },
  {
    email: "nur.aisyah@club-seed.tistra.dev",
    displayName: "Nur Aisyah",
    headline: "Mobility & Yoga",
    bio: "I work with desk-bound bodies. Hips that won't open, shoulders that won't lift, backs that ache by Wednesday. Slow, precise sessions — you'll leave knowing exactly what to practise.",
    skills: ["mobility", "yoga"],
    area: "Novena",
    languages: ["English", "Malay"],
    yearsCoaching: 5,
    services: [
      { name: "Mobility Reset", skill: "mobility", minutes: 60, priceCents: 6500, travel: true },
      { name: "Private Yoga", skill: "yoga", minutes: 75, priceCents: 7500, travel: true },
    ],
    travel: { maxKm: 10, areas: ["Novena", "Bishan", "Orchard", "Serangoon"] },
    hours: { 1: [8, 19], 2: [8, 19], 3: [8, 19], 5: [8, 16] },
    rating: 4.9, reviewCount: 29, sessionCount: 74, verified: true,
  },
  {
    email: "rebecca.tan@club-seed.tistra.dev",
    displayName: "Rebecca Tan",
    headline: "Pole & Aerial Acrobatics",
    bio: "Pole from first spin to advanced combos, plus aerial conditioning. Studio sessions only — I've got the rigging. Strong focus on shoulder health so you can keep training for years.",
    skills: ["pole", "acrobatics"],
    area: "Orchard",
    languages: ["English", "Mandarin"],
    yearsCoaching: 7,
    services: [
      { name: "Pole Fundamentals", skill: "pole", minutes: 60, priceCents: 8000 },
      { name: "Aerial Conditioning", skill: "acrobatics", minutes: 60, priceCents: 8500 },
    ],
    hours: { 2: [10, 21], 3: [10, 21], 4: [10, 21], 6: [9, 15], 0: [9, 15] },
    rating: 4.7, reviewCount: 24, sessionCount: 61, verified: true,
  },
  {
    email: "daniel.wong@club-seed.tistra.dev",
    displayName: "Daniel Wong",
    headline: "Running & Strength",
    bio: "Gait analysis, pacing, and the strength work that keeps runners uninjured. I coach at East Coast Park and Bukit Timah — first session usually starts with watching you run.",
    skills: ["running", "strength-training"],
    area: "East Coast",
    languages: ["English", "Cantonese"],
    yearsCoaching: 9,
    services: [
      { name: "Running Form Session", skill: "running", minutes: 60, priceCents: 7000, travel: true },
      { name: "Runner's Strength", skill: "strength-training", minutes: 45, priceCents: 6500, travel: true },
    ],
    travel: { maxKm: 15, areas: ["East Coast", "Katong", "CBD", "Bishan"] },
    hours: { 1: [6, 11], 3: [6, 11], 5: [6, 11], 6: [6, 12] },
    rating: 4.8, reviewCount: 55, sessionCount: 168, verified: true,
  },
  {
    email: "priya.menon@club-seed.tistra.dev",
    displayName: "Priya Menon",
    headline: "Older Adult Strength",
    bio: "Strength and balance coaching for people over sixty. Everything is scaled, nothing is rushed, and the goal is always the same: stairs, groceries, grandchildren, confidence.",
    skills: ["older-adult-strength", "mobility"],
    area: "Bishan",
    languages: ["English", "Tamil", "Malayalam"],
    yearsCoaching: 12,
    services: [
      { name: "Strong at 60+", skill: "older-adult-strength", minutes: 45, priceCents: 6000, travel: true },
      { name: "Balance & Mobility", skill: "mobility", minutes: 45, priceCents: 6000, travel: true },
    ],
    travel: { maxKm: 12, areas: ["Bishan", "Serangoon", "Novena"] },
    hours: { 1: [9, 16], 2: [9, 16], 3: [9, 16], 4: [9, 16] },
    rating: 5.0, reviewCount: 41, sessionCount: 320, verified: true,
  },
  {
    email: "james.koh@club-seed.tistra.dev",
    displayName: "James Koh",
    headline: "Personal Training",
    bio: "General fitness coaching for people who want a plan and someone to hold them to it. Fat loss, first pull-up, back to training after a long gap — mostly it's about consistency.",
    skills: ["personal-training", "strength-training"],
    area: "CBD",
    languages: ["English", "Mandarin"],
    yearsCoaching: 4,
    services: [
      { name: "Personal Training", skill: "personal-training", minutes: 60, priceCents: 7500, travel: true },
      { name: "Lunchtime Express", skill: "personal-training", minutes: 30, priceCents: 4500, travel: true },
    ],
    travel: { maxKm: 6, areas: ["CBD", "Tiong Bahru", "River Valley"] },
    hours: { 1: [7, 20], 2: [7, 20], 3: [7, 20], 4: [7, 20], 5: [7, 17] },
    rating: 4.6, reviewCount: 18, sessionCount: 52, verified: false,
  },
  {
    email: "chloe.ng@club-seed.tistra.dev",
    displayName: "Chloe Ng",
    headline: "Swimming Technique",
    bio: "Stroke correction for adults — including adults who never properly learned. Freestyle breathing is the thing most people come to me for, and it's usually fixable in a handful of sessions.",
    skills: ["swimming"],
    area: "Holland Village",
    languages: ["English"],
    yearsCoaching: 6,
    services: [{ name: "Stroke Correction", skill: "swimming", minutes: 45, priceCents: 8000 }],
    hours: { 2: [8, 12], 4: [8, 12], 6: [8, 14] },
    rating: 4.9, reviewCount: 22, sessionCount: 96, verified: true,
  },
  {
    email: "ravi.subramaniam@club-seed.tistra.dev",
    displayName: "Ravi Subramaniam",
    headline: "Tennis Coaching",
    bio: "Groundstrokes, serve mechanics and match tactics. I coach on public courts around Bukit Timah and Holland Village. Juniors and adults, beginner through club level.",
    skills: ["tennis"],
    area: "Bukit Timah",
    languages: ["English", "Tamil"],
    yearsCoaching: 15,
    services: [
      { name: "Tennis Private", skill: "tennis", minutes: 60, priceCents: 9000, travel: true },
      { name: "Serve Clinic", skill: "tennis", minutes: 45, priceCents: 7000, travel: true },
    ],
    travel: { maxKm: 10, areas: ["Bukit Timah", "Holland Village", "Novena"] },
    hours: { 1: [7, 11], 2: [7, 11], 4: [7, 11], 6: [7, 13], 0: [7, 13] },
    rating: 4.7, reviewCount: 33, sessionCount: 240, verified: true,
  },
  {
    // Deliberately new: no reviews, low session count. Discovery must still
    // surface newcomers or nobody ever gets a first booking.
    email: "maya.lim@club-seed.tistra.dev",
    displayName: "Maya Lim",
    headline: "Yoga & Inversions",
    bio: "Vinyasa with a focus on getting comfortable upside down. New to coaching here in Singapore after five years teaching in Bali — taking on a small first group of clients.",
    skills: ["yoga", "handstands"],
    area: "Katong",
    languages: ["English", "Indonesian"],
    yearsCoaching: 5,
    services: [{ name: "Yoga & Inversions", skill: "yoga", minutes: 60, priceCents: 6500, travel: true }],
    travel: { maxKm: 8, areas: ["Katong", "East Coast"] },
    hours: { 1: [9, 19], 3: [9, 19], 5: [9, 19], 6: [9, 13] },
    rating: undefined, reviewCount: 0, sessionCount: 3, verified: false,
  },
  {
    // Deliberately unpublished: exercises the draft/publish gate. Must never
    // appear in discovery.
    email: "wei.zhang@club-seed.tistra.dev",
    displayName: "Wei Zhang",
    headline: "Calisthenics",
    bio: "Still setting up my profile.",
    skills: ["calisthenics"],
    area: "Serangoon",
    languages: ["English", "Mandarin"],
    yearsCoaching: 3,
    services: [],
    hours: { 2: [18, 21] },
    status: "draft", verified: false,
  },
];

const REVIEW_SNIPPETS = [
  { rating: 5, body: "Explained the shoulder position in a way that finally clicked. Held my first freestanding handstand today.", tags: ["Clear explanations", "Great for beginners"] },
  { rating: 5, body: "Really patient and adjusts to how you're feeling that day. Never felt out of my depth.", tags: ["Very encouraging"] },
  { rating: 4, body: "Solid technical coaching. Would have liked a bit more homework between sessions.", tags: ["Technical expert"] },
  { rating: 5, body: "Turned up early, session started on time, and I left with three specific things to practise.", tags: ["Punctual", "Clear explanations"] },
  { rating: 5, body: "Six weeks in and my back pain is basically gone. Worth every dollar.", tags: ["Technical expert", "Very encouraging"] },
];

async function upsertCoachUser(admin: SupabaseClient, coach: SeedCoach): Promise<string> {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users?.find((u) => u.email === coach.email);
  if (existing) return existing.id;

  const { data, error } = await admin.auth.admin.createUser({
    email: coach.email,
    password: DEV_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: coach.displayName, seeded: "tistra-club" },
  });
  if (error || !data.user) throw new Error(`createUser ${coach.email}: ${error?.message}`);
  return data.user.id;
}

async function main() {
  loadEnv();
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: skillRows, error: skillError } = await admin.from("club_skills").select("id, slug");
  if (skillError) throw new Error(`club_skills unreadable — is migration 0056 applied? (${skillError.message})`);
  const skillId = Object.fromEntries((skillRows ?? []).map((s: any) => [s.slug, s.id]));

  console.log(`Seeding ${COACHES.length} coaches...\n`);

  for (const coach of COACHES) {
    const profileId = await upsertCoachUser(admin, coach);
    // profiles is populated by an auth trigger; make sure the display name is set.
    await admin.from("profiles").update({ full_name: coach.displayName }).eq("id", profileId);

    const area = AREAS[coach.area];
    const published = coach.status !== "draft";

    const { data: cp, error: cpError } = await admin
      .from("coach_profiles")
      .upsert(
        {
          profile_id: profileId,
          display_name: coach.displayName,
          headline: coach.headline,
          bio: coach.bio,
          languages: coach.languages,
          years_coaching: coach.yearsCoaching,
          status: published ? "published" : "draft",
          published_at: published ? new Date().toISOString() : null,
          identity_verification_status: coach.verified ? "verified" : "unsubmitted",
          credential_verification_status: coach.verified ? "verified" : "unsubmitted",
          stripe_onboarding_status: published ? "enabled" : "not_started",
          stripe_payouts_enabled: published,
          rating_average: coach.rating ?? null,
          review_count: coach.reviewCount ?? 0,
          session_count: coach.sessionCount ?? 0,
        },
        { onConflict: "profile_id" }
      )
      .select("id")
      .single();
    if (cpError || !cp) throw new Error(`coach_profiles ${coach.displayName}: ${cpError?.message}`);
    const coachProfileId = cp.id;

    // Replace child rows wholesale so re-runs converge rather than duplicate.
    for (const table of ["coach_skills", "coach_services", "coach_locations", "coach_availability_rules", "coach_service_areas"]) {
      await admin.from(table).delete().eq("coach_profile_id", coachProfileId);
    }

    await admin.from("coach_skills").insert(
      coach.skills.map((slug, i) => ({
        coach_profile_id: coachProfileId,
        skill_id: skillId[slug],
        is_primary: i === 0,
        experience_levels: ["beginner", "intermediate", "advanced"],
      }))
    );

    const { data: location } = await admin
      .from("coach_locations")
      .insert({
        coach_profile_id: coachProfileId,
        label: `${coach.area} studio`,
        location_type: "COACH_LOCATION",
        neighbourhood: coach.area,
        postal_code: area.postal,
        latitude: area.lat,
        longitude: area.lng,
        country_code: "SG",
        // Seeded coaches keep their exact address private, which is the
        // default and the case the UI most needs to handle.
        address_is_public: false,
        is_primary: true,
      })
      .select("id")
      .single();

    if (coach.services.length > 0) {
      await admin.from("coach_services").insert(
        coach.services.map((s) => ({
          coach_profile_id: coachProfileId,
          skill_id: skillId[s.skill],
          name: s.name,
          duration_minutes: s.minutes,
          price_cents: s.priceCents,
          currency: "SGD",
          allowed_location_types: s.travel ? ["COACH_LOCATION", "CLIENT_LOCATION", "OUTDOOR"] : ["COACH_LOCATION"],
          travel_enabled: !!s.travel,
        }))
      );
    }

    await admin.from("coach_availability_rules").insert(
      Object.entries(coach.hours).map(([weekday, [from, to]]) => ({
        coach_profile_id: coachProfileId,
        weekday: Number(weekday),
        start_minute: from * 60,
        end_minute: to * 60,
        location_id: location?.id ?? null,
      }))
    );

    if (coach.travel) {
      await admin.from("coach_travel_rules").upsert(
        {
          coach_profile_id: coachProfileId,
          travel_enabled: true,
          origin_location_id: location?.id ?? null,
          max_travel_km: coach.travel.maxKm,
          travel_buffer_minutes: 15,
        },
        { onConflict: "coach_profile_id" }
      );
      await admin.from("coach_service_areas").insert(
        coach.travel.areas.map((a) => ({ coach_profile_id: coachProfileId, area_name: a }))
      );
    }

    console.log(
      `  ${published ? "✓" : "·"} ${coach.displayName.padEnd(20)} ${coach.area.padEnd(16)} ` +
        `${coach.services.length} service(s)  ${coach.reviewCount ?? 0} reviews${published ? "" : "  [draft]"}`
    );
  }

  console.log(`\nDone. Coaches sign in with any seed email + "${DEV_PASSWORD}".`);
  console.log("Note: reviews/bookings are NOT seeded — they need real bookings to attach to,");
  console.log("which the booking flow creates. Rating/review counts above are display rollups.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
