import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// Internal metrics feed for the tistra-corp admin dashboard (tistra.sg/admin).
// Not user-facing — bearer-token auth only, same pattern as the cron route
// (src/app/api/cron/send-meal-reminders/route.ts). tistra-corp holds the
// matching secret in a Pages Function and never exposes it to the browser.

export const dynamic = "force-dynamic";

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function countSince(
  db: ReturnType<typeof createServiceClient>,
  table: string,
  column: string,
  since?: string
) {
  let query = db.from(table).select("id", { count: "exact", head: true });
  if (since) query = query.gte(column, since);
  const { count, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

async function distinctCountSince(
  db: ReturnType<typeof createServiceClient>,
  table: string,
  distinctColumn: string,
  dateColumn: string,
  since?: string
) {
  let query = db.from(table).select(distinctColumn);
  if (since) query = query.gte(dateColumn, since);
  const { data, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  const values = (data ?? []) as unknown as Record<string, string>[];
  return new Set(values.map((row) => row[distinctColumn])).size;
}

async function getHealthMetrics(db: ReturnType<typeof createServiceClient>) {
  const since7d = daysAgoIso(7);
  const since30d = daysAgoIso(30);

  const [
    photos7d,
    photos30d,
    photosTotal,
    activeUsers7d,
    activeUsers30d,
    totalUsers,
  ] = await Promise.all([
    countSince(db, "meal_images", "uploaded_at", since7d),
    countSince(db, "meal_images", "uploaded_at", since30d),
    countSince(db, "meal_images", "uploaded_at"),
    distinctCountSince(db, "meals", "meal_logger_id", "logged_at", since7d),
    distinctCountSince(db, "meals", "meal_logger_id", "logged_at", since30d),
    distinctCountSince(db, "workspace_members", "user_id", "joined_at"),
  ]);

  return {
    photosPosted7d: photos7d,
    photosPosted30d: photos30d,
    photosPostedTotal: photosTotal,
    activeUsers7d,
    activeUsers30d,
    totalUsers,
  };
}

async function getClubMetrics(db: ReturnType<typeof createServiceClient>) {
  const [coachesOnboarded, classesBooked, { data: payments, error: paymentsError }] = await Promise.all([
    countSinceNeq(db, "coach_profiles", "status", "draft"),
    countSinceNeq(db, "bookings", "status", "PAYMENT_PENDING"),
    db.from("club_payments").select("gross_amount_cents, platform_fee_cents").eq("status", "succeeded"),
  ]);

  if (paymentsError) throw new Error(`club_payments: ${paymentsError.message}`);

  const succeededPayments = (payments ?? []) as { gross_amount_cents: number; platform_fee_cents: number }[];
  const revenueCents = succeededPayments.reduce((sum, row) => sum + row.gross_amount_cents, 0);
  const commissionCents = succeededPayments.reduce((sum, row) => sum + row.platform_fee_cents, 0);

  return {
    coachesOnboarded,
    classesBooked,
    revenueCents,
    commissionCents,
  };
}

async function countSinceNeq(
  db: ReturnType<typeof createServiceClient>,
  table: string,
  column: string,
  excludeValue: string
) {
  const { count, error } = await db.from(table).select("id", { count: "exact", head: true }).neq(column, excludeValue);
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
