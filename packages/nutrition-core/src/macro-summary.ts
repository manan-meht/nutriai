import type { MacroWindowSummary } from "./types";

interface MealMacroRow {
  logged_at: string;
  total_calories_min: number | null;
  total_calories_max: number | null;
  total_protein_min: number | null;
  total_protein_max: number | null;
  total_carbs_min: number | null;
  total_carbs_max: number | null;
  total_fat_min: number | null;
  total_fat_max: number | null;
}

function midpoint(min: number | null, max: number | null): number {
  return ((min ?? 0) + (max ?? 0)) / 2;
}

/** Y/M/D as observed in `timeZone`, plus that same calendar day expressed
 * as a UTC-midnight instant — the latter makes "is this meal on the same
 * day as today" and "is this meal in the current calendar week" plain
 * integer/millisecond comparisons, with no per-offset arithmetic needed. */
function localDateKey(date: Date, timeZone: string): { utcMidnight: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    utcMidnight: Date.UTC(year, month - 1, day),
    weekday: weekdayMap[get("weekday") ?? "Sun"] ?? 0,
  };
}

const emptySummary = (): MacroWindowSummary => ({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0, mealCount: 0 });

/** Sums a person's logged macros for "today" and "this calendar week"
 * (Monday-start, matching src/packages's dashboard-core convention),
 * evaluated in `timezone` rather than the server's own UTC clock — see
 * PersonCard's own doc comment for why this exists (Food Balance Score
 * selection-screen fallback). Both totals always come back present and
 * zeroed rather than undefined, so callers never need to null-check. */
export function computeMacroWindowSummaries(
  meals: MealMacroRow[],
  timezone: string,
  now: Date = new Date()
): { today: MacroWindowSummary; week: MacroWindowSummary } {
  const nowKey = localDateKey(now, timezone);
  const daysSinceMonday = nowKey.weekday === 0 ? 6 : nowKey.weekday - 1;
  const weekStartUtcMidnight = nowKey.utcMidnight - daysSinceMonday * 86_400_000;

  const today = emptySummary();
  const week = emptySummary();

  for (const m of meals) {
    const mealKey = localDateKey(new Date(m.logged_at), timezone);
    if (mealKey.utcMidnight < weekStartUtcMidnight || mealKey.utcMidnight > nowKey.utcMidnight) continue;

    const calories = midpoint(m.total_calories_min, m.total_calories_max);
    const proteinG = midpoint(m.total_protein_min, m.total_protein_max);
    const carbsG = midpoint(m.total_carbs_min, m.total_carbs_max);
    const fatG = midpoint(m.total_fat_min, m.total_fat_max);

    week.calories += calories;
    week.proteinG += proteinG;
    week.carbsG += carbsG;
    week.fatG += fatG;
    week.mealCount++;

    if (mealKey.utcMidnight === nowKey.utcMidnight) {
      today.calories += calories;
      today.proteinG += proteinG;
      today.carbsG += carbsG;
      today.fatG += fatG;
      today.mealCount++;
    }
  }

  return {
    today: { ...today, calories: Math.round(today.calories), proteinG: Math.round(today.proteinG), carbsG: Math.round(today.carbsG), fatG: Math.round(today.fatG) },
    week: { ...week, calories: Math.round(week.calories), proteinG: Math.round(week.proteinG), carbsG: Math.round(week.carbsG), fatG: Math.round(week.fatG) },
  };
}

/** Total logged calories per day for a rolling 7-day window ending today
 * (oldest first) — feeds the family dashboard's MiniTrendChart sparkline.
 * A rolling window, not the Monday-start calendar week computeMacroWindow
 * Summaries uses above, since a trend line reads oddly resetting to empty
 * every Monday. Days with no meals come back as 0, not omitted, so the
 * chart's x-axis stays evenly spaced. */
export function computeDailyCalories(meals: MealMacroRow[], timezone: string, now: Date = new Date()): number[] {
  const nowKey = localDateKey(now, timezone);
  const days = 7;
  const byDayUtcMidnight = new Map<number, number>();
  for (let i = 0; i < days; i++) {
    byDayUtcMidnight.set(nowKey.utcMidnight - i * 86_400_000, 0);
  }

  for (const m of meals) {
    const mealKey = localDateKey(new Date(m.logged_at), timezone);
    if (!byDayUtcMidnight.has(mealKey.utcMidnight)) continue;
    const calories = midpoint(m.total_calories_min, m.total_calories_max);
    byDayUtcMidnight.set(mealKey.utcMidnight, (byDayUtcMidnight.get(mealKey.utcMidnight) ?? 0) + calories);
  }

  return [...byDayUtcMidnight.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, calories]) => Math.round(calories));
}

/** Total meal count for a rolling 7-day window ending today — a true
 * rolling window (like computeDailyCalories above), not the Monday-start
 * calendar week computeMacroWindowSummaries uses, so the count shifts by
 * one day at a time rather than jumping back to 0 every Monday. Reuses the
 * same day-bucketing as computeDailyCalories rather than that function's
 * per-day array, since callers here only need the single rolling total
 * (e.g. the mobile app's dynamic launcher icon). */
export function computeRollingWeekMealCount(meals: MealMacroRow[], timezone: string, now: Date = new Date()): number {
  const nowKey = localDateKey(now, timezone);
  const windowStartUtcMidnight = nowKey.utcMidnight - 6 * 86_400_000;

  let count = 0;
  for (const m of meals) {
    const mealKey = localDateKey(new Date(m.logged_at), timezone);
    if (mealKey.utcMidnight >= windowStartUtcMidnight && mealKey.utcMidnight <= nowKey.utcMidnight) count++;
  }
  return count;
}
