import type { SupabaseClient } from "@supabase/supabase-js";

import { getGuidanceState, guidanceSubjectColumn, loadContactFacts } from "@/lib/guidance/activation";
import { loadReleaseState } from "@/lib/guidance/release";

import { micronutrientsEnabled } from "./flags";
import { estimateInputHash, estimateMeal, type AnalyzedFoodInput, type MealEstimate, type MealEstimateInput } from "./meal-estimate";
import { loadConfirmedProducts, loadHouseholdFacts, loadMealFacts, mealLogSubjectColumn, subjectColumns, type Subject } from "./store";

// Where a saved meal becomes a stored micronutrient estimate. Called after
// every meal save, correction and reanalysis, from every entry point that
// writes meal_logs (the WhatsApp conversation handler and the
// stale-clarification sweep). Deleting a meal deletes its estimate through
// the foreign key.
//
// Three promises the callers rely on:
//   - It never throws and never blocks the meal save: the meal is already
//     saved when this runs, and any failure here is logged and dropped.
//   - It's idempotent: the same meal with the same foods, facts and data
//     versions is skipped, and a changed one replaces the single row for
//     that meal (one row per meal_log_id, upserted).
//   - It logs nothing private: no food names, photos or health details,
//     only an error code.
//
// With GUIDANCE_MICRONUTRIENTS_ENABLED off it returns before touching the
// database.

export type EstimateTrigger = "ingestion" | "correction" | "reanalysis" | "fact_change" | "backfill";

export type RecordResult =
  | { ok: true; skipped: boolean; status: MealEstimate["status"] }
  | { ok: false; reason: "disabled" | "error" };

export async function recordMealNutrients(
  db: SupabaseClient,
  params: {
    mealLogId: string;
    subject: Subject;
    foods: AnalyzedFoodInput[];
    identityConfidence?: "high" | "medium" | "low" | null;
    trigger: EstimateTrigger;
    /** Backfill runs as a deliberate, person-run script, so it doesn't
     * need the flag; everything else does. */
    ignoreFlag?: boolean;
  }
): Promise<RecordResult> {
  if (!params.ignoreFlag && !micronutrientsEnabled()) return { ok: false, reason: "disabled" };
  try {
    const [household, mealFacts, products] = await Promise.all([
      loadHouseholdFacts(db, params.subject),
      loadMealFacts(db, params.subject, [params.mealLogId]),
      loadConfirmedProducts(db, params.subject),
    ]);
    const input: MealEstimateInput = {
      foods: params.foods,
      identityConfidence: params.identityConfidence ?? null,
      household,
      meal: mealFacts.get(params.mealLogId),
      products,
    };
    const hash = estimateInputHash(input);
    const { data: existing } = await db.from("meal_nutrient_estimates").select("input_hash, status").eq("meal_log_id", params.mealLogId).maybeSingle();
    if (existing && (existing as { input_hash: string }).input_hash === hash) {
      return { ok: true, skipped: true, status: (existing as { status: MealEstimate["status"] }).status };
    }
    const estimate = estimateMeal(input);
    const { error } = await db.from("meal_nutrient_estimates").upsert(
      {
        meal_log_id: params.mealLogId,
        ...subjectColumns(params.subject),
        calculation_version: estimate.calculationVersion,
        composition_versions: estimate.compositionVersions,
        status: estimate.status,
        estimate,
        input_hash: hash,
        trigger: params.trigger,
        computed_at: new Date().toISOString(),
      },
      { onConflict: "meal_log_id" }
    );
    if (error) {
      console.error("[nutrients] estimate write failed:", error.code ?? "unknown");
      return { ok: false, reason: "error" };
    }
    return { ok: true, skipped: false, status: estimate.status };
  } catch (err) {
    // Message only: never the foods, photo or person.
    console.error("[nutrients] estimate failed:", err instanceof Error ? err.name : "unknown");
    return { ok: false, reason: "error" };
  }
}

/** Shape of a FoodAnalysisResult this module reads, without importing the
 * analyzer (which loads the Gemini SDK). */
export interface AnalysisLike {
  foods: AnalyzedFoodInput[];
  food_identity_confidence?: "high" | "medium" | "low" | null;
}

/**
 * Whether this person's meals get vitamin and mineral estimates: they're in
 * Nutrition Guidance, and Guidance is allowed for them here (release.ts:
 * before the clinical review, in production, only people whose account is
 * on the preview whitelist). Nobody else's meals are estimated.
 */
export async function micronutrientsActiveFor(db: SupabaseClient, subject: Subject): Promise<boolean> {
  const state = await getGuidanceState(db, subject.contactId, subject.contactType);
  if (state.mode !== "guidance") return false;
  const facts = await loadContactFacts(db, subject.contactId, subject.contactType);
  if (!facts) return false;
  return (await loadReleaseState(db, facts.caregiverId)).canActivate;
}

/** The call every meal-save path makes. Never throws. */
export async function afterMealSaved(
  db: SupabaseClient,
  params: { mealLogId: string; isAdults: boolean; entityId: string; analysis: AnalysisLike; trigger: EstimateTrigger }
): Promise<void> {
  if (!micronutrientsEnabled()) return;
  const subject: Subject = { contactType: params.isAdults ? "adults" : "gym", contactId: params.entityId };
  try {
    if (!(await micronutrientsActiveFor(db, subject))) return;
  } catch {
    return;
  }
  await recordMealNutrients(db, {
    mealLogId: params.mealLogId,
    subject: { contactType: params.isAdults ? "adults" : "gym", contactId: params.entityId },
    foods: params.analysis.foods ?? [],
    identityConfidence: params.analysis.food_identity_confidence ?? null,
    trigger: params.trigger,
  });
}

/**
 * Recomputes this person's recent estimates after a fact changes (a
 * household default, a confirmed product), so totals and flags follow the
 * new information. Bounded: at most `limit` meals since `sinceIso`.
 */
export async function recomputeAfterFactChange(
  db: SupabaseClient,
  subject: Subject,
  opts: { sinceIso: string; limit?: number }
): Promise<{ recomputed: number; failed: number }> {
  if (!micronutrientsEnabled()) return { recomputed: 0, failed: 0 };
  const { data, error } = await db
    .from("meal_logs")
    .select("id, foods")
    .eq(mealLogSubjectColumn(subject.contactType), subject.contactId)
    .gte("logged_at", opts.sinceIso)
    .limit(opts.limit ?? 200);
  if (error || !data) return { recomputed: 0, failed: 0 };
  let recomputed = 0;
  let failed = 0;
  for (const row of data as Array<{ id: string; foods: AnalyzedFoodInput[] | null }>) {
    const result = await recordMealNutrients(db, { mealLogId: row.id, subject, foods: row.foods ?? [], trigger: "fact_change" });
    if (result.ok && !result.skipped) recomputed++;
    if (!result.ok) failed++;
  }
  return { recomputed, failed };
}

/** Estimates stored for these meals, keyed by meal id, for one person only. */
export async function loadEstimates(db: SupabaseClient, subject: Subject, mealLogIds: string[]): Promise<Map<string, MealEstimate>> {
  const out = new Map<string, MealEstimate>();
  if (mealLogIds.length === 0) return out;
  const { data, error } = await db
    .from("meal_nutrient_estimates")
    .select("meal_log_id, estimate")
    .eq(guidanceSubjectColumn(subject.contactType), subject.contactId)
    .in("meal_log_id", mealLogIds);
  if (error) throw new Error("estimates read failed");
  for (const row of (data ?? []) as Array<{ meal_log_id: string; estimate: MealEstimate }>) out.set(row.meal_log_id, row.estimate);
  return out;
}
