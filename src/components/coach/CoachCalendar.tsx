import Link from "next/link";
import { CLUB_TOKENS as T } from "./tokens";
import { CoachPageHeader } from "./CoachShell";
import { CLUB_MARKET } from "@/lib/club/config";
import type { CalendarWeek } from "@/lib/club/coach-queries";

// Weekly calendar: working hours as background shading, real bookings laid
// on top, positioned proportionally within the visible day.
//
// Google busy blocks merge into `sessions` upstream once Calendar OAuth
// lands, already sanitized to opaque ranges — this component never receives
// event titles, attendees or descriptions, so private calendar detail
// cannot reach the browser even by accident (spec).

const DAY_START_MINUTE = 6 * 60; // 06:00
const DAY_END_MINUTE = 22 * 60; // 22:00
const VISIBLE_MINUTES = DAY_END_MINUTE - DAY_START_MINUTE;

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

const pct = (minute: number) => ((minute - DAY_START_MINUTE) / VISIBLE_MINUTES) * 100;

export function CoachCalendar({ week, weekStart }: { week: CalendarWeek; weekStart: string }) {
  const start = new Date(weekStart);
  const end = new Date(start.getTime() + 6 * 864e5);
  const prev = new Date(start.getTime() - 7 * 864e5).toISOString().slice(0, 10);
  const next = new Date(start.getTime() + 7 * 864e5).toISOString().slice(0, 10);
  const todayKey = new Date().toISOString().slice(0, 10);

  const totalSessions = week.days.reduce((n, d) => n + d.sessions.length, 0);

  return (
    <>
      <CoachPageHeader
        eyebrow={`${rangeFmt.format(start)} – ${rangeFmt.format(end)}`}
        title="Calendar"
        action={
          <div className="flex items-center gap-2">
            <NavLink href={`/coach/calendar?week=${prev}`} label="Previous week">←</NavLink>
            <Link
              href="/coach/calendar"
              className="rounded-full border px-4 py-2 text-sm font-medium"
              style={{ borderColor: T.outlineVariant }}
            >
              Today
            </Link>
            <NavLink href={`/coach/calendar?week=${next}`} label="Next week">→</NavLink>
          </div>
        }
      />

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
                        height: `${((w.endMinute - w.startMinute) / VISIBLE_MINUTES) * 100}%`,
                        backgroundColor: T.surfaceContainerLow,
                      }}
                      aria-hidden="true"
                    />
                  ))}

                  {/* Booked sessions */}
                  {day.sessions.map((s) => {
                    const top = pct(minuteOfDay(s.startsAt));
                    const height = ((minuteOfDay(s.endsAt) - minuteOfDay(s.startsAt)) / VISIBLE_MINUTES) * 100;
                    return (
                      <Link
                        key={s.id}
                        href={`/coach/sessions/${s.id}`}
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
        Showing {Math.floor(DAY_START_MINUTE / 60)}:00–{Math.floor(DAY_END_MINUTE / 60)}:00 ·
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
