// How late a check is still allowed to fire a reminder that became due
// since the last check — must be wider than the actual check interval
// (recommended: every 15 min) so a slightly-delayed or skipped tick doesn't
// silently drop a reminder, without being so wide it fires hours late.
// Exact duplicate sends within this window are still prevented by the
// meal_reminder_sends unique index, not by this tolerance value.
const DEFAULT_TOLERANCE_MINUTES = 20;

/** Returns "HH:MM" and "YYYY-MM-DD" for the given instant in the given IANA
 * timezone, using Intl so this works identically in Node and the Edge
 * runtime regardless of the process's own locale/timezone. */
export function getLocalDateAndTime(instant: Date, timezone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    // Some ICU implementations render midnight as "24:00" — normalize to "00:00".
    time: get("hour") === "24" ? `00:${get("minute")}` : `${get("hour")}:${get("minute")}`,
  };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** True if `reminderTime` ("HH:MM", 24h) has just become due as of `now` in
 * `timezone` — i.e. now's local time is at or just after the target, within
 * one check-interval's worth of tolerance. Callers must still dedupe via
 * meal_reminder_sends before actually sending (this only answers "is it
 * time," not "has it already been sent"). */
export function isReminderDue(now: Date, timezone: string, reminderTime: string, toleranceMinutes = DEFAULT_TOLERANCE_MINUTES): boolean {
  const { time } = getLocalDateAndTime(now, timezone);
  const nowMinutes = toMinutes(time);
  const targetMinutes = toMinutes(reminderTime);
  return nowMinutes >= targetMinutes && nowMinutes < targetMinutes + toleranceMinutes;
}
