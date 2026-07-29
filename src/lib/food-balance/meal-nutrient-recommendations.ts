import type { FoodBalanceMealInput, NutritionGoal } from "@nutriai/health-scoring";
import type { DietaryProfile } from "@/lib/dietary-profile";
import { pickFoodExamples } from "./personalize";
import type { FoodSuggestionCategory } from "./food-library";
import { isRecommendationSafe } from "./safety";
import { bucketMealsByLocalDate, recentLocalDates } from "./todays-focus";

/**
 * Meal-level ("is dinner specifically low in protein?") recommendation
 * engine — extends src/lib/food-balance/todays-focus.ts's day-level
 * analysis (which only ever looks at TOTAL daily protein/fiber/etc.,
 * never per-meal) rather than duplicating its bucketing/completeness/
 * safety/personalization building blocks. Both Food Balance Score and
 * Today's Focus are meant to eventually call generateMealRecommendationCandidates
 * instead of each having their own meal-blind logic — see this feature's
 * own implementation notes for the phased rollout plan (this module is
 * still Phase 1: not yet wired into either surface).
 *
 * Covers protein, fiber, fruit, vegetable, and calories (as a per-meal
 * "too light" signal only — a single unusually HIGH calorie day is
 * already handled at the day level by todays-focus.ts's own calories_high
 * branch, which needs no meal attribution per the spec's own example).
 * Diversity and ultra-processed-food share are inherently day/week-level
 * signals, not meal-slot-specific, and stay in todays-focus.ts.
 *
 * Deliberately deterministic throughout, matching todays-focus.ts's own
 * "no LLM anywhere in this file" rule (see that file's module doc) — this
 * is exactly the kind of nutrition-adequacy judgment that must never be
 * left to a model.
 */

// ---- Shared types -----------------------------------------------------

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";
export const MEAL_SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

export type NutrientType = "protein" | "fiber" | "fruit" | "vegetable" | "calories";
export const NUTRIENT_TYPES: NutrientType[] = ["protein", "fiber", "fruit", "vegetable", "calories"];

/** Maps this module's NutrientType onto @nutriai/health-scoring's
 * RecommendationCategory (packages/health-scoring/src/food-balance/types.ts)
 * — that package uses British "fibre"/plural "vegetables"/"energy" for
 * calories, so a meal-specific candidate can be spliced into the Food
 * Balance Score's existing FoodBalanceRecommendation[] list without
 * inventing a parallel category vocabulary. */
export const NUTRIENT_TO_RECOMMENDATION_CATEGORY: Record<NutrientType, string> = {
  protein: "protein",
  fiber: "fibre",
  fruit: "fruit",
  vegetable: "vegetables",
  calories: "energy",
};

export type MealGapIssueType =
  | "overall_gap"
  | "meal_gap"
  | "distribution_gap"
  | "positive_pattern"
  | "insufficient_data";

export type EvidenceType =
  | "yesterday_only"
  | "yesterday_confirms_pattern"
  | "historical_pattern"
  | "single_unusual_day";

export type ConfidenceLevel = "high" | "moderate" | "low";

// ---- Configuration ----------------------------------------------------

/** All thresholds the spec asked to keep configurable rather than
 * hardcoded ad hoc through candidate-generation logic. */
export const MEAL_RECOMMENDATION_CONFIG = {
  /** A meal needs at least this many logged, sufficiently-complete
   * instances in the 7-day window before ANY meal-level claim is made
   * about it — otherwise fall back to a low-confidence/insufficient-data
   * wording instead of a specific meal claim. */
  minInstancesForPattern: 3,
  /** Prefer this many or more instances for a "high confidence" claim. */
  strongEvidenceInstances: 4,
  /** Overall (all-meals) logging completeness floor below which no
   * meal-level recommendation is generated at all (mirrors
   * todays-focus.ts's own completeness.level === "low" gate, but this
   * module doesn't depend on that file's LoggingCompleteness type so it
   * can be reused by callers that haven't computed one). */
  minOverallLoggingCompleteness: 0.6,
  /** Share of sufficiently-complete instances that must be below range
   * before a meal is called "problematic" for a nutrient. */
  minShareBelowRangeForPattern: 0.5,
  /** Recommending the same (category, mealSlot) pair again is strongly
   * penalized within this many days, moderately penalized within the
   * wider window below. */
  recentHistoryStrongPenaltyDays: 2,
  recentHistoryModeratePenaltyDays: 7,
  /** Overall daily amount is "meaningfully" below target at this
   * fraction — matches todays-focus.ts's own 0.85 protein convention so
   * the two engines don't disagree about what "low" means. */
  overallGapThresholdFraction: 0.85,
  /** A meal's share of the daily target this far above its own
   * distribution range's max, while the overall total is otherwise
   * adequate, is treated as a distribution (not inadequacy) issue. */
  distributionOverconcentrationFraction: 0.15,
} as const;

interface NutrientTrackConfig {
  /** Reads this nutrient's amount out of one meal-slot instance. */
  valueOf(instance: MealSlotInstance): number;
  /** Minimum useful amount per meal regardless of % distribution — the
   * spec's "prefer minimum useful meal thresholds in addition to
   * percentage distribution," so a meal isn't flagged "low" purely
   * because the day's total target is unusually high/low. */
  minUsefulByMeal: Record<MealSlot, number>;
  /** Broad, configurable distribution ranges as a fraction of the daily
   * target — NOT "exactly a third per meal." Undefined for fruit/
   * vegetable, which don't have a clean per-user daily gram/serving
   * target in this codebase; their adequacy is judged by minUsefulByMeal
   * alone, matching todays-focus.ts's own precedent of using an absolute
   * servings threshold rather than a ratio for this same data. */
  distributionByMeal?: Record<MealSlot, { min: number; max: number }>;
  /** Whether "overall total is adequate but concentrated in one meal" is
   * a meaningful distinct claim for this nutrient — true for
   * protein/fiber (real daily targets exist), false for fruit/vegetable/
   * calories (see distributionByMeal's own doc, and calories_high's
   * existing day-level handling in todays-focus.ts). */
  supportsDistributionGap: boolean;
  foodSuggestionCategory: FoodSuggestionCategory;
  noun: string;
}

/** Widens breakfast/lunch/dinner's acceptable distribution range slightly
 * for muscle-gain goals on protein (spreading protein across the day
 * matters more for that goal specifically) — the spec's "adjust for user
 * goal" instruction, applied narrowly rather than guessing an adjustment
 * for every nutrient/goal combination. */
function distributionRangeFor(nutrient: NutrientType, slot: MealSlot, goal?: NutritionGoal): { min: number; max: number } {
  const base = NUTRIENT_TRACKS[nutrient].distributionByMeal?.[slot];
  if (!base) return { min: 0, max: 1 };
  if (nutrient === "protein" && goal === "gain_muscle" && (slot === "lunch" || slot === "dinner")) {
    return { min: base.min, max: Math.min(1, base.max + 0.05) };
  }
  return base;
}

const NUTRIENT_TRACKS: Record<NutrientType, NutrientTrackConfig> = {
  protein: {
    valueOf: (i) => i.proteinG,
    minUsefulByMeal: { breakfast: 12, lunch: 15, dinner: 15, snack: 5 },
    distributionByMeal: {
      breakfast: { min: 0.2, max: 0.35 },
      lunch: { min: 0.25, max: 0.4 },
      dinner: { min: 0.25, max: 0.4 },
      snack: { min: 0, max: 0.15 },
    },
    supportsDistributionGap: true,
    foodSuggestionCategory: "protein",
    noun: "protein",
  },
  fiber: {
    valueOf: (i) => i.fibreG,
    minUsefulByMeal: { breakfast: 3, lunch: 4, dinner: 4, snack: 1 },
    distributionByMeal: {
      breakfast: { min: 0.15, max: 0.35 },
      lunch: { min: 0.25, max: 0.45 },
      dinner: { min: 0.25, max: 0.45 },
      snack: { min: 0, max: 0.25 },
    },
    supportsDistributionGap: true,
    foodSuggestionCategory: "fiber",
    noun: "fiber",
  },
  fruit: {
    valueOf: (i) => i.fruitServings,
    // Fruit isn't expected at every meal the way protein is — treated as
    // "somewhere in the earlier part of the day" (breakfast or snack),
    // never penalizing lunch/dinner for lacking it.
    minUsefulByMeal: { breakfast: 0.5, lunch: 0, dinner: 0, snack: 0.5 },
    supportsDistributionGap: false,
    foodSuggestionCategory: "fruit_veg",
    noun: "fruit",
  },
  vegetable: {
    valueOf: (i) => i.vegetableServings,
    // Vegetables are expected at the two main cooked meals specifically —
    // matches the spec's own "vegetables present at lunch but absent at
    // dinner" framing.
    minUsefulByMeal: { breakfast: 0, lunch: 0.5, dinner: 0.5, snack: 0 },
    supportsDistributionGap: false,
    foodSuggestionCategory: "fruit_veg",
    noun: "vegetables",
  },
  calories: {
    valueOf: (i) => i.calories,
    minUsefulByMeal: { breakfast: 200, lunch: 300, dinner: 300, snack: 50 },
    distributionByMeal: {
      breakfast: { min: 0.2, max: 0.35 },
      lunch: { min: 0.3, max: 0.4 },
      dinner: { min: 0.25, max: 0.4 },
      snack: { min: 0, max: 0.15 },
    },
    // A single unusually HIGH-calorie day is already handled at the day
    // level (todays-focus.ts's calories_high, deliberately non-meal-
    // specific per the spec's own "one day does not require correction"
    // example) — this track only ever generates a "meal consistently too
    // light" low-side claim.
    supportsDistributionGap: false,
    foodSuggestionCategory: "protein",
    noun: "calories",
  },
};

// ---- Meal nutrition history --------------------------------------------

export interface MealSlotInstance {
  date: string;
  proteinG: number;
  fibreG: number;
  fruitServings: number;
  vegetableServings: number;
  calories: number;
  /** aiConfidence undefined is treated as "fine" (matches this meal
   * input's own convention elsewhere — see FoodBalanceMealInput's doc),
   * so this is only false for meals explicitly logged at low confidence. */
  sufficientlyComplete: boolean;
  wholeFoods: string[];
}

export interface MealNutritionHistory {
  /** 7 local calendar dates, oldest first, last entry is yesterday. */
  windowDates: string[];
  instancesBySlot: Record<MealSlot, MealSlotInstance[]>;
  /** 0-1 per date — logged meals that day / this person's own normal
   * meals-per-day (derived from the window, not a hardcoded assumption). */
  dailyLoggingCompleteness: Record<string, number>;
  expectedMealsPerDay: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function slotOf(mealType: string): MealSlot | null {
  if (mealType === "breakfast" || mealType === "lunch" || mealType === "dinner" || mealType === "snack") return mealType;
  return null; // drinks/other/unclassified — never forced into a main slot
}

/** Builds the rolling 7-day, per-meal-slot nutrition history a
 * recommendation is evaluated against — the missing layer between
 * todays-focus.ts's day-level totals and the meal-specific claims this
 * feature needs ("dinner has been low," not "the day was low"). */
export function buildMealNutritionHistory(
  meals: FoodBalanceMealInput[],
  timezone: string,
  todayLocalDate: string
): MealNutritionHistory {
  const mealsByDate = bucketMealsByLocalDate(meals, timezone);
  const windowDates = recentLocalDates(todayLocalDate, 7);

  const activeDayCounts = windowDates.map((d) => mealsByDate.get(d)?.length ?? 0).filter((c) => c > 0);
  const expectedMealsPerDay = activeDayCounts.length > 0 ? median(activeDayCounts) : 2;

  const instancesBySlot: Record<MealSlot, MealSlotInstance[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
  const dailyLoggingCompleteness: Record<string, number> = {};

  for (const date of windowDates) {
    const dayMeals = (mealsByDate.get(date) ?? []).filter((m) => !m.isDeleted && !m.isDuplicate);
    dailyLoggingCompleteness[date] = Math.min(1, dayMeals.length / Math.max(1, expectedMealsPerDay));

    for (const meal of dayMeals) {
      const slot = slotOf(meal.mealType);
      if (!slot) continue;
      instancesBySlot[slot].push({
        date,
        proteinG: meal.proteinG ?? 0,
        fibreG: meal.fibreG ?? 0,
        fruitServings: meal.fruitServings ?? 0,
        vegetableServings: meal.vegetableServings ?? 0,
        calories: meal.calories ?? 0,
        sufficientlyComplete: meal.aiConfidence === undefined || meal.aiConfidence >= 0.5,
        wholeFoods: meal.wholeFoods ?? [],
      });
    }
  }

  return { windowDates, instancesBySlot, dailyLoggingCompleteness, expectedMealsPerDay };
}

/** Overall (all-slot) logging completeness for the window — the
 * meal-level equivalent gate to todays-focus.ts's calculateLoggingCompleteness
 * score, kept separate so this module has no import dependency on that
 * file's day-level type. */
export function calculateOverallLoggingCompleteness(history: MealNutritionHistory): number {
  const values = history.windowDates.map((d) => history.dailyLoggingCompleteness[d] ?? 0);
  return values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);
}

// ---- Per-slot nutrient adequacy ------------------------------------------

export interface MealSlotAdequacy {
  slot: MealSlot;
  nutrient: NutrientType;
  loggedInstances: number;
  sufficientlyCompleteInstances: number;
  averageAmount: number | null;
  belowRangeInstances: number;
  belowRangeShare: number | null;
  yesterdayLogged: boolean;
  yesterdayAmount: number | null;
  yesterdayBelowRange: boolean | null;
  /** Recency-weighted amount per the spec's 50/25/25 model, with
   * yesterday's contribution scaled down by that day's own logging
   * completeness and the unused weight redistributed to the two
   * historical buckets (never treated as "zero" just because yesterday
   * wasn't logged). Null if there's no data at all in the window. */
  weightedAmount: number | null;
  hasPattern: boolean;
  commonFoods: string[];
}

function isBelowRange(amount: number, slot: MealSlot, nutrient: NutrientType, dailyTarget: number | undefined, goal?: NutritionGoal): boolean {
  const track = NUTRIENT_TRACKS[nutrient];
  if (amount < track.minUsefulByMeal[slot]) return true;
  if (!dailyTarget || !track.distributionByMeal) return false;
  const range = distributionRangeFor(nutrient, slot, goal);
  return amount < dailyTarget * range.min;
}

/** Computes one meal slot's adequacy for one nutrient across the 7-day
 * window — the "row" of the meal x nutrient matrix the spec describes. */
export function calculateMealSlotAdequacy(
  history: MealNutritionHistory,
  slot: MealSlot,
  nutrient: NutrientType,
  dailyTarget?: number,
  goal?: NutritionGoal
): MealSlotAdequacy {
  const track = NUTRIENT_TRACKS[nutrient];
  const instances = history.instancesBySlot[slot];
  const complete = instances.filter((i) => i.sufficientlyComplete);
  const yesterdayDate = history.windowDates[history.windowDates.length - 1];
  const day2to3 = history.windowDates.slice(-3, -1);
  const day4to7 = history.windowDates.slice(0, -3);

  const amountOf = (i: MealSlotInstance) => track.valueOf(i);
  const belowFlags = complete.map((i) => isBelowRange(amountOf(i), slot, nutrient, dailyTarget, goal));
  const belowRangeInstances = belowFlags.filter(Boolean).length;
  const averageAmount = complete.length > 0 ? complete.reduce((s, i) => s + amountOf(i), 0) / complete.length : null;

  const yesterdayInstance = complete.find((i) => i.date === yesterdayDate) ?? null;
  const yesterdayLogged = !!yesterdayInstance;
  const yesterdayAmount = yesterdayInstance ? amountOf(yesterdayInstance) : null;
  const yesterdayBelowRange = yesterdayInstance ? isBelowRange(amountOf(yesterdayInstance), slot, nutrient, dailyTarget, goal) : null;

  const avgOver = (dates: string[]): number | null => {
    const vals = complete.filter((i) => dates.includes(i.date)).map(amountOf);
    return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  };
  const day2to3Avg = avgOver(day2to3);
  const day4to7Avg = avgOver(day4to7);

  const yesterdayCompleteness = history.dailyLoggingCompleteness[yesterdayDate] ?? (yesterdayLogged ? 1 : 0);
  const yesterdayWeight = 0.5 * yesterdayCompleteness;
  const remainingWeight = 1 - yesterdayWeight;
  // Preserve the historical buckets' 25/25 (i.e. 50/50 of what's left)
  // ratio while absorbing whatever yesterday's incomplete logging gave up.
  const day2to3Weight = remainingWeight * 0.5;
  const day4to7Weight = remainingWeight * 0.5;

  const weightedParts: Array<{ weight: number; value: number }> = [];
  if (yesterdayAmount !== null) weightedParts.push({ weight: yesterdayWeight, value: yesterdayAmount });
  if (day2to3Avg !== null) weightedParts.push({ weight: day2to3Weight, value: day2to3Avg });
  if (day4to7Avg !== null) weightedParts.push({ weight: day4to7Weight, value: day4to7Avg });
  const totalWeight = weightedParts.reduce((s, p) => s + p.weight, 0);
  const weightedAmount = totalWeight > 0 ? weightedParts.reduce((s, p) => s + p.weight * p.value, 0) / totalWeight : null;

  const commonFoods = [...new Set(complete.flatMap((i) => i.wholeFoods))].slice(0, 6);

  return {
    slot,
    nutrient,
    loggedInstances: instances.length,
    sufficientlyCompleteInstances: complete.length,
    averageAmount,
    belowRangeInstances,
    belowRangeShare: complete.length > 0 ? belowRangeInstances / complete.length : null,
    yesterdayLogged,
    yesterdayAmount,
    yesterdayBelowRange,
    weightedAmount,
    hasPattern:
      complete.length >= MEAL_RECOMMENDATION_CONFIG.minInstancesForPattern &&
      belowRangeInstances / Math.max(1, complete.length) >= MEAL_RECOMMENDATION_CONFIG.minShareBelowRangeForPattern,
    commonFoods,
  };
}

// ---- Evidence classification --------------------------------------------

/** Minimal structural shape classifyEvidenceType actually needs — both
 * MealSlotAdequacy and the protein-named backward-compatible shape below
 * satisfy it, so this works unchanged across every nutrient. */
interface EvidenceInputs {
  hasPattern: boolean;
  yesterdayLogged: boolean;
  yesterdayBelowRange: boolean | null;
  sufficientlyCompleteInstances: number;
  belowRangeInstances: number;
}

/** Classifies how yesterday relates to the 7-day pattern for a
 * problematic meal slot — drives which of the spec's four wording
 * families (yesterday-only / confirms-pattern / historical-only /
 * single-unusual-day) is used, never claiming yesterday showed something
 * it didn't. */
export function classifyEvidenceType(adequacy: EvidenceInputs): EvidenceType {
  const hasPattern = adequacy.hasPattern;
  if (hasPattern && adequacy.yesterdayLogged && adequacy.yesterdayBelowRange) return "yesterday_confirms_pattern";
  if (hasPattern) return "historical_pattern";
  // Not yet a persistent pattern (fewer than minInstancesForPattern below-range
  // instances) — if yesterday itself was below range, that's a fresh signal
  // worth a cautious mention; otherwise there isn't enough here to say
  // anything meal-specific at all (caller should drop the candidate).
  if (adequacy.yesterdayLogged && adequacy.yesterdayBelowRange) {
    // Yesterday looks like an outlier relative to a slot that otherwise
    // isn't showing a problem (few/no other below-range instances) —
    // treated as a single unusual day rather than implying a new habit.
    if (adequacy.sufficientlyCompleteInstances >= MEAL_RECOMMENDATION_CONFIG.minInstancesForPattern && adequacy.belowRangeInstances <= 1) {
      return "single_unusual_day";
    }
    return "yesterday_only";
  }
  return "historical_pattern";
}

// ---- Candidate structure -------------------------------------------------

export interface StructuredPositivePattern {
  slot: MealSlot;
  averageAmount: number;
}

export type MealRecommendationCategory = `${NutrientType}_low` | `${NutrientType}_distribution`;

export interface MealRecommendationCandidate {
  category: MealRecommendationCategory;
  nutrient: NutrientType;
  mealType?: MealSlot;
  issueType: MealGapIssueType;
  evidenceType: EvidenceType;
  /** 0-1 — how far below the relevant range, weighted-amount based. */
  severity: number;
  /** 0-1 — how consistently the issue occurs across complete instances. */
  consistencyScore: number;
  /** 0-1 — derived from overall + this-slot logging completeness. */
  loggingConfidence: number;
  /** 0-1 — always 1 here (Phase 1 has no per-meal classification-confidence
   * signal beyond sufficientlyComplete, already folded into loggingConfidence). */
  classificationConfidence: number;
  goalRelevance: number;
  /** 0-1 — whether yesterday itself supports/confirms the claim. */
  recencyScore: number;
  actionabilityScore: number;
  /** Set by applyRecommendationHistoryPenalty — 1 if never recommended
   * recently, penalized down toward 0 the more recently/severely repeated. */
  noveltyScore: number;
  positiveContext?: StructuredPositivePattern;
  supportingMetrics: Record<string, number | string | boolean | null>;
  suggestedFoodIds: string[];
  /** Set once by scoreRecommendationCandidates — the final ranking value. */
  score?: number;
}

// ---- Candidate generation -------------------------------------------------

export interface GenerateMealCandidatesParams {
  history: MealNutritionHistory;
  nutrient: NutrientType;
  dailyTarget?: number;
  goal?: NutritionGoal;
}

/** Generates 0 or 1 candidates (a "low at this meal" claim, a
 * "concentrated at this meal" distribution claim, or nothing) for ONE
 * nutrient from the meal-level adequacy matrix — this is the module's
 * core "which meal, and why" decision described throughout the feature
 * spec. Returns [] when there isn't enough evidence for ANY claim on this
 * nutrient (caller falls back to its own insufficient-data handling,
 * mirroring todays-focus.ts's existing convention). Called once per
 * nutrient by generateAllMealRecommendationCandidates below. */
export function generateMealRecommendationCandidates(params: GenerateMealCandidatesParams): MealRecommendationCandidate[] {
  const { history, nutrient, dailyTarget, goal } = params;
  const track = NUTRIENT_TRACKS[nutrient];
  const overallCompleteness = calculateOverallLoggingCompleteness(history);
  if (overallCompleteness < MEAL_RECOMMENDATION_CONFIG.minOverallLoggingCompleteness) return [];

  const adequacyBySlot = Object.fromEntries(
    MEAL_SLOTS.map((slot) => [slot, calculateMealSlotAdequacy(history, slot, nutrient, dailyTarget, goal)])
  ) as Record<MealSlot, MealSlotAdequacy>;

  const eligibleSlots = MEAL_SLOTS.filter(
    (s) => adequacyBySlot[s].sufficientlyCompleteInstances >= MEAL_RECOMMENDATION_CONFIG.minInstancesForPattern
  );
  if (eligibleSlots.length === 0) return [];

  const problematicSlots = eligibleSlots.filter((s) => adequacyBySlot[s].hasPattern);
  const goodSlots = eligibleSlots.filter((s) => !adequacyBySlot[s].hasPattern && (adequacyBySlot[s].belowRangeShare ?? 1) <= 0.2);

  // Overall 7-day daily average (sum across slots per day, over days with
  // any of this nutrient logged at all) vs. target — the "is this a
  // total-inadequacy problem, or just a distribution problem" gate the
  // spec repeatedly asks for.
  const dayTotals = history.windowDates
    .map((d) =>
      MEAL_SLOTS.reduce((s, slot) => s + (history.instancesBySlot[slot].find((i) => i.date === d) ? track.valueOf(history.instancesBySlot[slot].find((i) => i.date === d)!) : 0), 0)
    )
    .filter((_, i) => (history.dailyLoggingCompleteness[history.windowDates[i]] ?? 0) > 0);
  const avgDailyAmount = dayTotals.length > 0 ? dayTotals.reduce((s, v) => s + v, 0) / dayTotals.length : null;
  const overallGapExists =
    dailyTarget != null && avgDailyAmount != null
      ? avgDailyAmount < dailyTarget * MEAL_RECOMMENDATION_CONFIG.overallGapThresholdFraction
      : problematicSlots.length > 0; // no target available — fall back to meal-level signal alone

  const bestPositiveSlot = goodSlots.sort((a, b) => (adequacyBySlot[b].averageAmount ?? 0) - (adequacyBySlot[a].averageAmount ?? 0))[0];
  const positiveContext: StructuredPositivePattern | undefined = bestPositiveSlot
    ? { slot: bestPositiveSlot, averageAmount: adequacyBySlot[bestPositiveSlot].averageAmount ?? 0 }
    : undefined;

  if (problematicSlots.length === 0) {
    // No meal is individually problematic. A distribution issue only
    // makes sense when the OVERALL total is already adequate but heavily
    // concentrated in one slot, and only for nutrients where that's a
    // meaningful claim at all (see supportsDistributionGap's own doc) —
    // if there's an overall gap too, there's no clean single-meal signal
    // to act on (the "breakfast is fine, don't keep suggesting breakfast
    // protein" guard, applied to the distribution case too).
    if (!track.supportsDistributionGap || overallGapExists || dailyTarget == null) return [];

    const shareOf = (s: MealSlot) => (adequacyBySlot[s].averageAmount ?? 0) / dailyTarget;
    const worstShareSlot = eligibleSlots.map((s) => ({ s, share: shareOf(s) })).sort((a, b) => a.share - b.share)[0];
    const bestShareSlot = eligibleSlots.map((s) => ({ s, share: shareOf(s) })).sort((a, b) => b.share - a.share)[0];
    if (!worstShareSlot || !bestShareSlot) return [];

    const bestRange = distributionRangeFor(nutrient, bestShareSlot.s, goal);
    const overconcentrated = bestShareSlot.share > bestRange.max + MEAL_RECOMMENDATION_CONFIG.distributionOverconcentrationFraction;
    if (!overconcentrated) return []; // genuinely fine — nothing to say

    const adequacy = adequacyBySlot[worstShareSlot.s];
    return [
      {
        category: `${nutrient}_distribution`,
        nutrient,
        mealType: worstShareSlot.s,
        issueType: "distribution_gap",
        evidenceType: classifyEvidenceType(adequacy),
        severity: Math.min(1, bestShareSlot.share - bestRange.max),
        consistencyScore: adequacy.belowRangeShare ?? 0,
        loggingConfidence: overallCompleteness,
        classificationConfidence: 1,
        goalRelevance: goal ? 0.7 : 0.4,
        recencyScore: adequacy.yesterdayBelowRange ? 1 : 0.5,
        actionabilityScore: 0.8,
        noveltyScore: 1,
        supportingMetrics: {
          concentratedSlot: bestShareSlot.s,
          concentratedSharePct: Math.round(bestShareSlot.share * 100),
          targetSlot: worstShareSlot.s,
          targetSharePct: Math.round(worstShareSlot.share * 100),
        },
        suggestedFoodIds: [],
      },
    ];
  }

  // A problematic slot exists — pick the single worst one: highest
  // belowRangeShare, tie-broken by lowest average amount, per the spec's
  // "lowest adequacy, highest recurrence" meal-selection rule.
  const target = problematicSlots.sort((a, b) => {
    const shareDiff = (adequacyBySlot[b].belowRangeShare ?? 0) - (adequacyBySlot[a].belowRangeShare ?? 0);
    if (shareDiff !== 0) return shareDiff;
    return (adequacyBySlot[a].averageAmount ?? 0) - (adequacyBySlot[b].averageAmount ?? 0);
  })[0];
  const adequacy = adequacyBySlot[target];
  const evidenceType = classifyEvidenceType(adequacy);
  const issueType: MealGapIssueType = problematicSlots.length >= 3 && overallGapExists ? "overall_gap" : "meal_gap";

  return [
    {
      category: `${nutrient}_low`,
      nutrient,
      mealType: target,
      issueType,
      evidenceType,
      severity: adequacy.belowRangeShare ?? 0,
      consistencyScore: adequacy.belowRangeShare ?? 0,
      loggingConfidence: Math.min(overallCompleteness, adequacy.sufficientlyCompleteInstances / 7),
      classificationConfidence: 1,
      goalRelevance: goalRelevanceFor(nutrient, goal),
      recencyScore: evidenceType === "yesterday_confirms_pattern" ? 1 : evidenceType === "yesterday_only" ? 0.7 : 0.4,
      actionabilityScore: adequacy.sufficientlyCompleteInstances >= MEAL_RECOMMENDATION_CONFIG.strongEvidenceInstances ? 1 : 0.7,
      noveltyScore: 1,
      positiveContext,
      supportingMetrics: {
        mealSlot: target,
        loggedInstances: adequacy.loggedInstances,
        sufficientlyCompleteInstances: adequacy.sufficientlyCompleteInstances,
        belowRangeInstances: adequacy.belowRangeInstances,
        belowRangeSharePct: Math.round((adequacy.belowRangeShare ?? 0) * 100),
        averageAmount: adequacy.averageAmount != null ? Math.round(adequacy.averageAmount * 10) / 10 : null,
        yesterdayAmount: adequacy.yesterdayAmount != null ? Math.round(adequacy.yesterdayAmount * 10) / 10 : null,
      },
      suggestedFoodIds: [],
    },
  ];
}

function goalRelevanceFor(nutrient: NutrientType, goal?: NutritionGoal): number {
  if (!goal) return 0.4;
  if (nutrient === "protein" && (goal === "gain_muscle" || goal === "body_recomposition")) return 1;
  if ((nutrient === "fiber" || nutrient === "fruit" || nutrient === "vegetable") && (goal === "reduce_body_fat" || goal === "reduce_weight")) return 1;
  if (nutrient === "calories" && goal === "healthy_aging") return 1;
  return 0.6;
}

/** Runs every nutrient track and returns whichever candidates cleared
 * their own evidence bar — callers (Food Balance / Today's Focus, once
 * wired in a later phase) then score+rank across all of them together via
 * scoreRecommendationCandidates, exactly like ranking across categories
 * already works in todays-focus.ts. */
export function generateAllMealRecommendationCandidates(
  history: MealNutritionHistory,
  dailyTargets: Partial<Record<NutrientType, number>>,
  goal?: NutritionGoal
): MealRecommendationCandidate[] {
  return NUTRIENT_TYPES.flatMap((nutrient) =>
    generateMealRecommendationCandidates({ history, nutrient, dailyTarget: dailyTargets[nutrient], goal })
  );
}

// ---- Scoring ---------------------------------------------------------------

/** Deterministic multiplicative score per the spec's suggested model —
 * every factor is 0-1, so the product only stays high when ALL of them
 * are reasonably strong (a candidate that's severe but not actionable, or
 * consistent but based on unreliable logging, is naturally suppressed
 * without needing separate veto rules). */
export function scoreRecommendationCandidates(candidates: MealRecommendationCandidate[]): MealRecommendationCandidate[] {
  return candidates
    .map((c) => ({
      ...c,
      score:
        Math.max(0.05, c.severity) *
        Math.max(0.05, c.consistencyScore) *
        Math.max(0.05, c.loggingConfidence) *
        Math.max(0.05, c.classificationConfidence) *
        Math.max(0.05, c.goalRelevance) *
        Math.max(0.05, c.recencyScore) *
        Math.max(0.05, c.actionabilityScore) *
        Math.max(0.05, c.noveltyScore),
    }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

// ---- Repetition history -----------------------------------------------------

export interface RecommendationHistoryEntry {
  localDate: string;
  category: string;
  mealType?: MealSlot;
}

/** Penalizes (never silently drops) a candidate that repeats the same
 * (category, mealType) pair too recently — strong penalty inside
 * recentHistoryStrongPenaltyDays, moderate inside the wider window,
 * matching the spec's "severe + persistent may override the penalty"
 * instruction by only ever reducing noveltyScore, never zeroing severity/
 * consistency outright. */
export function applyRecommendationHistoryPenalty(
  candidate: MealRecommendationCandidate,
  history: RecommendationHistoryEntry[],
  todayLocalDate: string
): MealRecommendationCandidate {
  const daysAgo = (d: string) => {
    const a = new Date(`${todayLocalDate}T00:00:00Z`).getTime();
    const b = new Date(`${d}T00:00:00Z`).getTime();
    return Math.round((a - b) / (24 * 60 * 60 * 1000));
  };
  const matches = history.filter((h) => h.category === candidate.category && h.mealType === candidate.mealType);
  const mostRecentDaysAgo = matches.length > 0 ? Math.min(...matches.map((h) => daysAgo(h.localDate))) : Infinity;

  let noveltyScore = 1;
  if (mostRecentDaysAgo <= MEAL_RECOMMENDATION_CONFIG.recentHistoryStrongPenaltyDays) noveltyScore = 0.15;
  else if (mostRecentDaysAgo <= MEAL_RECOMMENDATION_CONFIG.recentHistoryModeratePenaltyDays) noveltyScore = 0.5;

  // Severe + persistent issues are allowed to override the penalty per the
  // spec — a strong evidence-backed, confirmed-pattern candidate keeps
  // most of its novelty even on a repeat day rather than being pushed out
  // by a much weaker, unrelated candidate.
  if (candidate.evidenceType === "yesterday_confirms_pattern" && candidate.severity >= 0.7) {
    noveltyScore = Math.max(noveltyScore, 0.6);
  }

  return { ...candidate, noveltyScore };
}

// ---- Personalised food suggestions -----------------------------------------

/** Wraps personalize.ts's existing dietary-filtered/goal-tagged ranking
 * with one more priority signal the spec asks for that didn't exist yet:
 * a food the user already eats at ANOTHER meal outranks an equally-
 * allowed food they've never logged at all. Dietary safety/preference
 * filtering itself is entirely delegated to pickFoodExamples/
 * rankedAllowedFoods (personalize.ts) — this function never re-implements
 * or bypasses that filtering. */
export function selectPersonalisedFoodSuggestions(
  nutrient: NutrientType,
  targetSlot: MealSlot,
  dietaryProfile: DietaryProfile,
  history: MealNutritionHistory,
  goal?: NutritionGoal,
  count = 4
): { text: string; ids: string[] } {
  const category = NUTRIENT_TRACKS[nutrient].foodSuggestionCategory;
  // Fetch a much larger candidate pool than we'll actually show — a food
  // the user already eats at another meal (e.g. eggs at breakfast) may
  // rank well outside the library's own top few dinner-tagged picks, and
  // the "already eats it" boost below can only surface something that
  // was actually fetched.
  const ranked = pickFoodExamples(category, dietaryProfile, { meal: targetSlot, goal, count: 50 });
  const eatenElsewhere = new Set(
    MEAL_SLOTS.filter((s) => s !== targetSlot)
      .flatMap((s) => history.instancesBySlot[s].flatMap((i) => i.wholeFoods))
      .map((f) => f.toLowerCase())
  );

  const boosted = [...ranked].sort((a, b) => {
    const aBoost = eatenElsewhere.has(a.label.toLowerCase()) ? 1 : 0;
    const bBoost = eatenElsewhere.has(b.label.toLowerCase()) ? 1 : 0;
    return bBoost - aBoost;
  });
  const picked = boosted.slice(0, count);

  if (picked.length === 0) {
    const fallback: Record<NutrientType, string> = {
      protein: "a protein food that fits your preferences, such as dal, tofu, eggs, yogurt, paneer, fish, or chicken",
      fiber: "vegetables, beans, dal, whole grains, or a piece of fruit",
      fruit: "a piece of fruit that fits your preferences",
      vegetable: "a vegetable side or salad",
      calories: "a protein source and a carbohydrate such as rice, roti, or potatoes",
    };
    return { text: fallback[nutrient], ids: [] };
  }
  const labels = picked.map((f) => f.label);
  const text = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")}, or ${labels[labels.length - 1]}`;
  return { text, ids: picked.map((f) => f.id) };
}

// ---- Confidence level ------------------------------------------------------

/** Confidence is deliberately about "how sure are we this claim is true,"
 * separate from severity ("how big is the gap") — a severe but
 * thin-evidence candidate still renders with cautious wording. */
export function confidenceLevelFor(candidate: MealRecommendationCandidate): ConfidenceLevel {
  const composite =
    candidate.loggingConfidence * 0.4 +
    candidate.consistencyScore * 0.3 +
    (candidate.evidenceType === "yesterday_confirms_pattern" ? 1 : candidate.evidenceType === "historical_pattern" ? 0.7 : 0.4) * 0.3;
  if (composite >= 0.7) return "high";
  if (composite >= 0.4) return "moderate";
  return "low";
}

// ---- Rendering --------------------------------------------------------------

const MEAL_LABEL: Record<MealSlot, string> = { breakfast: "breakfast", lunch: "lunch", dinner: "dinner", snack: "snacks" };

function positiveClause(candidate: MealRecommendationCandidate): string {
  if (!candidate.positiveContext) return "";
  const label = MEAL_LABEL[candidate.positiveContext.slot];
  const noun = NUTRIENT_TRACKS[candidate.nutrient].noun;
  const verb = candidate.positiveContext.slot === "snack" ? "contain" : "contains";
  return `Your ${label} usually ${verb} enough ${noun}, `;
}

/** Longer, more explanatory rendering for the Food Balance Score card —
 * approved wording variants per evidence type, gated by confidence so a
 * low-confidence candidate never makes a strong meal-level claim (per the
 * spec's confidence-level wording rules). */
export function renderFoodBalanceRecommendation(
  candidate: MealRecommendationCandidate,
  foodSuggestions: { text: string; ids: string[] }
): { title: string; description: string; exampleFoodIds: string[] } {
  const confidence = confidenceLevelFor(candidate);
  const mealLabel = candidate.mealType ? MEAL_LABEL[candidate.mealType] : "one of your meals";
  const noun = NUTRIENT_TRACKS[candidate.nutrient].noun;

  if (confidence === "low") {
    return {
      title: "Keep logging to personalise this further",
      description: "Keep logging your meals so Tistra can identify which meals would benefit most from a change.",
      exampleFoodIds: [],
    };
  }

  if (candidate.issueType === "distribution_gap") {
    const from = candidate.supportingMetrics.concentratedSlot as MealSlot;
    return {
      title: `Spread your ${noun} more evenly`,
      description: `Your overall ${noun} intake is close to target, but most of it has been concentrated at ${MEAL_LABEL[from]}. Adding ${foodSuggestions.text} to ${mealLabel} could spread it more evenly.`,
      exampleFoodIds: foodSuggestions.ids,
    };
  }

  if (candidate.nutrient === "calories") {
    return {
      title: `A more substantial ${mealLabel}`,
      description: `${positiveClause(candidate)}${mealLabel} has regularly been lighter than the rest of your day. Adding ${foodSuggestions.text} could help ${mealLabel} better support your goal.`,
      exampleFoodIds: foodSuggestions.ids,
    };
  }

  const lead = positiveClause(candidate);
  const daysWord =
    candidate.evidenceType === "yesterday_confirms_pattern"
      ? "on most of the last few logged days, including yesterday"
      : candidate.evidenceType === "historical_pattern"
        ? "on most of the last few logged days"
        : "on one of your recent logged days";

  return {
    title: `Add ${noun} to ${mealLabel}`,
    description: `${lead}but ${mealLabel} has been low in ${noun} ${daysWord}. Adding ${foodSuggestions.text} to ${mealLabel} could improve your meal balance.`,
    exampleFoodIds: foodSuggestions.ids,
  };
}

/** Shorter, action-oriented rendering for the Today's Focus WhatsApp
 * message — same underlying candidate as renderFoodBalanceRecommendation,
 * deliberately without the supporting numbers (per the spec: "avoid
 * showing too many exact numbers in the normal user-facing message"). */
export function renderTodayFocusRecommendation(
  candidate: MealRecommendationCandidate,
  foodSuggestions: { text: string; ids: string[] }
): string {
  const confidence = confidenceLevelFor(candidate);
  const mealLabel = candidate.mealType ? MEAL_LABEL[candidate.mealType] : "one of your later meals";
  const noun = NUTRIENT_TRACKS[candidate.nutrient].noun;
  const capitalized = `${mealLabel[0].toUpperCase()}${mealLabel.slice(1)}`;

  if (confidence === "low") {
    return "*Today's focus:* Keep logging your meals so Tistra can identify which meals would benefit most from a change.";
  }

  if (candidate.issueType === "distribution_gap") {
    return `*Today's focus:* Your ${noun} is close to target, but adding ${foodSuggestions.text} to ${mealLabel} would spread it more evenly.`;
  }

  if (candidate.nutrient === "calories") {
    return `*Today's focus:* ${mealLabel[0] === mealLabel[0].toUpperCase() ? mealLabel : capitalized} has been noticeably lighter than your other meals. Try adding ${foodSuggestions.text} so today doesn't become too light.`;
  }

  const message =
    candidate.evidenceType === "yesterday_confirms_pattern"
      ? `${capitalized} has been your lowest-${noun} meal this week, including yesterday. Try adding ${foodSuggestions.text} tonight.`
      : candidate.evidenceType === "yesterday_only"
        ? `${capitalized} was lighter in ${noun} yesterday. Consider adding ${foodSuggestions.text}.`
        : candidate.evidenceType === "single_unusual_day"
          ? "Yesterday's meals were different from your usual pattern. One day does not require correction, so focus on your normal balanced meals today."
          : `Across your recent logs, ${mealLabel} has usually contained less ${noun} than your other meals. Keep ${foodSuggestions.text} in mind for ${mealLabel} today.`;

  return `*Today's focus:* ${message}`;
}

/** Final safety gate — same convention as todays-focus.ts's
 * generateRecommendationCandidates: never let a rendered message out
 * without passing isRecommendationSafe. */
export function isMealRecommendationSafe(text: string): boolean {
  return isRecommendationSafe({ description: text });
}

// ---- Backward-compatible protein-named API (Phase 1's original surface) ---
//
// These wrap the generic engine above so Phase 1's already-reviewed tests
// and any Phase-2 caller written against the protein-specific names keep
// working unchanged — see calculateMealSlotAdequacy/generateMealRecommendationCandidates
// for the actual (nutrient-parameterized) implementation.

export interface MealSlotProteinAdequacy {
  slot: MealSlot;
  loggedInstances: number;
  sufficientlyCompleteInstances: number;
  averageProteinG: number | null;
  belowRangeInstances: number;
  belowRangeShare: number | null;
  yesterdayLogged: boolean;
  yesterdayProteinG: number | null;
  yesterdayBelowRange: boolean | null;
  weightedProteinG: number | null;
  hasPattern: boolean;
  commonFoods: string[];
}

export function calculateMealSlotProteinAdequacy(
  history: MealNutritionHistory,
  slot: MealSlot,
  _dailyLoggingCompleteness: Record<string, number>,
  dailyProteinTargetG?: number,
  goal?: NutritionGoal
): MealSlotProteinAdequacy {
  const a = calculateMealSlotAdequacy(history, slot, "protein", dailyProteinTargetG, goal);
  return {
    slot: a.slot,
    loggedInstances: a.loggedInstances,
    sufficientlyCompleteInstances: a.sufficientlyCompleteInstances,
    averageProteinG: a.averageAmount,
    belowRangeInstances: a.belowRangeInstances,
    belowRangeShare: a.belowRangeShare,
    yesterdayLogged: a.yesterdayLogged,
    yesterdayProteinG: a.yesterdayAmount,
    yesterdayBelowRange: a.yesterdayBelowRange,
    weightedProteinG: a.weightedAmount,
    hasPattern: a.hasPattern,
    commonFoods: a.commonFoods,
  };
}

export interface GenerateMealProteinCandidatesParams {
  history: MealNutritionHistory;
  dailyProteinTargetG?: number;
  goal?: NutritionGoal;
}

export function generateMealProteinRecommendationCandidates(
  params: GenerateMealProteinCandidatesParams
): MealRecommendationCandidate[] {
  return generateMealRecommendationCandidates({
    history: params.history,
    nutrient: "protein",
    dailyTarget: params.dailyProteinTargetG,
    goal: params.goal,
  });
}
