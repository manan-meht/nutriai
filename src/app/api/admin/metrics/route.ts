import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

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

/** Meals that arrived with a photo. `created_at` is when we received it;
 * `logged_at` is when the person says they ate, which is not the same
 * question and drifts when someone back-dates a meal. */
async function photoCount(
  db: ReturnType<typeof createServiceClient>,
  since?: string
): Promise<number> {
  let query = db
    .from("meal_logs")
    .select("id", { count: "exact", head: true })
    .not("image_url", "is", null);
  if (since) query = query.gte("created_at", since);
  const { count, error } = await query;
  if (error) throw new Error(`meal_logs: ${error.message}`);
  return count ?? 0;
}

/** People who logged at least one meal in the window. A meal_log belongs to
 * either an adults contact or a gym client, so both key off the row rather
 * than assuming one product. */
async function activeUsers(
  db: ReturnType<typeof createServiceClient>,
  since?: string
): Promise<number> {
  let query = db.from("meal_logs").select("adults_contact_id, client_id");
  if (since) query = query.gte("created_at", since);
  const { data, error } = await query;
  if (error) throw new Error(`meal_logs: ${error.message}`);
  const people = new Set<string>();
  for (const row of (data ?? []) as Array<{ adults_contact_id: string | null; client_id: string | null }>) {
    const id = row.adults_contact_id ?? row.client_id;
    if (id) people.add(id);
  }
  return people.size;
}

async function getHealthMetrics(db: ReturnType<typeof createServiceClient>) {
  const since7d = daysAgoIso(7);
  const since30d = daysAgoIso(30);

  // Total users is the people being tracked, not auth accounts: the
  // profiles table also holds coaches and staff, who are not Tistra Health
  // users and would inflate this by more than double.
  const totalUsersQuery = db
    .from("adults_contacts")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);

  const [photos7d, photos30d, photosTotal, active7d, active30d, activeEver, totalUsers] =
    await Promise.all([
      photoCount(db, since7d),
      photoCount(db, since30d),
      photoCount(db),
      activeUsers(db, since7d),
      activeUsers(db, since30d),
      activeUsers(db),
      totalUsersQuery.then(({ count, error }) => {
        if (error) throw new Error(`adults_contacts: ${error.message}`);
        return count ?? 0;
      }),
    ]);

  return {
    photosPosted7d: photos7d,
    photosPosted30d: photos30d,
    photosPostedTotal: photosTotal,
    activeUsers7d: active7d,
    activeUsers30d: active30d,
    activeUsersTotal: activeEver,
    totalUsers,
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
