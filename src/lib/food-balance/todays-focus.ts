import type { FoodBalanceMealInput, FoodBalanceUserProfile, MacroTargets, NutritionGoal } from "@nutriai/health-scoring";
import { calculateMacroTargets } from "@nutriai/health-scoring";
import type { DietaryProfile } from "@/lib/dietary-profile";
import { pickFoodExamples } from "./personalize";
import type { FoodSuggestionCategory } from "./food-library";
import { isRecommendationSafe } from "./safety";

/**
 * "Today's Focus" — a short, personalized nutritional suggestion appended
 * to the existing breakfast reminder (see
 * src/app/api/cron/send-meal-reminders/route.ts). This module is the
 * deterministic recommendation engine behind it: every nutrient trend,
 * eligibility check, ranking, and repetition rule here is plain arithmetic
 * — no LLM involved anywhere in this file. That's a deliberate safety
 * choice (see the feature spec this was built from): calorie/compensation
 * advice, dietary-restriction filtering, and "don't repeat yesterday's
 * message" are exactly the kinds of decisions that must never be left to a
 * model's judgment. Copy is picked from hand-authored templates (mirroring
 * src/lib/food-balance/generate.ts's approach) and validated by
 * isRecommendationSafe() before ever being sent.
 *
 * This deliberately extends the existing Food Balance Score building
 * blocks (generate.ts / personalize.ts / food-library.ts) rather than
 * duplicating them — see this feature's own implementation notes for why
 * the *full* calculateFoodBalanceScore pipeline is NOT used here: it would
 * pull noticeably more code into the meal-reminders cron route's Worker
 * bundle, which has already hit Cloudflare Pages' 25 MiB limit once this
 * session (see that route's own comments on runWeeklyWinsShareCards for
 * the identical tradeoff already made there).
 */

// ---- Shared types ----------------------------------------------------

export type TodaysFocusCategory =
  | "protein_low"
  | "calories_low"
  | "calories_high"
  | "low_fiber"
  | "low_fruit_veg"
  | "low_diversity"
  | "protein_late_day"
  | "meals_too_light"
  | "ultra_processed"
  | "positive_reinforcement"
  | "insufficient_data";

export type ConfidenceLevel = "high" | "moderate" | "low";

export interface TodaysFocusCandidate {
  category: TodaysFocusCategory;
  /** Base priority tier per the feature spec's ranking (1 = most
   * important). Tier 1 ("potentially important health/safety issue") is
   * never emitted here — this app has no medical-signal detector, and
   * inventing one would be well outside "general wellness coaching." */
  tier: 2 | 3 | 4 | 5 | 6 | 7;
  confidence: ConfidenceLevel;
  /** How many of the analysis window's reliable days showed this same
   * signal — used for both tie-breaking ("has persisted for more days")
   * and the repetition rule ("important AND persistent" issues may repeat
   * on consecutive days). */
  persistenceDays: number;
  /** Identifies which hand-authored copy template produced this
   * candidate's message — tracked (not just the category) so repetition
   * control can rotate wording even when the same category recurs. */
  messageVariant: string;
  message: string;
  suggestedFoodIds: string[];
  supportingMetrics: Record<string, number | string | boolean | null>;
}

export interface RecentFocusHistoryEntry {
  localDate: string;
  category: TodaysFocusCategory;
  feedback?: "helpful" | "not_relevant" | "change_focus" | null;
}

// ---- Day-bucketed meal aggregation -------------------------------------

/** Buckets meals by their local calendar date in the contact's own
 * timezone — every trend window below is defined in terms of these
 * buckets, never raw UTC days, so "yesterday" means the same thing to the
 * recommendation engine as it does to the person reading the message. */
export function bucketMealsByLocalDate(
  meals: FoodBalanceMealInput[],
  timezone: string
): Map<string, FoodBalanceMealInput[]> {
  const buckets = new Map<string, FoodBalanceMealInput[]>();
  for (const meal of meals) {
    if (meal.isDeleted) continue;
    // en-CA locale is the simplest built-in way to get a stable YYYY-MM-DD
    // string out of Intl's timezone conversion (Edge-safe, no date lib).
    const key = new Date(meal.loggedAt).toLocaleDateString("en-CA", { timeZone: timezone });
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(meal);
  }
  return buckets;
}

/** The last `days` calendar dates strictly before `today` (today's own
 * breakfast hasn't happened yet when this runs each morning, so "today"
 * itself is never part of a trend window) — oldest first. */
export function recentLocalDates(todayLocalDate: string, days: number): string[] {
  const [y, m, d] = todayLocalDate.split("-").map(Number);
  const dates: string[] = [];
  for (let i = days; i >= 1; i--) {
    const dt = new Date(Date.UTC(y, m - 1, d - i));
    dates.push(dt.toISOString().slice(0, 10));
  }
  return dates;
}

// ---- Logging completeness ----------------------------------------------

export interface LoggingCompleteness {
  windowDays: number;
  distinctLoggingDays: number;
  totalMealsLogged: number;
  /** Derived from this person's own history (median meals on a day they
   * logged anything at all), not a hardcoded assumption — someone who
   * normally logs once a day isn't penalized for "incomplete" logging
   * relative to someone who normally logs three times. Defaults to 2 when
   * there's not enough history yet to derive one. */
  expectedMealsPerDay: number;
  /** Days within the window whose meal count is close enough to this
   * person's own normal frequency to trust for calorie/protein-adequacy
   * conclusions — see reliableDaysOnly()'s doc for why this exists. */
  reliableDayCount: number;
  hasBreakfastRepresented: boolean;
  hasLunchRepresented: boolean;
  hasDinnerRepresented: boolean;
  /** 0-1 composite — see calculateLoggingCompleteness's body for the
   * exact weighting. Gates whether ANY calorie/nutrient-adequacy claim is
   * allowed at all (see generateRecommendationCandidates). */
  score: number;
  level: ConfidenceLevel;
}

export function calculateLoggingCompleteness(
  mealsByDate: Map<string, FoodBalanceMealInput[]>,
  windowDates: string[]
): LoggingCompleteness {
  const windowDays = windowDates.length;
  const loggedDayCounts = windowDates.map((d) => mealsByDate.get(d)?.length ?? 0);
  const distinctLoggingDays = loggedDayCounts.filter((c) => c > 0).length;
  const totalMealsLogged = loggedDayCounts.reduce((s, c) => s + c, 0);

  const activeDayCounts = loggedDayCounts.filter((c) => c > 0);
  const expectedMealsPerDay =
    activeDayCounts.length > 0 ? median(activeDayCounts) : 2;

  const reliableDayCount = windowDates.filter((d) => {
    const count = mealsByDate.get(d)?.length ?? 0;
    return count >= Math.max(1, expectedMealsPerDay - 1);
  }).length;

  const allMeals = windowDates.flatMap((d) => mealsByDate.get(d) ?? []);
  const hasBreakfastRepresented = allMeals.some((m) => m.mealType === "breakfast");
  const hasLunchRepresented = allMeals.some((m) => m.mealType === "lunch");
  const hasDinnerRepresented = allMeals.some((m) => m.mealType === "dinner");

  // Composite: how much of the window has any data (40%), how much of it
  // is "reliable" by this person's own normal frequency (40%), and whether
  // all three main meals show up at least once anywhere in the window
  // (20%, a cheap proxy for "we've seen enough variety to say something
  // useful," not itself a per-day requirement).
  const coverageScore = distinctLoggingDays / windowDays;
  const reliabilityScore = reliableDayCount / windowDays;
  const mealVarietyScore = [hasBreakfastRepresented, hasLunchRepresented, hasDinnerRepresented].filter(Boolean).length / 3;
  const score = coverageScore * 0.4 + reliabilityScore * 0.4 + mealVarietyScore * 0.2;

  const level: ConfidenceLevel = score >= 0.7 ? "high" : score >= 0.4 ? "moderate" : "low";

  return {
    windowDays,
    distinctLoggingDays,
    totalMealsLogged,
    expectedMealsPerDay,
    reliableDayCount,
    hasBreakfastRepresented,
    hasLunchRepresented,
    hasDinnerRepresented,
    score,
    level,
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// ---- Nutrition trend summary --------------------------------------------

export interface WindowStats {
  days: number;
  reliableDays: number;
  totalMeals: number;
  /** Averages are per RELIABLE logged day only (see LoggingCompleteness) —
   * a day with only one meal logged never drags these down, per the
   * spec's "don't infer low calories from 1-2 meals" rule. null when there
   * are no reliable days in the window at all. */
  avgCaloriesPerDay: number | null;
  avgProteinGPerDay: number | null;
  avgFiberGPerDay: number | null;
  avgFruitVegServingsPerDay: number | null;
  /** 0-1 share of (non-deleted) meals classified ultra-processed, over
   * every logged meal in the window regardless of reliableDay status —
   * processing level is about individual meals, not daily totals, so the
   * completeness gate that protects calorie/protein claims doesn't apply
   * here the same way. */
  ultraProcessedShare: number;
  /** Share of the window's total protein that came from dinner/snack
   * meals rather than breakfast/lunch — used for "protein concentrated
   * too late in the day" (muscle-gain goal). */
  lateProteinShare: number | null;
  distinctWholeFoods: Set<string>;
}

function reliableDaysOnly(
  windowDates: string[],
  mealsByDate: Map<string, FoodBalanceMealInput[]>,
  expectedMealsPerDay: number
): string[] {
  return windowDates.filter((d) => (mealsByDate.get(d)?.length ?? 0) >= Math.max(1, expectedMealsPerDay - 1));
}

function midOf(meal: FoodBalanceMealInput, field: "calories" | "proteinG" | "fibreG"): number {
  return meal[field] ?? 0;
}

function computeWindowStats(
  windowDates: string[],
  mealsByDate: Map<string, FoodBalanceMealInput[]>,
  expectedMealsPerDay: number
): WindowStats {
  const reliableDates = reliableDaysOnly(windowDates, mealsByDate, expectedMealsPerDay);
  const allMeals = windowDates.flatMap((d) => mealsByDate.get(d) ?? []);
  const reliableMeals = reliableDates.flatMap((d) => mealsByDate.get(d) ?? []);

  const avgPerReliableDay = (field: "calories" | "proteinG" | "fibreG"): number | null => {
    if (reliableDates.length === 0) return null;
    const total = reliableMeals.reduce((s, m) => s + midOf(m, field), 0);
    return total / reliableDates.length;
  };
  const avgFruitVeg = (): number | null => {
    if (reliableDates.length === 0) return null;
    const total = reliableMeals.reduce((s, m) => s + (m.fruitServings ?? 0) + (m.vegetableServings ?? 0), 0);
    return total / reliableDates.length;
  };

  const processedCount = allMeals.filter((m) => m.processingLevel === "ultra_processed").length;
  const ultraProcessedShare = allMeals.length > 0 ? processedCount / allMeals.length : 0;

  const proteinBySlot = { early: 0, late: 0 };
  for (const m of allMeals) {
    const p = m.proteinG ?? 0;
    if (m.mealType === "breakfast" || m.mealType === "lunch") proteinBySlot.early += p;
    else proteinBySlot.late += p;
  }
  const totalProtein = proteinBySlot.early + proteinBySlot.late;
  const lateProteinShare = totalProtein > 0 ? proteinBySlot.late / totalProtein : null;

  const distinctWholeFoods = new Set<string>();
  for (const m of allMeals) for (const f of m.wholeFoods ?? []) distinctWholeFoods.add(f);

  return {
    days: windowDates.length,
    reliableDays: reliableDates.length,
    totalMeals: allMeals.length,
    avgCaloriesPerDay: avgPerReliableDay("calories"),
    avgProteinGPerDay: avgPerReliableDay("proteinG"),
    avgFiberGPerDay: avgPerReliableDay("fibreG"),
    avgFruitVegServingsPerDay: avgFruitVeg(),
    ultraProcessedShare,
    lateProteinShare,
    distinctWholeFoods,
  };
}

export interface NutritionTrendSummary {
  yesterday: WindowStats;
  last3d: WindowStats;
  last7d: WindowStats;
  /** Very light meals at dinner specifically, regardless of overall
   * calorie trend — the Healthy Aging "meals shouldn't become too light"
   * signal is about dinner's own share of the day, not an absolute
   * threshold. */
  dinnerShareOfDailyCalories: number | null;
}

/** Builds the 1/3/7-day trend windows a recommendation is evaluated
 * against — "prefer multi-day patterns when they provide stronger
 * evidence" (per the spec) is implemented by generateRecommendationCandidates
 * consulting last7d/last3d before ever leaning on a single yesterday value. */
export function buildNutritionTrendSummary(
  meals: FoodBalanceMealInput[],
  timezone: string,
  todayLocalDate: string
): NutritionTrendSummary {
  const mealsByDate = bucketMealsByLocalDate(meals, timezone);
  const dates7 = recentLocalDates(todayLocalDate, 7);
  const dates3 = dates7.slice(-3);
  const dates1 = dates7.slice(-1);

  const completeness7 = calculateLoggingCompleteness(mealsByDate, dates7);
  const expected = completeness7.expectedMealsPerDay;

  const last7d = computeWindowStats(dates7, mealsByDate, expected);
  const last3d = computeWindowStats(dates3, mealsByDate, expected);
  const yesterday = computeWindowStats(dates1, mealsByDate, expected);

  const yesterdayMeals = mealsByDate.get(dates1[0]) ?? [];
  const dinnerCalories = yesterdayMeals.filter((m) => m.mealType === "dinner").reduce((s, m) => s + (m.calories ?? 0), 0);
  const totalCalories = yesterdayMeals.reduce((s, m) => s + (m.calories ?? 0), 0);
  const dinnerShareOfDailyCalories = totalCalories > 0 ? dinnerCalories / totalCalories : null;

  return { yesterday, last3d, last7d, dinnerShareOfDailyCalories };
}

// ---- Candidate generation ------------------------------------------------

const CATEGORY_TIER: Record<Exclude<TodaysFocusCategory, "insufficient_data">, 2 | 3 | 4 | 5 | 6 | 7> = {
  protein_low: 3,
  calories_low: 3,
  calories_high: 3,
  low_fiber: 4,
  low_fruit_veg: 4,
  low_diversity: 4,
  protein_late_day: 5,
  meals_too_light: 5,
  ultra_processed: 6,
  positive_reinforcement: 7,
};

/** Categories this goal cares about most — bumps a matching candidate up
 * to tier 2 ("goal-related nutritional gap"), per the spec's ranking
 * rules and the goal-specific prioritization in the "Goal-aware behaviour"
 * section (muscle gain -> protein+distribution+calories+light-meals;
 * fat/weight loss -> consistency+fiber+fruit-veg+filling meals+protein+
 * processed food; healthy aging -> calories+protein+regularity+diversity+
 * fruit/veg/fiber). */
const GOAL_PRIORITY_CATEGORIES: Partial<Record<NutritionGoal, TodaysFocusCategory[]>> = {
  gain_muscle: ["protein_low", "protein_late_day", "calories_low", "meals_too_light"],
  body_recomposition: ["protein_low", "protein_late_day", "calories_low"],
  reduce_body_fat: ["low_fiber", "low_fruit_veg", "ultra_processed", "protein_low", "calories_high"],
  reduce_weight: ["low_fiber", "low_fruit_veg", "ultra_processed", "protein_low", "calories_high"],
  healthy_aging: ["calories_low", "protein_low", "meals_too_light", "low_diversity", "low_fruit_veg", "low_fiber"],
  maintain_weight: [],
  improve_nutrition: [],
};

function tierFor(category: TodaysFocusCategory, goal?: NutritionGoal): 2 | 3 | 4 | 5 | 6 | 7 {
  if (category === "insufficient_data") return 2; // handled separately, never actually ranked against others
  if (goal && GOAL_PRIORITY_CATEGORIES[goal]?.includes(category)) return 2;
  return CATEGORY_TIER[category];
}

function formatExamples(labels: string[]): string {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")}, or ${labels[labels.length - 1]}`;
}

function pickExampleFoods(
  category: FoodSuggestionCategory,
  profile: DietaryProfile,
  opts: { meal?: "breakfast" | "lunch" | "dinner" | "snack"; goal?: string }
): { text: string; ids: string[] } {
  const picked = pickFoodExamples(category, profile, { ...opts, count: 4 });
  if (picked.length > 0) return { text: formatExamples(picked.map((f) => f.label)), ids: picked.map((f) => f.id) };
  return { text: "a protein food that fits your preferences, such as dal, tofu, eggs, yogurt, paneer, fish, or chicken", ids: [] };
}

/** Days (out of the last 7) a signal held, used for persistenceDays.
 * Recomputed per-signal rather than reusing a single "days logged" count,
 * since e.g. low fiber and low protein don't necessarily persist on the
 * same days. */
function countPersistentDays(
  windowDates: string[],
  mealsByDate: Map<string, FoodBalanceMealInput[]>,
  predicate: (dayMeals: FoodBalanceMealInput[]) => boolean
): number {
  return windowDates.filter((d) => {
    const dayMeals = mealsByDate.get(d) ?? [];
    return dayMeals.length > 0 && predicate(dayMeals);
  }).length;
}

export interface GenerateCandidatesParams {
  meals: FoodBalanceMealInput[];
  timezone: string;
  todayLocalDate: string;
  dietaryProfile: DietaryProfile;
  profile?: FoodBalanceUserProfile;
  goal?: NutritionGoal;
}

/**
 * Produces every recommendation category that has enough evidence behind
 * it this morning — ranking/repetition/selection happen in later stages
 * (rankRecommendationCandidates, applyRepetitionAndFeedbackRules). Adding a
 * new category means adding one more `if` block here and one entry in
 * CATEGORY_TIER — nothing else in the pipeline needs to change, per the
 * spec's "structure so new categories can be added without rewriting the
 * whole system."
 */
export function generateRecommendationCandidates(params: GenerateCandidatesParams): TodaysFocusCandidate[] {
  const { meals, timezone, todayLocalDate, dietaryProfile, profile, goal } = params;
  const mealsByDate = bucketMealsByLocalDate(meals, timezone);
  const dates7 = recentLocalDates(todayLocalDate, 7);
  const completeness = calculateLoggingCompleteness(mealsByDate, dates7);

  // Insufficient data always wins outright — never let a calorie/nutrient
  // claim through on thin evidence, no matter how the rest of ranking
  // would otherwise sort it.
  if (completeness.level === "low") {
    return [
      {
        category: "insufficient_data",
        tier: 2,
        confidence: "low",
        persistenceDays: 0,
        messageVariant: "insufficient_data_default",
        message: "Keep logging your meals today so Tistra can identify useful patterns and offer more personalised guidance.",
        suggestedFoodIds: [],
        supportingMetrics: { distinctLoggingDays: completeness.distinctLoggingDays, windowDays: completeness.windowDays },
      },
    ];
  }

  const trend = buildNutritionTrendSummary(meals, timezone, todayLocalDate);
  const macroTargets: MacroTargets | undefined = profile ? calculateMacroTargets(profile) : undefined;
  const candidates: TodaysFocusCandidate[] = [];
  const confidenceFor = (persistenceDays: number, windowDays: number): ConfidenceLevel => {
    const ratio = windowDays > 0 ? persistenceDays / windowDays : 0;
    if (completeness.level === "high" && ratio >= 0.6) return "high";
    if (ratio >= 0.35) return "moderate";
    return "low";
  };

  // ---- Protein low --------------------------------------------------
  if (macroTargets && trend.last7d.avgProteinGPerDay != null) {
    const proteinDays = countPersistentDays(dates7, mealsByDate, (dayMeals) => {
      const total = dayMeals.reduce((s, m) => s + (m.proteinG ?? 0), 0);
      return total < macroTargets.protein.target * 0.8;
    });
    const belowOverall = trend.last7d.avgProteinGPerDay < macroTargets.protein.target * 0.85;
    if (belowOverall && proteinDays >= 2) {
      const confidence = confidenceFor(proteinDays, trend.last7d.reliableDays);
      const { text, ids } = pickExampleFoods("protein", dietaryProfile, { meal: "breakfast", goal });
      candidates.push({
        category: "protein_low",
        tier: tierFor("protein_low", goal),
        confidence,
        persistenceDays: proteinDays,
        messageVariant: confidence === "high" ? "protein_low_direct" : "protein_low_qualified",
        message:
          confidence === "high"
            ? `Protein has been below your target on several recent days. Try adding ${text} to breakfast or lunch today.`
            : `Your recent logs suggest protein may have been a little low. Adding ${text} to breakfast or lunch could make today easier to balance.`,
        suggestedFoodIds: ids,
        supportingMetrics: {
          avgProteinGPerDay: round1(trend.last7d.avgProteinGPerDay),
          targetProteinG: round1(macroTargets.protein.target),
          persistentDaysOf7: proteinDays,
        },
      });
    }
  }

  // ---- Protein concentrated late in the day --------------------------
  if (trend.last7d.lateProteinShare != null && trend.last7d.lateProteinShare >= 0.65 && trend.last7d.totalMeals >= 4) {
    const { text, ids } = pickExampleFoods("protein", dietaryProfile, { meal: "breakfast", goal });
    candidates.push({
      category: "protein_late_day",
      tier: tierFor("protein_late_day", goal),
      confidence: completeness.level === "high" ? "high" : "moderate",
      persistenceDays: Math.round(trend.last7d.lateProteinShare * trend.last7d.reliableDays),
      messageVariant: "protein_late_day_default",
      message: `Most of your protein has been coming later in the day. Adding ${text} to breakfast may help spread it more evenly.`,
      suggestedFoodIds: ids,
      supportingMetrics: { lateProteinShare: round1(trend.last7d.lateProteinShare * 100) },
    });
  }

  // ---- Calories low/high (goal-appropriate range) --------------------
  if (macroTargets && trend.last7d.avgCaloriesPerDay != null) {
    const target = macroTargets.calories.target;
    const lowDays = countPersistentDays(dates7, mealsByDate, (dayMeals) => {
      const total = dayMeals.reduce((s, m) => s + (m.calories ?? 0), 0);
      return total < target * 0.8;
    });
    const highDays = countPersistentDays(dates7, mealsByDate, (dayMeals) => {
      const total = dayMeals.reduce((s, m) => s + (m.calories ?? 0), 0);
      return total > target * 1.25;
    });

    if (trend.last7d.avgCaloriesPerDay < target * 0.85 && lowDays >= 2) {
      const confidence = confidenceFor(lowDays, trend.last7d.reliableDays);
      candidates.push({
        category: "calories_low",
        tier: tierFor("calories_low", goal),
        confidence,
        persistenceDays: lowDays,
        messageVariant: confidence === "high" ? "calories_low_direct" : "calories_low_qualified",
        message:
          confidence === "high"
            ? "Your recent meals appear lighter than what may support your current goal. A more substantial breakfast or lunch with protein, carbohydrates, and a healthy fat could help."
            : "Your recent logs suggest meals may be running a little light. A slightly more filling breakfast or lunch today could help.",
        suggestedFoodIds: [],
        supportingMetrics: { avgCaloriesPerDay: round1(trend.last7d.avgCaloriesPerDay), targetCalories: round1(target), persistentDaysOf7: lowDays },
      });
    } else if (
      // High-calorie handling is deliberately about a SINGLE unusual day
      // relative to the person's own recent average, not a persistent
      // trend against a target — per the spec's explicit "one day does
      // not require correction" example. A persistent multi-day high
      // trend (highDays >= 3) still only ever gets this same
      // non-restrictive framing, never compensation language.
      trend.yesterday.avgCaloriesPerDay != null &&
      trend.last3d.avgCaloriesPerDay != null &&
      trend.yesterday.avgCaloriesPerDay > trend.last3d.avgCaloriesPerDay * 1.3
    ) {
      candidates.push({
        category: "calories_high",
        tier: tierFor("calories_high", goal),
        confidence: "moderate",
        persistenceDays: highDays,
        messageVariant: "calories_high_single_day",
        message: "Yesterday was a little higher than your recent average, but one day does not require correction. Focus on your normal meals today.",
        suggestedFoodIds: [],
        supportingMetrics: { yesterdayCalories: round1(trend.yesterday.avgCaloriesPerDay), recentAverage: round1(trend.last3d.avgCaloriesPerDay) },
      });
    }
  }

  // ---- Low fiber ------------------------------------------------------
  if (macroTargets && trend.last7d.avgFiberGPerDay != null) {
    const fiberDays = countPersistentDays(dates7, mealsByDate, (dayMeals) => {
      const total = dayMeals.reduce((s, m) => s + (m.fibreG ?? 0), 0);
      return total < macroTargets.fiber.target * 0.75;
    });
    if (trend.last7d.avgFiberGPerDay < macroTargets.fiber.target * 0.8 && fiberDays >= 2) {
      const confidence = confidenceFor(fiberDays, trend.last7d.reliableDays);
      const { text, ids } = pickExampleFoods("fiber", dietaryProfile, { goal });
      candidates.push({
        category: "low_fiber",
        tier: tierFor("low_fiber", goal),
        confidence,
        persistenceDays: fiberDays,
        messageVariant: confidence === "high" ? "low_fiber_direct" : "low_fiber_qualified",
        message: `Your recent logs suggest that fiber may have been a little low. Adding one fruit, an extra serving of vegetables, or ${text} today could help.`,
        suggestedFoodIds: ids,
        supportingMetrics: { avgFiberGPerDay: round1(trend.last7d.avgFiberGPerDay), targetFiberG: round1(macroTargets.fiber.target), persistentDaysOf7: fiberDays },
      });
    }
  }

  // ---- Low fruit/veg ---------------------------------------------------
  if (trend.last7d.avgFruitVegServingsPerDay != null && trend.last7d.avgFruitVegServingsPerDay < 1.5) {
    const days = countPersistentDays(dates7, mealsByDate, (dayMeals) => {
      const total = dayMeals.reduce((s, m) => s + (m.fruitServings ?? 0) + (m.vegetableServings ?? 0), 0);
      return total < 1.5;
    });
    if (days >= 2) {
      const { text, ids } = pickExampleFoods("fruit_veg", dietaryProfile, { goal });
      candidates.push({
        category: "low_fruit_veg",
        tier: tierFor("low_fruit_veg", goal),
        confidence: confidenceFor(days, trend.last7d.reliableDays),
        persistenceDays: days,
        messageVariant: "low_fruit_veg_default",
        message: `Adding ${text} earlier in the day may help your meals feel more filling and balanced.`,
        suggestedFoodIds: ids,
        supportingMetrics: { avgFruitVegServingsPerDay: round1(trend.last7d.avgFruitVegServingsPerDay), persistentDaysOf7: days },
      });
    }
  }

  // ---- Limited dietary diversity ---------------------------------------
  if (trend.last7d.reliableDays >= 4 && trend.last7d.distinctWholeFoods.size > 0 && trend.last7d.distinctWholeFoods.size <= 5) {
    candidates.push({
      category: "low_diversity",
      tier: tierFor("low_diversity", goal),
      confidence: "moderate",
      persistenceDays: trend.last7d.reliableDays,
      messageVariant: "low_diversity_default",
      message: "Your recent meals have repeated a similar small set of foods. Trying one new food today could add helpful variety.",
      suggestedFoodIds: [],
      supportingMetrics: { distinctWholeFoods: trend.last7d.distinctWholeFoods.size },
    });
  }

  // ---- Ultra-processed reliance -----------------------------------------
  if (trend.last7d.ultraProcessedShare >= 0.35 && trend.last7d.totalMeals >= 4) {
    const { text, ids } = pickExampleFoods("snack_swap", dietaryProfile, { meal: "snack" });
    candidates.push({
      category: "ultra_processed",
      tier: tierFor("ultra_processed", goal),
      confidence: "moderate",
      persistenceDays: Math.round(trend.last7d.ultraProcessedShare * trend.last7d.reliableDays),
      messageVariant: "ultra_processed_default",
      message: `A portion of recent meals were estimated as more processed. Swapping one packaged snack for ${text} today could help.`,
      suggestedFoodIds: ids,
      supportingMetrics: { ultraProcessedShare: round1(trend.last7d.ultraProcessedShare * 100) },
    });
  }

  // ---- Meals consistently too light for the goal (esp. healthy aging) --
  if (
    trend.dinnerShareOfDailyCalories != null &&
    trend.dinnerShareOfDailyCalories < 0.15 &&
    trend.last7d.reliableDays >= 3 &&
    trend.last3d.avgCaloriesPerDay != null &&
    macroTargets &&
    trend.last3d.avgCaloriesPerDay < macroTargets.calories.target * 0.9
  ) {
    const { text, ids } = pickExampleFoods("protein", dietaryProfile, { meal: "dinner", goal });
    candidates.push({
      category: "meals_too_light",
      tier: tierFor("meals_too_light", goal),
      confidence: "moderate",
      persistenceDays: trend.last7d.reliableDays,
      messageVariant: "meals_too_light_default",
      message:
        goal === "healthy_aging"
          ? `Your recent meals appear slightly light. For healthy aging, regular meals with enough protein and energy matter. Consider adding ${text} today.`
          : `Dinner has been noticeably lighter than your other meals. Try adding ${text} so the day doesn't become too light.`,
      suggestedFoodIds: ids,
      supportingMetrics: { dinnerShareOfDailyCalories: round1(trend.dinnerShareOfDailyCalories * 100) },
    });
  }

  // ---- Positive reinforcement (only when nothing else is eligible) ------
  // completeness.level is already known to be "high" or "moderate" here —
  // the "low" case returned early above.
  if (candidates.length === 0 && trend.last7d.reliableDays >= 3) {
    candidates.push({
      category: "positive_reinforcement",
      tier: 7,
      confidence: "moderate",
      persistenceDays: trend.last7d.reliableDays,
      messageVariant: "positive_default",
      message: "Your recent meals have been fairly balanced. Keep aiming for a protein source and some fruit or vegetables in your main meals today.",
      suggestedFoodIds: [],
      supportingMetrics: {},
    });
  }

  return candidates.filter((c) => isRecommendationSafe({ description: c.message }));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---- Ranking --------------------------------------------------------------

/** Sorts eligible candidates highest-priority-first: lower tier number
 * wins; within a tier, more persistent days wins, then higher confidence,
 * then (implicitly, by generation order) goal relevance, since
 * goal-relevant categories were already promoted to tier 2 above. */
export function rankRecommendationCandidates(candidates: TodaysFocusCandidate[]): TodaysFocusCandidate[] {
  const confidenceRank: Record<ConfidenceLevel, number> = { high: 2, moderate: 1, low: 0 };
  return [...candidates].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.persistenceDays !== b.persistenceDays) return b.persistenceDays - a.persistenceDays;
    return confidenceRank[b.confidence] - confidenceRank[a.confidence];
  });
}

// ---- Repetition and feedback rules -----------------------------------------

/**
 * Filters/reorders ranked candidates against recent delivery history —
 * "don't repeat yesterday's category unless it's important and
 * persistent," "deprioritize a category the person marked not relevant."
 * Never mutates history itself; that's the caller's job once a final pick
 * is made (see recordRecommendationDelivery).
 */
export function applyRepetitionAndFeedbackRules(
  candidates: TodaysFocusCandidate[],
  recentHistory: RecentFocusHistoryEntry[],
  yesterdayLocalDate: string
): TodaysFocusCandidate[] {
  const shownYesterday = new Set(recentHistory.filter((h) => h.localDate === yesterdayLocalDate).map((h) => h.category));
  const markedNotRelevant = new Set(recentHistory.filter((h) => h.feedback === "not_relevant").map((h) => h.category));

  const allowedToRepeat = (c: TodaysFocusCandidate) => c.confidence === "high" && c.persistenceDays >= 3;

  const filtered = candidates.filter((c) => {
    if (c.category === "insufficient_data" || c.category === "positive_reinforcement") return true;
    if (shownYesterday.has(c.category) && !allowedToRepeat(c)) return false;
    return true;
  });

  // Deprioritize (don't remove) categories with recent negative feedback —
  // pushed to the back rather than dropped, since it may still be the only
  // eligible signal some mornings.
  const sorted = [...filtered].sort((a, b) => {
    const aDown = markedNotRelevant.has(a.category) ? 1 : 0;
    const bDown = markedNotRelevant.has(b.category) ? 1 : 0;
    return aDown - bDown;
  });

  if (sorted.length > 0) return sorted;

  // Every eligible candidate got filtered out by the repetition rule —
  // fall back to a neutral logging reminder rather than sending nothing.
  return [
    {
      category: "insufficient_data",
      tier: 2,
      confidence: "low",
      persistenceDays: 0,
      messageVariant: "insufficient_data_repetition_fallback",
      message: "Keep logging your meals today so Tistra can identify useful patterns and offer more personalised guidance.",
      suggestedFoodIds: [],
      supportingMetrics: {},
    },
  ];
}

// ---- Message rendering -----------------------------------------------------

export type MessageStyle = "concise" | "explanatory";

/** Renders the final "Today's focus" line. Explanatory style adds one
 * short clause of "why" (from supportingMetrics/category context) where
 * concise style doesn't — both variants are still hand-authored-template
 * output, never free LLM text. */
export function renderTodayFocusMessage(candidate: TodaysFocusCandidate, style: MessageStyle = "concise"): string {
  if (style === "concise") return `*Today's focus:* ${candidate.message}`;

  const why: Partial<Record<TodaysFocusCategory, string>> = {
    protein_low: " Protein helps meals feel more filling and supports your goal.",
    calories_low: " Consistent energy intake supports steady progress toward your goal.",
    low_fiber: " Fiber supports digestion and helps meals feel more satisfying.",
    low_fruit_veg: " Fruit and vegetables add fiber and variety without changing the rest of your plate.",
    protein_late_day: " Spreading protein across the day can help it be used more effectively.",
    ultra_processed: " Small, minimally processed swaps add up without requiring a whole new routine.",
    meals_too_light: " Regular, adequately sized meals support steady energy throughout the day.",
  };
  return `*Today's focus:* ${candidate.message}${why[candidate.category] ?? ""}`;
}
