import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { percentChange } from "@/lib/admin/metrics-math";

// Internal metrics feed for the tistra-corp admin dashboard (tistra.sg/admin).
// Not user-facing — bearer-token auth only, same pattern as the cron route
// (src/app/api/cron/send-meal-reminders/route.ts). tistra-corp holds the
// matching secret in a Pages Function and never exposes it to the browser.
//
// Two rules, both learned from this endpoint reporting confident nonsense:
//
//  1. Read the tables the app actually writes. It previously counted
//     meal_images, meals and workspace_members — all of which exist but
//     have never held a row. An empty table is not a query error, so every
//     Health figure read 0 and nothing failed. Meals and their photos live
//     in meal_logs.
//
//  2. Never count demo or test data. Seeded coaches and the test coach
//     account are marked is_demo, and the only payments in the system were
//     Stripe test-mode ones taken through that account — so the dashboard
//     was reporting S$140 of play money as revenue. Everything club-side is
//     scoped to real coaches, which excludes both.

export const dynamic = "force-dynamic";

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** A half-open time window: `since` inclusive, `until` exclusive. The
 * exclusive end is what lets the current and preceding windows abut without
 * double-counting a row that lands exactly on the boundary. */
interface Window {
  since?: string;
  until?: string;
}

/** Workspace ids belonging to the team's own accounts.
 *
 * Every Tistra Health figure is filtered against these, the same way every
 * club figure is scoped to non-demo coaches. Returned as a list rather than
 * applied as a join because PostgREST cannot express one, and the flagged
 * set is small and stays small — so excluding it is cheaper than restricting
 * to the (ever-growing) set of real ones. */
async function testWorkspaceIds(
  db: ReturnType<typeof createServiceClient>
): Promise<string[]> {
  const { data, error } = await db.from("workspaces").select("id").eq("is_test", true);
  if (error) throw new Error(`workspaces: ${error.message}`);
  return (data ?? []).map((row) => (row as { id: string }).id);
}

/** PostgREST's exclusion list for the test workspaces.
 *
 * Callers must skip the filter entirely when there is nothing to exclude:
 * an empty list renders as `in.()`, which PostgREST rejects as a syntax
 * error rather than reading as "exclude nothing" — the same trap the club
 * metrics hit with an empty coach list. */
function testIdList(ids: string[]): string {
  return `(${ids.join(",")})`;
}


/** Meals that arrived with a photo. `created_at` is when we received it;
 * `logged_at` is when the person says they ate, which is not the same
 * question and drifts when someone back-dates a meal. */
async function photoCount(
  db: ReturnType<typeof createServiceClient>,
  testIds: string[],
  window: Window = {}
): Promise<number> {
  const base = db
    .from("meal_logs")
    .select("id", { count: "exact", head: true })
    .not("image_url", "is", null);
  let query =
    testIds.length > 0 ? base.not("workspace_id", "in", testIdList(testIds)) : base;
  if (window.since) query = query.gte("created_at", window.since);
  if (window.until) query = query.lt("created_at", window.until);
  const { count, error } = await query;
  if (error) throw new Error(`meal_logs: ${error.message}`);
  return count ?? 0;
}

/** People who logged at least one meal in the window. A meal_log belongs to
 * either an adults contact or a gym client, so both key off the row rather
 * than assuming one product. */
async function activeUsers(
  db: ReturnType<typeof createServiceClient>,
  testIds: string[],
  window: Window = {}
): Promise<number> {
  const base = db.from("meal_logs").select("adults_contact_id, client_id");
  let query =
    testIds.length > 0 ? base.not("workspace_id", "in", testIdList(testIds)) : base;
  if (window.since) query = query.gte("created_at", window.since);
  if (window.until) query = query.lt("created_at", window.until);
  const { data, error } = await query;
  if (error) throw new Error(`meal_logs: ${error.message}`);
  const people = new Set<string>();
  for (const row of (data ?? []) as Array<{ adults_contact_id: string | null; client_id: string | null }>) {
    const id = row.adults_contact_id ?? row.client_id;
    if (id) people.add(id);
  }
  return people.size;
}

/** People being tracked. One account commonly adds several — a parent
 * tracking two children is one user and three contacts — so this answers a
 * different question from the user count and the dashboard shows both.
 *
 * Soft-deleted rows are excluded: a removed contact is not someone Tistra is
 * tracking, and counting them would make the total drift upward forever. */
async function contactCount(
  db: ReturnType<typeof createServiceClient>,
  testIds: string[],
  window: Window = {}
): Promise<number> {
  const base = db
    .from("adults_contacts")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);
  let query =
    testIds.length > 0 ? base.not("workspace_id", "in", testIdList(testIds)) : base;
  if (window.since) query = query.gte("created_at", window.since);
  if (window.until) query = query.lt("created_at", window.until);
  const { count, error } = await query;
  if (error) throw new Error(`adults_contacts: ${error.message}`);
  return count ?? 0;
}

/** Account holders on Tistra Health — the people who signed up, as opposed
 * to the contacts they added.
 *
 * Counts distinct workspace OWNERS rather than workspaces, because one
 * person can hold more than one (a self workspace and a family workspace),
 * and counting rows would report them twice. Scoped to type "adults": the
 * gym workspace is Tistra Coach and does not belong in a Health figure. */
async function healthUserCount(db: ReturnType<typeof createServiceClient>): Promise<number> {
  const { data, error } = await db
    .from("workspaces")
    .select("owner_id")
    .eq("type", "adults")
    .eq("is_test", false);
  if (error) throw new Error(`workspaces: ${error.message}`);
  const owners = new Set<string>();
  for (const row of (data ?? []) as Array<{ owner_id: string | null }>) {
    if (row.owner_id) owners.add(row.owner_id);
  }
  return owners.size;
}

/** Who sent the most meal photos in the window, by count.
 *
 * Counts only, never the images: this dashboard is a metrics view, and real
 * people's meal photos have no business being rendered on it.
 *
 * Grouped in memory rather than SQL because PostgREST has no GROUP BY — the
 * row set here is one id per photo over a week, which is small enough that
 * the round trip costs less than a database function would to maintain. */
interface TopSubmitter {
  name: string;
  photos: number;
}

async function topPhotoSubmitters(
  db: ReturnType<typeof createServiceClient>,
  testIds: string[],
  since: string,
  limit = 10
): Promise<TopSubmitter[]> {
  const unfiltered = db
    .from("meal_logs")
    .select("adults_contact_id")
    .not("image_url", "is", null)
    .not("adults_contact_id", "is", null)
    .gte("created_at", since);
  const { data, error } = await (testIds.length > 0
    ? unfiltered.not("workspace_id", "in", testIdList(testIds))
    : unfiltered);
  if (error) throw new Error(`meal_logs: ${error.message}`);

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ adults_contact_id: string }>) {
    counts.set(row.adults_contact_id, (counts.get(row.adults_contact_id) ?? 0) + 1);
  }

  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  if (top.length === 0) return [];

  const { data: people, error: nameError } = await db
    .from("adults_contacts")
    .select("id, full_name")
    .in("id", top.map(([id]) => id));
  if (nameError) throw new Error(`adults_contacts: ${nameError.message}`);

  const nameById = new Map(
    ((people ?? []) as Array<{ id: string; full_name: string | null }>).map((r) => [
      r.id,
      (r.full_name ?? "").trim(),
    ])
  );

  // A soft-deleted contact keeps its meal_logs, so a name can be missing
  // here even though the photos are real. Showing the count against a
  // placeholder beats dropping rows and having the table not add up.
  return top.map(([id, photos]) => ({ name: nameById.get(id) || "Unknown", photos }));
}

async function getHealthMetrics(db: ReturnType<typeof createServiceClient>) {
  // Fetched once and threaded through every query below. The team's own
  // accounts are excluded from ALL Health figures, matching how the club
  // side excludes demo coaches — without it the owner's throwaway signups
  // are counted as customers.
  const testIds = await testWorkspaceIds(db);

  const since7d = daysAgoIso(7);
  const since30d = daysAgoIso(30);
  // The equal-length window immediately before each current one, so a
  // percentage compares like with like: days 8-14 against days 1-7.
  const since14d = daysAgoIso(14);
  const since60d = daysAgoIso(60);
  const prev7d: Window = { since: since14d, until: since7d };
  const prev30d: Window = { since: since60d, until: since30d };

  const [
    photos7d, photos30d, photosTotal, photosPrev7d, photosPrev30d,
    active7d, active30d, activeEver, activePrev7d, activePrev30d,
    contacts7d, contacts30d, contactsTotal, contactsPrev7d, contactsPrev30d,
    totalUsers, topSubmitters7d,
  ] = await Promise.all([
    photoCount(db, testIds, { since: since7d }),
    photoCount(db, testIds, { since: since30d }),
    photoCount(db, testIds),
    photoCount(db, testIds, prev7d),
    photoCount(db, testIds, prev30d),
    activeUsers(db, testIds, { since: since7d }),
    activeUsers(db, testIds, { since: since30d }),
    activeUsers(db, testIds),
    activeUsers(db, testIds, prev7d),
    activeUsers(db, testIds, prev30d),
    contactCount(db, testIds, { since: since7d }),
    contactCount(db, testIds, { since: since30d }),
    contactCount(db, testIds),
    contactCount(db, testIds, prev7d),
    contactCount(db, testIds, prev30d),
    healthUserCount(db),
    topPhotoSubmitters(db, testIds, since7d),
  ]);

  return {
    photosPosted7d: photos7d,
    photosPosted30d: photos30d,
    photosPostedTotal: photosTotal,
    photosPosted7dChangePct: percentChange(photos7d, photosPrev7d),
    photosPosted30dChangePct: percentChange(photos30d, photosPrev30d),

    activeUsers7d: active7d,
    activeUsers30d: active30d,
    activeUsersTotal: activeEver,
    activeUsers7dChangePct: percentChange(active7d, activePrev7d),
    activeUsers30dChangePct: percentChange(active30d, activePrev30d),

    // Accounts, not people tracked. This previously counted adults_contacts,
    // which made "total users" and the contact total the same number under
    // two different labels.
    totalUsers,

    contacts7d,
    contacts30d,
    contactsTotal,
    contacts7dChangePct: percentChange(contacts7d, contactsPrev7d),
    contacts30dChangePct: percentChange(contacts30d, contactsPrev30d),

    topSubmitters7d,
  };
}

/** Coach profile ids that are neither seeded examples nor test accounts.
 * Every club figure is scoped to these — the demo coaches outnumber the
 * real ones, so counting them made the marketplace look 6x its size. */
async function realCoachIds(db: ReturnType<typeof createServiceClient>): Promise<string[]> {
  const { data, error } = await db.from("coach_profiles").select("id").eq("is_demo", false);
  if (error) throw new Error(`coach_profiles: ${error.message}`);
  return (data ?? []).map((row) => (row as { id: string }).id);
}

async function getClubMetrics(db: ReturnType<typeof createServiceClient>) {
  const coachIds = await realCoachIds(db);

  // No real coaches yet: every downstream count is zero by definition, and
  // an .in() on an empty list is a query error rather than an empty result.
  if (coachIds.length === 0) {
    return { coachesOnboarded: 0, classesBooked: 0, revenueCents: 0, commissionCents: 0 };
  }

  const [onboarded, booked, payments] = await Promise.all([
    db
      .from("coach_profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_demo", false)
      .neq("status", "draft"),
    db
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .in("coach_profile_id", coachIds)
      .neq("status", "PAYMENT_PENDING"),
    db
      .from("club_payments")
      .select("gross_amount_cents, platform_fee_cents")
      .in("coach_profile_id", coachIds)
      .eq("status", "succeeded"),
  ]);

  if (onboarded.error) throw new Error(`coach_profiles: ${onboarded.error.message}`);
  if (booked.error) throw new Error(`bookings: ${booked.error.message}`);
  if (payments.error) throw new Error(`club_payments: ${payments.error.message}`);

  const rows = (payments.data ?? []) as Array<{ gross_amount_cents: number; platform_fee_cents: number }>;

  return {
    coachesOnboarded: onboarded.count ?? 0,
    classesBooked: booked.count ?? 0,
    revenueCents: rows.reduce((sum, row) => sum + row.gross_amount_cents, 0),
    commissionCents: rows.reduce((sum, row) => sum + row.platform_fee_cents, 0),
  };
}

export async function GET(request: NextRequest) {
  const secret = process.env.ADMIN_METRICS_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const db = createServiceClient();

  try {
    const [health, club] = await Promise.all([getHealthMetrics(db), getClubMetrics(db)]);
    return NextResponse.json({ health, club, generatedAt: new Date().toISOString() });
  } catch (error) {
    // Loud on purpose. A dashboard that shows a wrong number is worse than
    // one that shows an error, which is exactly how the empty-table bug
    // survived.
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
