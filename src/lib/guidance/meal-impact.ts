import {
  computeDailyTotals,
  localDate,
  nutrientValue,
  targetForDate,
  type ConfirmedMealRow,
  type DailyTarget,
  type DailyTotals,
} from "./daily-totals";

// How each meal moved a day against its target, and how each day went.
//
// Guidance mode's dashboards and WhatsApp replies show the person exactly
// what a meal contributed and what is left afterwards, and a history of
// days against the target that applied on each. Both are arithmetic over
// rows the caller supplies, built on computeDailyTotals so the meaning of
// "remaining", "over" and "incomplete" is the same everywhere. Pure: no
// database and no clock, so it runs on the server and in the browser.

export type NutrientKey = "calories" | "protein" | "carbs" | "fat" | "fiber";

export const NUTRIENTS: Array<{ key: NutrientKey; label: string; unit: "kcal" | "g" }> = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "carbs", label: "Carbs", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" },
  { key: "fiber", label: "Fiber", unit: "g" },
];

/** One meal's own value per nutrient, rounded, or null when the meal
 * reported nothing for it — never zero standing in for unknown. */
export function mealValues(m: ConfirmedMealRow): Record<NutrientKey, number | null> {
  const round = (v: number | null) => (v == null ? null : Math.round(v));
  return {
    calories: round(nutrientValue(m.totalCaloriesMin, m.totalCaloriesMax)),
    protein: round(nutrientValue(m.totalProteinMin, m.totalProteinMax)),
    carbs: round(nutrientValue(m.totalCarbsMin, m.totalCarbsMax)),
    fat: round(nutrientValue(m.totalFatMin, m.totalFatMax)),
    fiber: round(nutrientValue(m.totalFiberMin, m.totalFiberMax)),
  };
}

export interface MealImpact<T extends ConfirmedMealRow = ConfirmedMealRow> {
  meal: T;
  values: Record<NutrientKey, number | null>;
  /** The day's totals once this meal, and every earlier one, is counted. */
  after: DailyTotals;
}

/** The meals that fall on `date`, in the order they were eaten, each with
 * the day's running totals after it. */
export function mealImpacts<T extends ConfirmedMealRow>(params: {
  date: string;
  timezone: string;
  meals: T[];
  target: DailyTarget;
}): Array<MealImpact<T>> {
  const { date, timezone, target } = params;
  const onDay = params.meals
    .filter((m) => localDate(m.loggedAt, timezone) === date)
    .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));

  return onDay.map((meal, i) => ({
    meal,
    values: mealValues(meal),
    // Recomputed from the prefix rather than accumulated, so a running
    // total can never drift from what computeDailyTotals says for the day.
    after: computeDailyTotals({ date, timezone, meals: onDay.slice(0, i + 1), target }),
  }));
}

export interface GuidanceDay {
  /** Local date, YYYY-MM-DD. */
  date: string;
  /** Local noon on `date`, so day rows can go through the dashboard's own
   * filterByDateRange like meals do. */
  loggedAt: string;
  totals: DailyTotals;
}

function nextDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** Every day from `from` to `to` inclusive that a target covered, newest
 * first, judged against the target that applied ON that day. A day with no
 * meals is still a day: it shows as nothing eaten against the target,
 * because the history is about the target, not about logging. */
export function guidanceHistory<T extends { effectiveFrom: string; effectiveTo: string | null } & DailyTarget>(params: {
  from: string;
  to: string;
  timezone: string;
  meals: ConfirmedMealRow[];
  targets: T[];
}): GuidanceDay[] {
  // Bucket once. Formatting a date in a timezone is the expensive part, and
  // a year of history would otherwise redo it for every meal on every day.
  const byDate = new Map<string, ConfirmedMealRow[]>();
  for (const meal of params.meals) {
    const date = localDate(meal.loggedAt, params.timezone);
    byDate.set(date, [...(byDate.get(date) ?? []), meal]);
  }

  const days: GuidanceDay[] = [];
  // Bounded: a malformed `from` cannot loop forever.
  for (let date = params.from, n = 0; date <= params.to && n < 3660; date = nextDate(date), n++) {
    const target = targetForDate(params.targets, date);
    if (!target) continue;
    days.push({
      date,
      loggedAt: `${date}T12:00:00`,
      totals: computeDailyTotals({ date, timezone: params.timezone, meals: byDate.get(date) ?? [], target }),
    });
  }
  return days.reverse();
}
