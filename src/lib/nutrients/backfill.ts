import type { SupabaseClient } from "@supabase/supabase-js";

import { estimateMeal, type AnalyzedFoodInput } from "./meal-estimate";
import { recordMealNutrients } from "./pipeline";
import { loadConfirmedProducts, loadHouseholdFacts, type Subject } from "./store";

// Estimates for meals logged before micronutrient tracking, from what was
// already stored with them: food names, quantities and the analyzer's
// weight estimates. It makes no model calls and re-reads no photos, so it
// costs nothing beyond database reads. Anything the stored foods can't
// support (no weight, no composition match) is recorded as unknown or
// partial, exactly as for a new meal.
//
// Bounded and deliberate: a hard cap on rows per run, dry run unless told
// to write, never run by the app, a cron or the tests against a real
// database. Meals that already have an estimate are left alone, so re-runs
// pick up where the last stopped.

export const BACKFILL_VERSION = "micro-backfill-v1";
export const BACKFILL_HARD_LIMIT = 500;

export interface BackfillResult {
  version: string;
  dryRun: boolean;
  scanned: number;
  alreadyEstimated: number;
  written: number;
  failed: number;
  byStatus: { complete: number; partial: number; unknown: number };
}

export async function backfillMealNutrients(
  db: SupabaseClient,
  opts: { limit: number; dryRun: boolean; sinceIso?: string }
): Promise<BackfillResult> {
  const limit = Math.max(0, Math.min(opts.limit, BACKFILL_HARD_LIMIT));
  const result: BackfillResult = {
    version: BACKFILL_VERSION,
    dryRun: opts.dryRun,
    scanned: 0,
    alreadyEstimated: 0,
    written: 0,
    failed: 0,
    byStatus: { complete: 0, partial: 0, unknown: 0 },
  };
  if (limit === 0) return result;

  let query = db.from("meal_logs").select("id, adults_contact_id, client_id, foods, logged_at").order("logged_at", { ascending: false }).limit(limit);
  if (opts.sinceIso) query = query.gte("logged_at", opts.sinceIso);
  const { data: rows, error } = await query;
  if (error) throw new Error("meal_logs read failed");
  const meals = (rows ?? []) as Array<{ id: string; adults_contact_id: string | null; client_id: string | null; foods: AnalyzedFoodInput[] | null }>;
  result.scanned = meals.length;
  if (meals.length === 0) return result;

  const { data: existing } = await db.from("meal_nutrient_estimates").select("meal_log_id").in("meal_log_id", meals.map((m) => m.id));
  const done = new Set(((existing ?? []) as Array<{ meal_log_id: string }>).map((r) => r.meal_log_id));

  const facts = new Map<string, Awaited<ReturnType<typeof loadHouseholdFacts>>>();
  const products = new Map<string, Awaited<ReturnType<typeof loadConfirmedProducts>>>();
  for (const meal of meals) {
    if (done.has(meal.id)) {
      result.alreadyEstimated++;
      continue;
    }
    const subject: Subject | null = meal.adults_contact_id
      ? { contactType: "adults", contactId: meal.adults_contact_id }
      : meal.client_id
        ? { contactType: "gym", contactId: meal.client_id }
        : null;
    if (!subject) {
      result.failed++;
      continue;
    }
    const foods = Array.isArray(meal.foods) ? meal.foods : [];
    if (opts.dryRun) {
      const key = `${subject.contactType}:${subject.contactId}`;
      if (!facts.has(key)) facts.set(key, await loadHouseholdFacts(db, subject));
      if (!products.has(key)) products.set(key, await loadConfirmedProducts(db, subject));
      const estimate = estimateMeal({ foods, household: facts.get(key), products: products.get(key) });
      result.byStatus[estimate.status]++;
      continue;
    }
    const r = await recordMealNutrients(db, { mealLogId: meal.id, subject, foods, trigger: "backfill", ignoreFlag: true });
    if (r.ok) {
      result.written += r.skipped ? 0 : 1;
      result.byStatus[r.status]++;
    } else result.failed++;
  }
  return result;
}
