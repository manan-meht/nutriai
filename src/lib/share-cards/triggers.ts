import type { EarnedShareCard, ShareCardConcept, ShareCardFormat } from "./types";

// Trigger evaluation for the share-card concept library (see concepts.ts).
// Deliberately takes a minimal, product-agnostic input shape (plain meal
// totals + a handful of Food Balance Score component scores) rather than
// importing @nutriai/health-scoring's full FoodBalanceScoreResult, so this
// module works the same for adults/gym/mobile callers that each map their
// own DB rows slightly differently (same "duplicate a small local shape
// rather than couple to one caller's types" convention as
// src/lib/food-balance/adapter.ts).
//
// Several concepts (see concepts.ts's own TODO comments) need data this
// library doesn't have a source for yet — per-meal food-group tags,
// preparation-source per meal, a correction-event feed, or 3+ weeks of
// history. Those evaluate to `{ earned: false }` until the caller supplies
// the relevant optional input; nothing throws or crashes for them.

export interface ShareCardMealInput {
  id?: string;
  loggedAt: string;
  mealType?: string;
  totalProteinMin: number;
  totalProteinMax: number;
  totalFiberMin: number;
  totalFiberMax: number;
  /** The following are optional, additive fields used only for picking
   * relevant background photos for an earned card (see
   * selectSharePhotos below) — every existing trigger evaluation above
   * ignores them entirely, so passing them is never required for a
   * concept to earn. */
  imageUrl?: string;
  homeCookedLikelihood?: "high" | "medium" | "low" | "unknown";
  hasVegetableOrFruit?: boolean;
}

/** Subset of FoodBalanceComponentScores actually used for triggers — all
 * 0-100 or null/undefined when not computed for this profile/goal. */
export interface ShareCardComponentScores {
  macroAndFibreBalance?: number | null;
  fruitAndVegetableIntake?: number | null;
  homePreparedMealShare?: number | null;
  minimallyProcessedFoodBalance?: number | null;
  proteinAdequacy?: number | null;
  fibreAdequacy?: number | null;
  goalAlignmentScore?: number | null;
}

/** One prior week's snapshot, for concepts that need 3+ weeks of history
 * (Best Week So Far, Protein Loyalist, Balanced Plate Enthusiast). Weekly
 * digests aren't generated/stored yet (see this feature's implementation
 * notes) — omit this until that exists; those concepts simply won't earn. */
export interface ShareCardWeekSnapshot {
  weekStartIso: string;
  distinctLoggingDays: number;
  proteinAdequacy?: number | null;
  macroAndFibreBalance?: number | null;
  overallScore?: number | null;
}

export interface ShareCardEvaluationInput {
  /** Meals within roughly the trailing 14 days is enough for every
   * current trigger (daily triggers filter to "today", weekly triggers
   * filter to the trailing 7/14 days). */
  meals: ShareCardMealInput[];
  now?: Date;
  dailyProteinTargetG?: number;
  dailyFiberTargetG?: number;
  minMealsPerDayForBalanced?: number;
  componentScores?: ShareCardComponentScores;
  distinctLoggingDaysThisWeek?: number;
  /** Previous-week component scores, for the improvement/comparison
   * concepts. Omit if unavailable — those concepts just won't earn. */
  previousWeekComponentScores?: ShareCardComponentScores;
  previousWeekAvgProteinG?: number | null;
  previousWeekAvgFiberG?: number | null;
  /** All-time meal count, for "first meal logged". */
  totalMealsAllTime?: number;
  /** Trailing weeks of history (most recent last), for multi-week badges. */
  weeksOfHistory?: ShareCardWeekSnapshot[];
}

interface TriggerResult {
  earned: boolean;
  isLowConfidence?: boolean;
  stat?: string;
}

const NOT_EARNED: TriggerResult = { earned: false };

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function mealsOn(meals: ShareCardMealInput[], day: Date): ShareCardMealInput[] {
  const target = startOfDay(day);
  return meals.filter((m) => startOfDay(new Date(m.loggedAt)) === target);
}

function estimate(min: number, max: number): number {
  return (min + max) / 2;
}

function sumEstimate(meals: ShareCardMealInput[], field: "protein" | "fiber"): number {
  return meals.reduce((s, m) => {
    return s + (field === "protein" ? estimate(m.totalProteinMin, m.totalProteinMax) : estimate(m.totalFiberMin, m.totalFiberMax));
  }, 0);
}

const DEFAULT_DAILY_PROTEIN_TARGET_G = 60;
const DEFAULT_DAILY_FIBER_TARGET_G = 25;
const BALANCE_SCORE_THRESHOLD = 70;

export function evaluateTrigger(triggerKey: string, input: ShareCardEvaluationInput): TriggerResult {
  const now = input.now ?? new Date();
  const todayMeals = mealsOn(input.meals, now);
  const cs = input.componentScores ?? {};
  const prevCs = input.previousWeekComponentScores;

  switch (triggerKey) {
    case "protein_goal_hit_today": {
      const target = input.dailyProteinTargetG ?? DEFAULT_DAILY_PROTEIN_TARGET_G;
      const protein = sumEstimate(todayMeals, "protein");
      if (todayMeals.length === 0) return NOT_EARNED;
      return { earned: protein >= target, isLowConfidence: input.dailyProteinTargetG === undefined };
    }
    case "fiber_win_today": {
      const target = input.dailyFiberTargetG ?? DEFAULT_DAILY_FIBER_TARGET_G;
      const fiber = sumEstimate(todayMeals, "fiber");
      if (todayMeals.length === 0) return NOT_EARNED;
      return { earned: fiber >= target, isLowConfidence: input.dailyFiberTargetG === undefined };
    }
    case "logged_all_meals_today": {
      const minMeals = input.minMealsPerDayForBalanced ?? 3;
      return { earned: todayMeals.length >= minMeals, stat: `${todayMeals.length} meals today` };
    }
    case "balanced_day": {
      const minMeals = input.minMealsPerDayForBalanced ?? 2;
      if (todayMeals.length < minMeals) return NOT_EARNED;
      // No per-day balance score exists — proxy from the aggregate
      // window's balance component, flagged low-confidence since it
      // isn't truly a same-day computation.
      const score = cs.macroAndFibreBalance;
      if (score == null) return NOT_EARNED;
      return { earned: score >= BALANCE_SCORE_THRESHOLD, isLowConfidence: true };
    }
    case "fruit_veg_win_today": {
      if (todayMeals.length === 0) return NOT_EARNED;
      const score = cs.fruitAndVegetableIntake;
      if (score == null) return NOT_EARNED;
      return { earned: score >= BALANCE_SCORE_THRESHOLD, isLowConfidence: true };
    }
    case "home_cooked_win": {
      if (todayMeals.length === 0) return NOT_EARNED;
      const score = cs.homePreparedMealShare;
      if (score == null) return NOT_EARNED;
      return { earned: score >= 60, isLowConfidence: true };
    }
    case "better_snack_choice":
    case "meal_correction_hero":
      // TODO (see concepts.ts): no data source yet.
      return NOT_EARNED;
    case "first_meal_logged":
      return { earned: input.totalMealsAllTime === 1 };
    case "first_balanced_meal": {
      // TODO (see concepts.ts): proxied loosely — treated as "earned" the
      // first time a balanced day is detected with very little history.
      const score = cs.macroAndFibreBalance;
      if (score == null || input.totalMealsAllTime == null) return NOT_EARNED;
      return { earned: score >= BALANCE_SCORE_THRESHOLD && input.totalMealsAllTime <= 3, isLowConfidence: true };
    }

    case "five_day_logging_week": {
      const days = input.distinctLoggingDaysThisWeek ?? 0;
      return { earned: days >= 5, stat: `${days}-day week` };
    }
    case "seven_day_logging_streak": {
      const days = input.distinctLoggingDaysThisWeek ?? 0;
      return { earned: days >= 7, stat: "7-day streak" };
    }
    case "protein_all_week": {
      const days = input.distinctLoggingDaysThisWeek ?? 0;
      const score = cs.proteinAdequacy;
      if (score == null || days < 5) return NOT_EARNED;
      return { earned: score >= BALANCE_SCORE_THRESHOLD };
    }
    case "balanced_meals_all_week": {
      const days = input.distinctLoggingDaysThisWeek ?? 0;
      const score = cs.macroAndFibreBalance;
      if (score == null || days < 5) return NOT_EARNED;
      return { earned: score >= BALANCE_SCORE_THRESHOLD };
    }
    case "fiber_friend_week": {
      const days = input.distinctLoggingDaysThisWeek ?? 0;
      const score = cs.fibreAdequacy;
      if (score == null || days < 5) return NOT_EARNED;
      return { earned: score >= BALANCE_SCORE_THRESHOLD };
    }
    case "more_color_this_week": {
      const score = cs.fruitAndVegetableIntake;
      const prevScore = prevCs?.fruitAndVegetableIntake;
      if (score == null || prevScore == null) return NOT_EARNED;
      return { earned: score - prevScore >= 10 };
    }
    case "home_cooked_momentum": {
      const days = input.distinctLoggingDaysThisWeek ?? 0;
      const score = cs.homePreparedMealShare;
      if (score == null || days < 4) return NOT_EARNED;
      return { earned: score >= 60 };
    }
    case "best_week_so_far": {
      // TODO (see concepts.ts): needs weeksOfHistory from the caller.
      const history = input.weeksOfHistory;
      if (!history || history.length < 2) return NOT_EARNED;
      const current = history[history.length - 1];
      const prior = history.slice(0, -1);
      const bestPrior = Math.max(...prior.map((w) => w.overallScore ?? -Infinity));
      if (current.overallScore == null || !Number.isFinite(bestPrior)) return NOT_EARNED;
      return { earned: current.overallScore > bestPrior };
    }
    case "weekend_didnt_break_streak": {
      const weekendDays = new Set(
        input.meals
          .filter((m) => (now.getTime() - new Date(m.loggedAt).getTime()) / 86400000 <= 7)
          .filter((m) => [0, 6].includes(new Date(m.loggedAt).getDay()))
          .map((m) => m.loggedAt.slice(0, 10))
      );
      return { earned: weekendDays.size >= 2 };
    }
    case "comeback_week": {
      const sorted = [...input.meals].sort((a, b) => new Date(a.loggedAt).getTime() - new Date(b.loggedAt).getTime());
      if (sorted.length === 0) return NOT_EARNED;
      // Find the most recent logging day, then look for a >=7-day gap
      // immediately before the current run of logged days.
      const days = Array.from(new Set(sorted.map((m) => m.loggedAt.slice(0, 10)))).sort();
      if (days.length < 2) return NOT_EARNED;
      const lastDay = new Date(days[days.length - 1]);
      const recentRun = days.filter((d) => (lastDay.getTime() - new Date(d).getTime()) / 86400000 <= 3);
      if (recentRun.length < 2) return NOT_EARNED;
      const earliestRecent = new Date(recentRun[0]);
      const beforeRecent = days.filter((d) => new Date(d).getTime() < earliestRecent.getTime());
      if (beforeRecent.length === 0) return NOT_EARNED;
      const priorDay = new Date(beforeRecent[beforeRecent.length - 1]);
      const gapDays = (earliestRecent.getTime() - priorDay.getTime()) / 86400000;
      return { earned: gapDays >= 7 };
    }

    case "more_balanced_than_last_week": {
      const score = cs.macroAndFibreBalance;
      const prevScore = prevCs?.macroAndFibreBalance;
      if (score == null || prevScore == null) return NOT_EARNED;
      return { earned: score - prevScore >= 5 };
    }
    case "more_protein_than_last_week": {
      const days = input.distinctLoggingDaysThisWeek ?? 0;
      if (input.previousWeekAvgProteinG == null || days === 0) return NOT_EARNED;
      const thisWeekAvg = sumEstimate(
        input.meals.filter((m) => (now.getTime() - new Date(m.loggedAt).getTime()) / 86400000 <= 7),
        "protein"
      ) / Math.max(days, 1);
      return { earned: thisWeekAvg - input.previousWeekAvgProteinG >= 5 };
    }
    case "more_fiber_than_last_week": {
      const days = input.distinctLoggingDaysThisWeek ?? 0;
      if (input.previousWeekAvgFiberG == null || days === 0) return NOT_EARNED;
      const thisWeekAvg = sumEstimate(
        input.meals.filter((m) => (now.getTime() - new Date(m.loggedAt).getTime()) / 86400000 <= 7),
        "fiber"
      ) / Math.max(days, 1);
      return { earned: thisWeekAvg - input.previousWeekAvgFiberG >= 5 };
    }
    case "better_breakfast_balance":
    case "better_dinner_balance": {
      // TODO (see concepts.ts): proxied via a simple mealType filter,
      // comparing this week's balance-component score for the relevant
      // meal type against last week's — but no per-meal-type component
      // score is computed anywhere yet, so this can't be evaluated from
      // aggregate component scores alone. Left unearned until a
      // per-meal-type scoring helper exists.
      return NOT_EARNED;
    }
    case "carb_balance_win": {
      const score = cs.macroAndFibreBalance;
      if (score == null) return NOT_EARNED;
      return { earned: score >= 65, isLowConfidence: true };
    }
    case "ultra_processed_frequency_down": {
      const score = cs.minimallyProcessedFoodBalance;
      const prevScore = prevCs?.minimallyProcessedFoodBalance;
      if (score == null || prevScore == null) return NOT_EARNED;
      return { earned: score - prevScore >= 10 };
    }
    case "goal_aligned_week": {
      const days = input.distinctLoggingDaysThisWeek ?? 0;
      const score = cs.goalAlignmentScore;
      if (score == null || days < 5) return NOT_EARNED;
      return { earned: score >= BALANCE_SCORE_THRESHOLD };
    }

    case "protein_loyalist": {
      // TODO (see concepts.ts): needs weeksOfHistory.
      const history = input.weeksOfHistory;
      if (!history || history.length < 3) return NOT_EARNED;
      const lastThree = history.slice(-3);
      return { earned: lastThree.every((w) => (w.proteinAdequacy ?? 0) >= BALANCE_SCORE_THRESHOLD) };
    }
    case "balanced_plate_enthusiast": {
      // TODO (see concepts.ts): needs weeksOfHistory.
      const history = input.weeksOfHistory;
      if (!history || history.length < 3) return NOT_EARNED;
      const lastThree = history.slice(-3);
      return { earned: lastThree.every((w) => (w.macroAndFibreBalance ?? 0) >= BALANCE_SCORE_THRESHOLD) };
    }

    default:
      return NOT_EARNED;
  }
}

/** Category-specific relevance filters, keyed by triggerKey — only used to
 * narrow down which of the in-window meals are shown as a card's
 * background photos (see selectSharePhotos below). Concepts with no entry
 * here just use every in-window meal with a photo (no narrower signal
 * makes sense for them, e.g. "logged all meals today" or the weekly
 * streak concepts). Thresholds are intentionally loose "does this meal
 * look like the achievement" heuristics, not exact score computations. */
const PHOTO_RELEVANCE_FILTERS: Partial<Record<string, (m: ShareCardMealInput) => boolean>> = {
  home_cooked_win: (m) => m.homeCookedLikelihood === "high",
  home_cooked_momentum: (m) => m.homeCookedLikelihood === "high",
  protein_goal_hit_today: (m) => estimate(m.totalProteinMin, m.totalProteinMax) >= 15,
  protein_all_week: (m) => estimate(m.totalProteinMin, m.totalProteinMax) >= 15,
  more_protein_than_last_week: (m) => estimate(m.totalProteinMin, m.totalProteinMax) >= 15,
  fiber_win_today: (m) => Boolean(m.hasVegetableOrFruit) || estimate(m.totalFiberMin, m.totalFiberMax) >= 5,
  fiber_friend_week: (m) => Boolean(m.hasVegetableOrFruit) || estimate(m.totalFiberMin, m.totalFiberMax) >= 5,
  more_fiber_than_last_week: (m) => Boolean(m.hasVegetableOrFruit) || estimate(m.totalFiberMin, m.totalFiberMax) >= 5,
  fruit_veg_win_today: (m) => Boolean(m.hasVegetableOrFruit),
  more_color_this_week: (m) => Boolean(m.hasVegetableOrFruit),
};

const MAX_SHARE_PHOTOS = 4;

/** Picks up to `maxPhotos` real meal-photo URLs relevant to an earned
 * card, most recent first. Window is "today" for daily_win concepts and
 * the trailing 7 days for everything else (personality_badge concepts are
 * multi-week aggregates with no natural "which meals" answer, so they
 * never get photos). Falls back from the category-specific relevance
 * filter to "any in-window meal with a photo" when the filter would
 * otherwise leave zero photos, so a card is never left bare just because
 * e.g. home-cooked detection missed a meal — better a loosely-relevant
 * photo than none. At most one photo per distinct day for weekly
 * concepts, so a 4-photo grid shows variety across the week rather than
 * four meals from the same day. */
export function selectSharePhotos(
  concept: Pick<ShareCardConcept, "category" | "triggerKey">,
  meals: ShareCardMealInput[],
  now: Date = new Date(),
  maxPhotos: number = MAX_SHARE_PHOTOS
): string[] {
  if (concept.category === "personality_badge") return [];

  const windowDays = concept.category === "daily_win" ? 1 : 7;
  const cutoff = startOfDay(now) - (windowDays - 1) * 86400000;
  const inWindow = meals.filter((m) => new Date(m.loggedAt).getTime() >= cutoff && Boolean(m.imageUrl));
  if (inWindow.length === 0) return [];

  const relevanceFilter = PHOTO_RELEVANCE_FILTERS[concept.triggerKey];
  const filtered = relevanceFilter ? inWindow.filter(relevanceFilter) : inWindow;
  const candidates = filtered.length > 0 ? filtered : inWindow;

  const sorted = [...candidates].sort((a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime());

  const seenDays = new Set<string>();
  const picked: string[] = [];
  for (const meal of sorted) {
    const dayKey = meal.loggedAt.slice(0, 10);
    if (seenDays.has(dayKey)) continue;
    seenDays.add(dayKey);
    picked.push(meal.imageUrl!);
    if (picked.length >= maxPhotos) break;
  }
  return picked;
}

/** Deterministic-but-rotating copy pick so the same card doesn't show
 * identical text every time it's earned (spec: "Do not repeatedly show
 * the same card every day"). Seeded off the calendar day so it's stable
 * within a single day's renders but changes across days. */
function pickCardCopy(options: string[], seed: string): string {
  if (options.length === 0) return "";
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  const index = Math.abs(hash) % options.length;
  return options[index];
}

export function getEarnedCards(
  concepts: ShareCardConcept[],
  input: ShareCardEvaluationInput,
  options?: { format?: ShareCardFormat }
): EarnedShareCard[] {
  const now = input.now ?? new Date();
  const dayKey = now.toISOString().slice(0, 10);
  const earned: EarnedShareCard[] = [];

  for (const concept of concepts) {
    const result = evaluateTrigger(concept.triggerKey, input);
    if (!result.earned) continue;

    const seed = `${concept.id}:${dayKey}`;
    const headline = pickCardCopy(concept.headlineOptions, seed);
    const supportingText = result.isLowConfidence && concept.lowConfidenceFallback
      ? concept.lowConfidenceFallback
      : pickCardCopy(concept.supportingTextOptions, seed);

    const photoUrls = selectSharePhotos(concept, input.meals, now);

    earned.push({
      concept,
      earnedAt: now.toISOString(),
      headline,
      supportingText,
      stat: result.stat,
      isLowConfidence: Boolean(result.isLowConfidence),
      format: options?.format ?? concept.defaultFormat,
      photoUrls: photoUrls.length > 0 ? photoUrls : undefined,
    });
  }

  return earned;
}
