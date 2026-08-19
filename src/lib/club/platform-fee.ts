import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PLATFORM_FEE_PERCENT } from "./config";

// What Tistra takes from each session before the coach is paid.
//
// The rate lives in club_platform_fees, one row per change with an
// effective_from date, rather than in an env var. Two reasons: a fee change
// is a commercial decision that should be dated and explainable months
// later, and every club_payments row already snapshots the percent it was
// charged at, so history stays reconstructable either way.
//
// Reads are cached briefly — this is asked on every checkout and changes a
// handful of times in a product's life.

const CACHE_MS = 60_000;
let cached: { at: number; percent: number } | null = null;

/** The rate in force now. Falls back to the configured default rather than
 * throwing: refusing to take a payment because a fee lookup failed would
 * be a worse outcome than charging the known default. */
export async function getPlatformFeePercent(admin: SupabaseClient): Promise<number> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.percent;

  const { data } = await admin
    .from("club_platform_fees")
    .select("fee_percent")
    .lte("effective_from", new Date().toISOString())
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  const percent = data?.fee_percent != null ? Number(data.fee_percent) : DEFAULT_PLATFORM_FEE_PERCENT;
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    return DEFAULT_PLATFORM_FEE_PERCENT;
  }
  cached = { at: Date.now(), percent };
  return percent;
}

/** Testing and admin use — forces the next read to hit the table. */
export function clearPlatformFeeCache(): void {
  cached = null;
}
