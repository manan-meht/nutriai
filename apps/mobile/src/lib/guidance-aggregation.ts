// Mirrors the web app's src/lib/guidance/aggregation.ts VERBATIM, apart
// from this header and the two type-import paths below (the web file's
// "./daily-totals" and "./meal-impact" types live in ./guidance-types
// here). It must be kept in sync: the Progress tab's numbers on the phone
// have to be the web's numbers, and src/__tests__/guidance-aggregation.test.ts
// fails when the two copies drift. Change the web file, then copy it here.
//
// Imported by relative path only: the repo's root jest config maps "@/" to
// the web app's src.

import type { NutrientDay } from "./guidance-types";
import type { GuidanceDay, NutrientKey } from "./guidance-types";

// The one place Guidance turns days into periods, averages and comparisons.
//
// Every card and chart on the Progress tab reads from here, so a weekly
// average on one card can never disagree with the chart beside it. The
// rules it enforces are the ones a dashboard most easily gets wrong:
//
//   - A day with nothing logged is unlogged, not a day of zero intake. It
//     never enters an average.
//   - A day with fewer meals than the person usually eats is partial, and
//     so is a day where some meal reported nothing for the nutrient in
//     question. Its total is a floor, so it doesn't enter an average either.
//     A meal confirmed skipped counts towards the usual number (migration
//     0070): "I skipped lunch" makes the day's total a real figure, where an
//     unlogged lunch leaves it a floor.
//   - Today is in progress, not short. It's shown, but kept out of every
//     average and comparison.
//   - A comparison needs enough comparable days on both sides. With fewer,
//     the answer is "not enough data", not a percentage built on two days.
//
// Pure, no clock: the caller passes "today" in the person's timezone.

export type DayStatus = "complete" | "partial" | "unlogged" | "in_progress";

export interface DaySummary extends GuidanceDay {
  status: DayStatus;
  /** Meals confirmed skipped that day (with no meal logged in that slot). */
  skipped: number;
}

/** How many meals make a day complete when the person hasn't said how many
 * they usually eat. Shown on screen alongside the statuses it decides. */
export const DEFAULT_MEALS_PER_DAY = 3;

/** Fewer complete days than this on either side and there is no comparison. */
export const MIN_COMPARABLE_DAYS = 3;

export function summarizeDays(
  days: GuidanceDay[],
  today: string,
  expectedMealsPerDay: number,
  /** Confirmed skips, already without any slot that has a logged meal. */
  skips: Array<{ date: string }> = []
): DaySummary[] {
  const expected = Math.max(1, expectedMealsPerDay);
  const skippedOn = new Map<string, number>();
  for (const s of skips) skippedOn.set(s.date, (skippedOn.get(s.date) ?? 0) + 1);
  return days.map((day) => {
    const skipped = skippedOn.get(day.date) ?? 0;
    const accounted = day.totals.mealCount + skipped;
    return {
      ...day,
      skipped,
      status:
        day.date === today
          ? "in_progress"
          : accounted === 0
            ? "unlogged"
            : // Every meal skipped and nothing logged stays partial: a fast
              // day may still have had tea or fruit nobody logged, and a
              // zero would pull the average down on a guess.
              accounted < expected || day.totals.mealCount === 0
              ? "partial"
              : "complete",
    };
  });
}

export type PeriodKind = "week" | "month";

export interface DateRange {
  /** Inclusive, YYYY-MM-DD. */
  start: string;
  end: string;
}

export interface Period extends DateRange {
  kind: PeriodKind;
  /** The period's last calendar day (Sunday, or the month's last), for a
   * chart that shows the whole week or month with the days not yet
   * reached as empty slots. `end` stays today: nothing after it counts. */
  lastDay: string;
  /** The previous full week or month, for comparison. */
  previous: DateRange;
}

function parse(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(date: string, n: number): string {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

/** This week (Monday to today) or this month (the 1st to today), and the
 * full period before it. `today` is already the person's local date. */
export function periodFor(kind: PeriodKind, today: string): Period {
  if (kind === "week") {
    const weekday = (parse(today).getUTCDay() + 6) % 7; // Monday = 0
    const start = addDays(today, -weekday);
    return { kind, start, end: today, lastDay: addDays(start, 6), previous: { start: addDays(start, -7), end: addDays(start, -1) } };
  }
  const t = parse(today);
  const start = iso(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1)));
  const prevEnd = addDays(start, -1);
  const pe = parse(prevEnd);
  const lastDay = iso(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)));
  return {
    kind,
    start,
    end: today,
    lastDay,
    previous: { start: iso(new Date(Date.UTC(pe.getUTCFullYear(), pe.getUTCMonth(), 1))), end: prevEnd },
  };
}

/** Every date from start to end inclusive. */
export function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start, n = 0; d <= end && n < 62; d = addDays(d, 1), n++) out.push(d);
  return out;
}

export function daysIn(days: DaySummary[], range: DateRange): DaySummary[] {
  return days.filter((d) => d.date >= range.start && d.date <= range.end);
}

export interface NutrientStats {
  nutrient: NutrientKey;
  counts: Record<DayStatus, number>;
  /** Complete days whose total for this nutrient is a figure, not a floor. */
  usableDays: number;
  /** Mean over usableDays, or null with none. Never over partial,
   * unlogged or unfinished days. */
  average: number | null;
  /** Mean target over the same days, so a change of target mid-period is
   * compared like with like. */
  averageTarget: number | null;
}

const usable = (d: DaySummary, nutrient: NutrientKey): boolean =>
  d.status === "complete" && !(d.totals[nutrient] as NutrientDay).isIncomplete;

export function nutrientStats(days: DaySummary[], nutrient: NutrientKey): NutrientStats {
  const counts: Record<DayStatus, number> = { complete: 0, partial: 0, unlogged: 0, in_progress: 0 };
  for (const d of days) counts[d.status]++;
  // A complete day that's missing this nutrient's estimate is partial for
  // this nutrient: move it across so the counts on screen add up.
  const missing = days.filter((d) => d.status === "complete" && d.totals[nutrient].isIncomplete).length;
  counts.complete -= missing;
  counts.partial += missing;

  const pool = days.filter((d) => usable(d, nutrient));
  const mean = (f: (d: DaySummary) => number) =>
    pool.length === 0 ? null : Math.round(pool.reduce((s, d) => s + f(d), 0) / pool.length);
  return {
    nutrient,
    counts,
    usableDays: pool.length,
    average: mean((d) => d.totals[nutrient].consumed),
    averageTarget: mean((d) => d.totals[nutrient].target),
  };
}

export type Comparison =
  | { kind: "insufficient"; currentDays: number; previousDays: number; required: number }
  | { kind: "change"; current: number; previous: number; delta: number; currentDays: number; previousDays: number };

export function compare(current: NutrientStats, previous: NutrientStats, required = MIN_COMPARABLE_DAYS): Comparison {
  if (current.usableDays < required || previous.usableDays < required || current.average == null || previous.average == null) {
    return { kind: "insufficient", currentDays: current.usableDays, previousDays: previous.usableDays, required };
  }
  return {
    kind: "change",
    current: current.average,
    previous: previous.average,
    delta: current.average - previous.average,
    currentDays: current.usableDays,
    previousDays: previous.usableDays,
  };
}
