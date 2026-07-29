import type { SupabaseClient } from "@supabase/supabase-js";
import type { FoodBalanceMealInput, NutritionGoal } from "@nutriai/health-scoring";
import type { DietaryProfile } from "@/lib/dietary-profile";
import {
  buildMealNutritionHistory,
  generateAllMealRecommendationCandidates,
  scoreRecommendationCandidates,
  applyRecommendationHistoryPenalty,
  selectPersonalisedFoodSuggestions,
  confidenceLevelFor,
  renderFoodBalanceRecommendation,
  renderTodayFocusRecommendation,
  type MealRecommendationCandidate,
  type MealNutritionHistory,
  type MealSlot,
  type NutrientType,
  type ConfidenceLevel,
  type RecommendationHistoryEntry,
} from "./meal-nutrient-recommendations";

/**
 * The shared computation point for the meal-specific recommendation engine
 * (meal-nutrient-recommendations.ts) — used by BOTH Food Balance Score and
 * Today's Focus so they never independently pick different meals/
 * nutrients for the same person on the same day (the spec's "cannot select
 * contradictory recommendations for the same day" rule). Whichever surface
 * runs first for a given local date inserts one row into
 * todays_focus_recommendations "claiming" that day (nutrient IS NOT NULL
 * marks a row produced by this engine, distinct from the older day-level
 * Today's Focus rows that predate it); the other surface reads that row
 * back instead of recomputing.
 *
 * Deliberately split into three layers rather than one do-everything
 * function, because the two surfaces persist differently:
 * - readTodaysMealRecommendationClaim / computeFreshMealRecommendation are
 *   pure read / pure compute — no assumptions about how the caller wants
 *   to persist the result.
 * - getOrComputeDailyMealRecommendation is the self-contained convenience
 *   wrapper Food Balance Score uses: showing it on the dashboard IS the
 *   delivery, so it can insert immediately with is_scheduled=false,
 *   delivery_status='sent'.
 * - Today's Focus (send-meal-reminders/route.ts) instead calls the first
 *   two directly and does its OWN insert with its existing is_scheduled/
 *   delivery_status semantics (pending until the WhatsApp send actually
 *   succeeds, then flipped via markTodaysFocusDelivery) — reusing
 *   getOrComputeDailyMealRecommendation there would have marked a message
 *   "sent" before WhatsApp ever tried to send it.
 *
 * This module does NOT fetch meals/profile/dietary-profile itself —
 * callers already have that (todays-focus-data.ts's fetchTodaysFocusInputs,
 * the Food Balance API routes' own queries), and duplicating those fetches
 * here would be exactly the kind of redundant-fetch problem this session
 * already fixed once on the dashboard (MacronutrientSummary/
 * FoodBalanceScoreCard/ShareCardsDashboardSection all independently
 * re-fetching the same data).
 */

export type MealRecommendationContext = "food_balance" | "today_focus";
export type RecommendationContactType = "adults_contact" | "gym_client";

export interface DailyMealRecommendation {
  candidate: MealRecommendationCandidate;
  confidence: ConfidenceLevel;
  foodSuggestions: { text: string; ids: string[] };
  foodBalanceText: { title: string; description: string; exampleFoodIds: string[] };
  todayFocusText: string;
}

const REPETITION_HISTORY_LOOKBACK_DAYS = 10;
/** Below this score, the top candidate is effectively suppressed (severe
 * repetition penalty or genuinely thin evidence) — treat as "nothing to
 * say" rather than surfacing a barely-there recommendation. */
const MIN_SCORE_TO_SURFACE = 0.02;

const ROW_SELECT_FIELDS =
  "category, nutrient, meal_type, issue_type, evidence_type, confidence, supporting_metrics, suggested_food_ids, message_text";

interface StoredRow {
  category: string;
  nutrient: NutrientType;
  meal_type: MealSlot | null;
  issue_type: MealRecommendationCandidate["issueType"];
  evidence_type: MealRecommendationCandidate["evidenceType"];
  confidence: ConfidenceLevel;
  supporting_metrics: Record<string, number | string | boolean | null>;
  suggested_food_ids: string[];
  message_text: string;
}

/** Reconstructs enough of a MealRecommendationCandidate from a
 * previously-claimed row to re-render it for the surface reading it back.
 * confidenceLevelFor() is recomputed from a synthetic loggingConfidence/
 * consistencyScore pair chosen to reproduce the SAME stored confidence
 * tier (rather than trusting a raw stored number that could drift from
 * the render logic) — positiveContext isn't persisted, so the reconstructed
 * candidate never carries one; this only affects the "second surface
 * reads it back today" path, never the original computation. */
function candidateFromRow(row: StoredRow): MealRecommendationCandidate {
  const confidenceSeed: Record<ConfidenceLevel, number> = { high: 1, moderate: 0.55, low: 0.1 };
  const seed = confidenceSeed[row.confidence];
  return {
    category: row.category as MealRecommendationCandidate["category"],
    nutrient: row.nutrient,
    mealType: row.meal_type ?? undefined,
    issueType: row.issue_type,
    evidenceType: row.evidence_type,
    severity: seed,
    consistencyScore: seed,
    loggingConfidence: seed,
    classificationConfidence: 1,
    goalRelevance: 0.6,
    recencyScore: seed,
    actionabilityScore: seed,
    noveltyScore: 1,
    supportingMetrics: row.supporting_metrics,
    suggestedFoodIds: row.suggested_food_ids,
  };
}

function toResult(
  candidate: MealRecommendationCandidate,
  confidence: ConfidenceLevel,
  history: MealNutritionHistory,
  dietaryProfile: DietaryProfile,
  goal: NutritionGoal | undefined,
  todayFocusText: string
): DailyMealRecommendation {
  // Food suggestions are re-derived fresh (not replayed verbatim) so they
  // can still improve as more meals are logged later the same day, while
  // WHICH meal/nutrient/evidence stays locked to whatever won the claim.
  const foodSuggestions = selectPersonalisedFoodSuggestions(candidate.nutrient, candidate.mealType ?? "dinner", dietaryProfile, history, goal);
  return {
    candidate,
    confidence,
    foodSuggestions,
    foodBalanceText: renderFoodBalanceRecommendation(candidate, foodSuggestions),
    todayFocusText,
  };
}

/** Reads today's already-claimed shared recommendation, if any surface has
 * already computed one for this contact/local-date — never computes or
 * writes anything. */
export async function readTodaysMealRecommendationClaim(
  db: SupabaseClient,
  contactId: string,
  contactType: RecommendationContactType,
  todayLocalDate: string,
  history: MealNutritionHistory,
  dietaryProfile: DietaryProfile,
  goal?: NutritionGoal
): Promise<DailyMealRecommendation | null> {
  const { data } = await db
    .from("todays_focus_recommendations")
    .select(ROW_SELECT_FIELDS)
    .eq("contact_id", contactId)
    .eq("contact_type", contactType)
    .eq("local_date", todayLocalDate)
    .not("nutrient", "is", null)
    .maybeSingle();
  if (!data) return null;
  const row = data as StoredRow;
  return toResult(candidateFromRow(row), row.confidence, history, dietaryProfile, goal, row.message_text);
}

/** Computes a fresh candidate across all nutrient tracks — repetition
 * penalty is applied against the last REPETITION_HISTORY_LOOKBACK_DAYS
 * days of new-engine deliveries (regardless of which surface made them).
 * Returns null when nothing clears the evidence bar or everything eligible
 * is suppressed by the repetition penalty. Writes nothing — the caller
 * decides how/whether to persist the result. */
export async function computeFreshMealRecommendation(
  db: SupabaseClient,
  contactId: string,
  contactType: RecommendationContactType,
  history: MealNutritionHistory,
  dailyTargets: Partial<Record<NutrientType, number>>,
  todayLocalDate: string,
  dietaryProfile: DietaryProfile,
  goal?: NutritionGoal
): Promise<DailyMealRecommendation | null> {
  const rawCandidates = generateAllMealRecommendationCandidates(history, dailyTargets, goal);
  if (rawCandidates.length === 0) return null;

  const { data: recentRows } = await db
    .from("todays_focus_recommendations")
    .select("local_date, category, meal_type")
    .eq("contact_id", contactId)
    .eq("contact_type", contactType)
    .not("nutrient", "is", null)
    .order("local_date", { ascending: false })
    .limit(REPETITION_HISTORY_LOOKBACK_DAYS);

  const historyEntries: RecommendationHistoryEntry[] = (recentRows ?? []).map((r) => ({
    localDate: r.local_date as string,
    category: r.category as string,
    mealType: (r.meal_type as MealSlot | null) ?? undefined,
  }));

  const penalized = rawCandidates.map((c) => applyRecommendationHistoryPenalty(c, historyEntries, todayLocalDate));
  const scored = scoreRecommendationCandidates(penalized);
  const top = scored[0];
  if (!top || (top.score ?? 0) < MIN_SCORE_TO_SURFACE) return null;

  const todayFocusText = renderTodayFocusRecommendation(top, selectPersonalisedFoodSuggestions(top.nutrient, top.mealType ?? "dinner", dietaryProfile, history, goal));
  return toResult(top, confidenceLevelFor(top), history, dietaryProfile, goal, todayFocusText);
}

export interface GetOrComputeParams {
  db: SupabaseClient;
  contactId: string;
  contactType: RecommendationContactType;
  workspaceId: string;
  context: MealRecommendationContext;
  meals: FoodBalanceMealInput[];
  timezone: string;
  todayLocalDate: string;
  dietaryProfile: DietaryProfile;
  /** Daily targets per nutrient this engine understands — typically
   * derived from calculateMacroTargets(profile) by the caller (protein/
   * fiber/calories targets; fruit/vegetable have none in this codebase,
   * see meal-nutrient-recommendations.ts's own doc on why that's fine). */
  dailyTargets: Partial<Record<NutrientType, number>>;
  goal?: NutritionGoal;
}

/** Self-contained convenience wrapper for surfaces with no delivery step
 * of their own (Food Balance Score: rendering it on the dashboard IS the
 * delivery) — reads today's claim if one exists, otherwise computes fresh
 * and immediately inserts it as claimed (is_scheduled=false,
 * delivery_status='sent'). Today's Focus does NOT use this — see the
 * module doc for why it calls readTodaysMealRecommendationClaim /
 * computeFreshMealRecommendation directly instead and persists with its
 * own pending/sent/failed lifecycle. */
export async function getOrComputeDailyMealRecommendation(params: GetOrComputeParams): Promise<DailyMealRecommendation | null> {
  const { db, contactId, contactType, workspaceId, context, meals, timezone, todayLocalDate, dietaryProfile, dailyTargets, goal } = params;
  const history = buildMealNutritionHistory(meals, timezone, todayLocalDate);

  const existing = await readTodaysMealRecommendationClaim(db, contactId, contactType, todayLocalDate, history, dietaryProfile, goal);
  if (existing) return existing;

  const fresh = await computeFreshMealRecommendation(db, contactId, contactType, history, dailyTargets, todayLocalDate, dietaryProfile, goal);
  if (!fresh) return null;

  const { error: insertError } = await db.from("todays_focus_recommendations").insert({
    contact_id: contactId,
    contact_type: contactType,
    workspace_id: workspaceId,
    local_date: todayLocalDate,
    timezone,
    category: fresh.candidate.category,
    nutrient: fresh.candidate.nutrient,
    meal_type: fresh.candidate.mealType ?? null,
    issue_type: fresh.candidate.issueType,
    evidence_type: fresh.candidate.evidenceType,
    priority_score: fresh.candidate.score ?? 0,
    confidence: fresh.confidence,
    analysis_window_days: 7,
    supporting_metrics: fresh.candidate.supportingMetrics,
    goal: goal ?? null,
    message_variant: `${fresh.candidate.category}_${fresh.candidate.evidenceType}`,
    message_text: fresh.todayFocusText,
    suggested_food_ids: fresh.foodSuggestions.ids,
    is_scheduled: false,
    delivery_status: "sent",
    context,
  });

  if (insertError) {
    // Lost the race to claim today (a concurrent call — either surface —
    // won) — read back whatever it stored instead of returning our own,
    // now-discarded pick.
    const winner = await readTodaysMealRecommendationClaim(db, contactId, contactType, todayLocalDate, history, dietaryProfile, goal);
    if (winner) return winner;
  }

  return fresh;
}
