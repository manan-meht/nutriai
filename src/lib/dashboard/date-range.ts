export type DashboardDateRange =
  | "today"
  | "this_week"
  | "last_7_days"
  | "last_30_days"
  | "last_90_days"
  | "this_year"
  | "all_time";

export const DEFAULT_DASHBOARD_DATE_RANGE: DashboardDateRange = "this_week";

export const DATE_RANGE_OPTIONS: Array<{ value: DashboardDateRange; label: string }> = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "last_90_days", label: "Last 90 days" },
  { value: "this_year", label: "This year" },
  { value: "all_time", label: "All time" },
];

export function dateRangeLabel(range: DashboardDateRange): string {
  return DATE_RANGE_OPTIONS.find((o) => o.value === range)?.label ?? range;
}

/** Start-of-week is Monday, matching how "This Week's Focus" and the rest
 * of the habit-coaching copy already talk about weeks elsewhere in the
 * dashboard. */
function startOfWeek(now: Date): Date {
  const d = new Date(now);
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfDay(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Returns the inclusive start of the selected range — `null` for
 * "all_time", meaning "no lower bound, use everything available". */
export function getDateRangeStart(range: DashboardDateRange, now: Date = new Date()): Date | null {
  switch (range) {
    case "today":
      return startOfDay(now);
    case "this_week":
      return startOfWeek(now);
    case "last_7_days": {
      const d = startOfDay(now);
      d.setDate(d.getDate() - 6);
      return d;
    }
    case "last_30_days": {
      const d = startOfDay(now);
      d.setDate(d.getDate() - 29);
      return d;
    }
    case "last_90_days": {
      const d = startOfDay(now);
      d.setDate(d.getDate() - 89);
      return d;
    }
    case "this_year": {
      const d = new Date(now.getFullYear(), 0, 1);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "all_time":
      return null;
  }
}

/** Number of days the range spans — used to size charts/day-count labels
 * ("X of N days"). For "all_time" this falls back to the span between the
 * earliest meal and today, since there's no fixed window. */
export function getDateRangeDayCount(range: DashboardDateRange, now: Date = new Date(), earliestMealAt?: Date): number {
  const start = getDateRangeStart(range, now);
  if (start) {
    return Math.max(1, Math.round((startOfDay(now).getTime() - start.getTime()) / 86_400_000) + 1);
  }
  if (earliestMealAt) {
    return Math.max(1, Math.round((startOfDay(now).getTime() - startOfDay(earliestMealAt).getTime()) / 86_400_000) + 1);
  }
  return 1;
}

/** Filters any array of items with a `loggedAt` ISO-string field down to
 * the selected date range. */
export function filterByDateRange<T extends { loggedAt: string }>(
  items: T[],
  range: DashboardDateRange,
  now: Date = new Date()
): T[] {
  const start = getDateRangeStart(range, now);
  if (!start) return items;
  return items.filter((item) => new Date(item.loggedAt) >= start);
}
