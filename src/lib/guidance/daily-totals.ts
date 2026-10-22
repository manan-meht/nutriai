// What a person has actually eaten today, against the target that applied
// on that day. Pure arithmetic over rows the caller supplies — no database,
// no clock of its own — so every rule below is directly testable.
//
// ─── Why this does not reuse computeMacroWindowSummaries ───────────────────
// packages/nutrition-core/src/macro-summary.ts coerces a missing nutrient to
// zero:
//
//     function midpoint(min, max) { return ((min ?? 0) + (max ?? 0)) / 2; }
//
// That is fine for a trend sparkline, where a slightly low day is harmless,
// and wrong for Guidance, where the same coercion silently tells someone
// they have more left to eat than they do. It also has a sharper edge than
// it looks: a row with min = 40 and max = NULL returns 20, under-reporting a
// known value by half.
//
// Guidance therefore distinguishes three states per nutrient — a number, a
// number that is known to be incomplete, and nothing at all — and says so on
// screen rather than averaging the uncertainty away.

/** A confirmed meal. Only rows that exist in meal_logs reach here: a photo
 * still awaiting confirmation lives in whatsapp_conversations.pending_meal
 * and is not eaten yet. */
export interface ConfirmedMealRow {
  id: string;
  loggedAt: string;
  totalCaloriesMin: number | null;
  totalCaloriesMax: number | null;
  totalProteinMin: number | null;
  totalProteinMax: number | null;
  totalCarbsMin: number | null;
  totalCarbsMax: number | null;
  totalFatMin: number | null;
  totalFatMax: number | null;
  totalFiberMin: number | null;
  totalFiberMax: number | null;
}

export interface DailyTarget {
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export interface NutrientDay {
  /** From the target that applied on this date, not today's target. */
  target: number;
  /** Midpoint of every meal that reported this nutrient. */
  consumed: number;
  /** Never negative: once the target is passed this is 0 and the excess is
   * reported separately. A negative "remaining" reads as a debt, and a food
   * target is not a debt. */
  remaining: number;
  /** How far past the target, or 0. Kept apart from `remaining` so a screen
   * can say "you are 120 kcal over" without inventing a negative. */
  over: number;
  /** True when at least one confirmed meal reported nothing for this
   * nutrient, so `consumed` is a floor rather than a figure. */
  isIncomplete: boolean;
  /** How many of the day's meals reported nothing for it. */
  mealsMissingData: number;
}

export interface DailyTotals {
  /** Local calendar date in the tracked person's timezone, YYYY-MM-DD. */
  date: string;
  mealCount: number;
  calories: NutrientDay;
  protein: NutrientDay;
  carbs: NutrientDay;
  fat: NutrientDay;
  /** Fiber is the one target not derived from the calorie figure, and the
   * one the Food Balance Score weights most distinctively — so it is
   * totalled like the rest rather than left to the score alone. */
  fiber: NutrientDay;
  /** True when any nutrient is incomplete — the one flag a summary line needs. */
  hasIncompleteData: boolean;
}

/** One meal's value for a nutrient, or null when it genuinely has none.
 *
 * A single-sided range is NOT averaged against zero. min=40/max=null means
 * "at least 40 and we did not bound it", which is far closer to 40 than to
 * 20; treating the absent bound as zero is the bug this function exists to
 * avoid. */
export function nutrientValue(min: number | null, max: number | null): number | null {
  if (min == null && max == null) return null;
  if (min == null) return max;
  if (max == null) return min;
  return (min + max) / 2;
}

/** The local calendar date a moment falls on, in the given timezone.
 *
 * en-CA formats as YYYY-MM-DD, which sorts lexically and is the same shape
 * the target rows' effective dates use, so day comparison never needs
 * offset arithmetic. Mirrors localDateKey in macro-summary.ts. */
export function localDate(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    // An unrecognised zone must not drop the meal from the day entirely.
    return iso.slice(0, 10);
  }
}

function summarise(values: Array<number | null>, target: number): NutrientDay {
  const known = values.filter((v): v is number => v != null);
  const consumed = Math.round(known.reduce((sum, v) => sum + v, 0));
  const mealsMissingData = values.length - known.length;

  return {
    target,
    consumed,
    remaining: Math.max(0, target - consumed),
    over: Math.max(0, consumed - target),
    isIncomplete: mealsMissingData > 0,
    mealsMissingData,
  };
}

/**
 * Totals for one local day.
 *
 * `meals` may contain anything; only those falling on `date` in `timezone`
 * are counted, so a caller can pass a window and ask for each day in it
 * without re-filtering. `target` must be the target that applied ON `date` —
 * resolving which version that is belongs to the caller, because only it
 * knows the person's target history.
 */
export function computeDailyTotals(params: {
  date: string;
  timezone: string;
  meals: ConfirmedMealRow[];
  target: DailyTarget;
}): DailyTotals {
  const { date, timezone, meals, target } = params;
  const onDay = meals.filter((m) => localDate(m.loggedAt, timezone) === date);

  const calories = summarise(onDay.map((m) => nutrientValue(m.totalCaloriesMin, m.totalCaloriesMax)), target.caloriesKcal);
  const protein = summarise(onDay.map((m) => nutrientValue(m.totalProteinMin, m.totalProteinMax)), target.proteinG);
  const carbs = summarise(onDay.map((m) => nutrientValue(m.totalCarbsMin, m.totalCarbsMax)), target.carbsG);
  const fat = summarise(onDay.map((m) => nutrientValue(m.totalFatMin, m.totalFatMax)), target.fatG);
  const fiber = summarise(onDay.map((m) => nutrientValue(m.totalFiberMin, m.totalFiberMax)), target.fiberG);

  return {
    date,
    mealCount: onDay.length,
    calories,
    protein,
    carbs,
    fat,
    fiber,
    hasIncompleteData:
      calories.isIncomplete ||
      protein.isIncomplete ||
      carbs.isIncomplete ||
      fat.isIncomplete ||
      fiber.isIncomplete,
  };
}

/** The target row covering a date, from a person's target history.
 *
 * Half-open: effectiveFrom inclusive, effectiveTo exclusive, null meaning
 * still current. A historical day must be judged against the target that
 * applied then — a week is not retroactively improved by raising the target
 * afterwards. Returns null when no target covered that date, which is a
 * real state (the days before Guidance was switched on) and not an error.
 */
export function targetForDate<T extends { effectiveFrom: string; effectiveTo: string | null }>(
  targets: T[],
  date: string
): T | null {
  const covering = targets.filter((t) => t.effectiveFrom <= date && (t.effectiveTo == null || date < t.effectiveTo));
  if (covering.length === 0) return null;
  // Defensive: the schema's partial unique index allows only one open-ended
  // row per person, but a closed overlap is still representable. The latest
  // start wins, so behaviour is defined rather than dependent on row order.
  return covering.reduce((latest, t) => (t.effectiveFrom > latest.effectiveFrom ? t : latest));
}
