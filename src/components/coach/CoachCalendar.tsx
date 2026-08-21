import Link from "next/link";
import { CLUB_TOKENS as T } from "./tokens";
import { CoachPageHeader } from "./CoachShell";
import { CLUB_MARKET } from "@/lib/club/config";
import { zonedDateString } from "@/lib/club/time";
import type { CalendarWeek } from "@/lib/club/coach-queries";

// Weekly calendar: working hours as background shading, real bookings laid
// on top, positioned proportionally within the visible day.
//
// Google busy blocks merge into `sessions` upstream once Calendar OAuth
// lands, already sanitized to opaque ranges — this component never receives
// event titles, attendees or descriptions, so private calendar detail
// cannot reach the browser even by accident (spec).

// The grid's default window. It EXPANDS to fit anything outside it (see
// visibleWindow) rather than clipping: a 05:00 swim session or a late busy
// block used to be positioned at a negative offset and disappear off the
// top of the grid, which reads as "the calendar isn't syncing".
const DEFAULT_START_MINUTE = 6 * 60; // 06:00
const DEFAULT_END_MINUTE = 22 * 60; // 22:00

const timeFmt = new Intl.DateTimeFormat("en-SG", {
  timeZone: CLUB_MARKET.timezone,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const dayFmt = new Intl.DateTimeFormat("en-SG", { timeZone: CLUB_MARKET.timezone, weekday: "short" });
const dayNumFmt = new Intl.DateTimeFormat("en-SG", { timeZone: CLUB_MARKET.timezone, day: "numeric" });
const rangeFmt = new Intl.DateTimeFormat("en-SG", { timeZone: CLUB_MARKET.timezone, day: "numeric", month: "short" });

function minuteOfDay(iso: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CLUB_MARKET.timezone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const at: Record<string, number> = {};
  for (const p of parts) if (p.type !== "literal") at[p.type] = Number(p.value);
  return (at.hour === 24 ? 0 : at.hour) * 60 + at.minute;
}

/** Widens the default window to contain every session, busy block and
 * working window in the week, rounded out to the hour. */
function visibleWindow(week: CalendarWeek): { start: number; end: number } {
  let start = DEFAULT_START_MINUTE;
  let end = DEFAULT_END_MINUTE;
  const widen = (from: number, to: number) => {
    if (Number.isFinite(from)) start = Math.min(start, Math.floor(from / 60) * 60);
    if (Number.isFinite(to)) end = Math.max(end, Math.ceil(to / 60) * 60);
  };
  for (const day of week.days) {
    for (const w of day.workingWindows) widen(w.startMinute, w.endMinute);
    for (const b of day.busyBlocks) widen(minuteOfDay(b.startsAt), minuteOfDay(b.endsAt));
    for (const sn of day.sessions) widen(minuteOfDay(sn.startsAt), minuteOfDay(sn.endsAt));
  }
  return { start: Math.max(0, start), end: Math.min(24 * 60, Math.max(end, start + 60)) };
}

export function CoachCalendar({ week, weekStart }: { week: CalendarWeek; weekStart: string }) {
  const start = new Date(weekStart);
  const end = new Date(start.getTime() + 6 * 864e5);
  // Market time throughout: toISOString() yields the UTC date, which is
  // the previous day for any Singapore morning before 08:00 — that made
  // "today" highlight the wrong column and the week links skew.
  const prev = zonedDateString(new Date(start.getTime() - 7 * 864e5), CLUB_MARKET.timezone);
  const next = zonedDateString(new Date(start.getTime() + 7 * 864e5), CLUB_MARKET.timezone);
  const todayKey = zonedDateString(new Date(), CLUB_MARKET.timezone);

  const { start: dayStartMinute, end: dayEndMinute } = visibleWindow(week);
  const visibleMinutes = dayEndMinute - dayStartMinute;
  const pct = (minute: number) => ((minute - dayStartMinute) / visibleMinutes) * 100;
  /** A block that ends past midnight is reported by Google as ending on the
   * next day; clamp so it fills to the bottom instead of inverting. */
  const span = (from: number, to: number) =>
    (Math.max(0, Math.min(to, dayEndMinute) - Math.max(from, dayStartMinute)) / visibleMinutes) * 100;

  const totalSessions = week.days.reduce((n, d) => n + d.sessions.length, 0);
  const hasBusy = week.days.some((d) => d.busyBlocks.length > 0);

  return (
    <>
      <CoachPageHeader
        eyebrow={`${rangeFmt.format(start)} – ${rangeFmt.format(end)}`}
        title="Calendar"
        action={
          <div className="flex items-center gap-2">
            <NavLink href={`/calendar?week=${prev}`} label="Previous week">←</NavLink>
            <Link
              href="/calendar"
              className="rounded-full border px-4 py-2 text-sm font-medium"
              style={{ borderColor: T.outlineVariant }}
            >
              Today
            </Link>
            <NavLink href={`/calendar?week=${next}`} label="Next week">→</NavLink>
          </div>
        }
      />

      {hasBusy && (
        <p className="mb-4 flex items-center gap-2 text-xs" style={{ color: T.onSurfaceVariant }}>
          <span
            aria-hidden="true"
            className="inline-block h-3.5 w-6 rounded"
            style={{
              backgroundColor: T.surfaceContainer,
              backgroundImage:
                "repeating-linear-gradient(45deg, rgba(0,0,0,0.045) 0 6px, transparent 6px 12px)",
            }}
          />
          Busy in your Google Calendar — clients can&rsquo;t book these times. We only see the
          times, never what they&rsquo;re for.
        </p>
      )}

      {totalSessions === 0 && (
        <p
          className="mb-5 rounded-xl border border-dashed px-4 py-3 text-sm"
          style={{ borderColor: T.outlineVariant, color: T.onSurfaceVariant }}
        >
          No sessions booked this week. Shaded bands are the hours you&apos;re bookable —
          clients can pick any free slot inside them.
        </p>
      )}

      {/* Horizontal scroll on small screens keeps all seven days comparable
          rather than collapsing to a list that hides the shape of the week. */}
      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[720px] grid-cols-7 gap-2">
          {week.days.map((day) => {
            const isToday = day.date === todayKey;
            return (
              <div key={day.date}>
                <div className="mb-2 text-center">
                  <p className="text-xs uppercase tracking-[0.05em]" style={{ color: T.onSurfaceVariant }}>
                    {dayFmt.format(new Date(`${day.date}T12:00:00Z`))}
                  </p>
                  <p
                    className="mx-auto mt-1 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold tabular-nums"
                    style={isToday ? { backgroundColor: T.primary, color: T.onPrimary } : undefined}
                  >
                    {dayNumFmt.format(new Date(`${day.date}T12:00:00Z`))}
                  </p>
                </div>

                <div
                  className="relative h-[520px] overflow-hidden rounded-xl border"
                  style={{ backgroundColor: T.surfaceContainerLowest, borderColor: T.outlineVariant }}
                >
                  {/* Bookable hours */}
                  {day.workingWindows.map((w, i) => (
                    <div
                      key={i}
                      className="absolute inset-x-0"
                      style={{
                        top: `${pct(w.startMinute)}%`,
                        height: `${span(w.startMinute, w.endMinute)}%`,
                        backgroundColor: T.surfaceContainerLow,
                      }}
                      aria-hidden="true"
                    />
                  ))}

                  {/* Google busy blocks, beneath sessions so a real
                      booking always wins the space. Hatched and unlabelled
                      because that is genuinely all we know — the free/busy
                      scope returns times and nothing else. */}
                  {day.busyBlocks.map((b) => {
                    const top = pct(minuteOfDay(b.startsAt));
                    const height = span(minuteOfDay(b.startsAt), minuteOfDay(b.endsAt));
                    return (
                      <div
                        key={`${b.startsAt}-${b.endsAt}`}
                        className="absolute inset-x-1 overflow-hidden rounded-lg px-2 py-1 text-[11px] leading-tight"
                        style={{
                          top: `${top}%`,
                          height: `${Math.max(height, 3)}%`,
                          backgroundColor: T.surfaceContainer,
                          color: T.onSurfaceVariant,
                          backgroundImage:
                            "repeating-linear-gradient(45deg, rgba(0,0,0,0.045) 0 6px, transparent 6px 12px)",
                        }}
                        title={`Busy in your Google Calendar · ${timeFmt.format(new Date(b.startsAt))}`}
                      >
                        <span className="block truncate font-medium">Busy</span>
                      </div>
                    );
                  })}

                  {/* Booked sessions */}
                  {day.sessions.map((s) => {
                    const top = pct(minuteOfDay(s.startsAt));
                    const height = span(minuteOfDay(s.startsAt), minuteOfDay(s.endsAt));
                    return (
                      <Link
                        key={s.id}
                        href={`/sessions/${s.id}`}
                        className="absolute inset-x-1 overflow-hidden rounded-lg px-2 py-1.5 text-[11px] leading-tight"
                        style={{
                          top: `${top}%`,
                          height: `${Math.max(height, 4)}%`,
                          backgroundColor: T.primary,
                          color: T.onPrimary,
                        }}
                      >
                        <span className="block font-semibold tabular-nums">
                          {timeFmt.format(new Date(s.startsAt))}
                        </span>
                        <span className="block truncate">{s.clientName}</span>
                        {s.locationLabel && <span className="block truncate opacity-80">{s.locationLabel}</span>}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-4 text-xs" style={{ color: T.onSurfaceVariant }}>
        Showing {Math.floor(dayStartMinute / 60)}:00–{Math.floor(dayEndMinute / 60)}:00 ·
        times in {CLUB_MARKET.timezone.replace("_", " ")}
      </p>
    </>
  );
}

function NavLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="flex h-10 w-10 items-center justify-center rounded-full border text-sm"
      style={{ borderColor: T.outlineVariant }}
    >
      {children}
    </Link>
  );
}
