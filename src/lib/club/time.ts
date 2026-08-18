// Timezone helpers for the availability engine.
//
// Deliberately dependency-free (no date-fns/luxon): the engine must stay
// pure and cheap enough to run inside a Cloudflare Worker, and this repo
// has no date library. Singapore has no DST, but these are written to be
// correct generally so a second market doesn't need them rewritten.

/** Milliseconds to add to a UTC instant to get wall-clock time in `timeZone`. */
export function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const at: Record<string, number> = {};
  for (const p of parts) if (p.type !== "literal") at[p.type] = Number(p.value);
  // Intl can emit hour 24 for midnight in some locales/engines.
  const hour = at.hour === 24 ? 0 : at.hour;
  const asIfUtc = Date.UTC(at.year, at.month - 1, at.day, hour, at.minute, at.second);
  return asIfUtc - instant.getTime();
}

/** Local calendar date in `timeZone`, as YYYY-MM-DD. */
export function zonedDateString(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** 0 = Sunday .. 6 = Saturday, in `timeZone` — matches
 * coach_availability_rules.weekday. */
export function zonedWeekday(instant: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(instant);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

/** Minutes since local midnight in `timeZone`. */
export function zonedMinuteOfDay(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const at: Record<string, number> = {};
  for (const p of parts) if (p.type !== "literal") at[p.type] = Number(p.value);
  return (at.hour === 24 ? 0 : at.hour) * 60 + at.minute;
}

/**
 * The UTC instant for a wall-clock time in `timeZone`. Guess-then-correct:
 * build the instant as if the local time were UTC, measure the zone's
 * offset there, and shift. A second pass handles the rare case where the
 * first shift crosses a DST boundary.
 */
export function zonedTimeToInstant(localDate: string, minuteOfDay: number, timeZone: string): Date {
  const [y, m, d] = localDate.split("-").map(Number);
  const guessMs = Date.UTC(y, m - 1, d, Math.floor(minuteOfDay / 60), minuteOfDay % 60);
  const firstPass = new Date(guessMs - timeZoneOffsetMs(new Date(guessMs), timeZone));
  const corrected = new Date(guessMs - timeZoneOffsetMs(firstPass, timeZone));
  return corrected;
}

/** Local dates (YYYY-MM-DD) from `from` to `to` inclusive, in `timeZone`. */
export function eachZonedDate(from: Date, to: Date, timeZone: string): string[] {
  const dates: string[] = [];
  const seen = new Set<string>();
  // Step in 12h increments so a DST shift can't skip or duplicate a day.
  for (let t = from.getTime(); t <= to.getTime() + 12 * 3600_000; t += 12 * 3600_000) {
    const key = zonedDateString(new Date(t), timeZone);
    if (!seen.has(key)) {
      seen.add(key);
      dates.push(key);
    }
  }
  return dates;
}

export const MINUTE_MS = 60_000;
