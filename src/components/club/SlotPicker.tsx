"use client";

import { useMemo, useState } from "react";
import { holdSlotAction } from "@/app/(club)/club/actions";
import { StickyAction } from "./ClubChrome";
import { CLUB_TOKENS as T } from "@/components/coach/tokens";
import { CLUB_MARKET } from "@/lib/club/config";

// Time picker for a coach's availability.
//
// Two things drive the layout, both learned from how booking apps that get
// used all day (Mindbody, Fresha, Calendly) handle this:
//
//  1. A day's slots are grouped into morning / afternoon / evening. A
//     popular coach offers 25 half-hourly starts, and an undifferentiated
//     grid of 25 identical boxes is genuinely hard to scan — the grouping
//     turns "find 6pm" from reading into jumping.
//  2. The date rail shows CONSECUTIVE days, with days the coach doesn't
//     work dimmed rather than omitted. Skipping straight from Thu to Sat
//     reads as a loading bug; showing Friday greyed says "they don't work
//     Fridays", which is real information about the coach.
//
// Everything is rendered in the market's timezone regardless of the
// visitor's device clock: a Singapore session at 7pm must read as 7pm to
// someone browsing from anywhere.

interface Slot { startsAt: string; endsAt: string }

const TZ = CLUB_MARKET.timezone;
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const weekdayFmt = new Intl.DateTimeFormat("en-SG", { timeZone: TZ, weekday: "short" });
const dayNumFmt = new Intl.DateTimeFormat("en-SG", { timeZone: TZ, day: "numeric" });
const monthFmt = new Intl.DateTimeFormat("en-SG", { timeZone: TZ, month: "short" });
const fullDayFmt = new Intl.DateTimeFormat("en-SG", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
const timeFmt = new Intl.DateTimeFormat("en-SG", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });
const hourFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false });

/** Hour of day in the market's timezone, for grouping. */
function zonedHour(iso: string): number {
  return Number(hourFmt.format(new Date(iso)));
}

const PARTS = [
  { key: "morning", label: "Morning", test: (h: number) => h < 12 },
  { key: "afternoon", label: "Afternoon", test: (h: number) => h >= 12 && h < 17 },
  { key: "evening", label: "Evening", test: (h: number) => h >= 17 },
] as const;

export function SlotPicker({
  coachProfileId,
  serviceId,
  slots,
  holdMinutes,
}: {
  coachProfileId: string;
  serviceId: string;
  slots: Slot[];
  holdMinutes: number;
}) {
  const byDay = useMemo(() => {
    const m = new Map<string, Slot[]>();
    for (const s of slots) {
      const key = dayKeyFmt.format(new Date(s.startsAt));
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(s);
    }
    return m;
  }, [slots]);

  /** Consecutive calendar days from today through the last bookable one,
   * so closed days appear dimmed instead of silently missing. */
  const days = useMemo(() => {
    if (slots.length === 0) return [];
    const last = slots.reduce((a, s) => (s.startsAt > a ? s.startsAt : a), slots[0].startsAt);
    const out: Array<{ key: string; date: Date; count: number }> = [];
    const cursor = new Date();
    const lastKey = dayKeyFmt.format(new Date(last));
    for (let i = 0; i < 60; i++) {
      const key = dayKeyFmt.format(cursor);
      out.push({ key, date: new Date(cursor), count: byDay.get(key)?.length ?? 0 });
      if (key === lastKey) break;
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }, [slots, byDay]);

  const firstOpen = days.find((d) => d.count > 0)?.key ?? "";
  const [activeDay, setActiveDay] = useState(firstOpen);
  const [chosen, setChosen] = useState<string | null>(null);

  if (slots.length === 0) {
    return (
      <p className="mt-8 rounded-2xl border p-6 text-center text-sm"
         style={{ borderColor: T.outlineVariant, color: T.onSurfaceVariant }}>
        No open times in the next two weeks. Try another session type, or check back — coaches release
        new times regularly.
      </p>
    );
  }

  const daySlots = byDay.get(activeDay) ?? [];
  const groups = PARTS.map((p) => ({
    ...p,
    slots: daySlots.filter((s) => p.test(zonedHour(s.startsAt))),
  })).filter((g) => g.slots.length > 0);

  return (
    <>
      {/* Date rail */}
      <div className="-mx-5 mt-5 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex gap-1.5 pb-1" role="tablist" aria-label="Date">
          {days.map((d, i) => {
            const on = d.key === activeDay;
            const closed = d.count === 0;
            const showMonth = i === 0 || monthFmt.format(d.date) !== monthFmt.format(days[i - 1].date);
            return (
              <button
                key={d.key}
                type="button"
                role="tab"
                aria-selected={on}
                disabled={closed}
                onClick={() => { setActiveDay(d.key); setChosen(null); }}
                className="flex w-[3.4rem] shrink-0 flex-col items-center rounded-2xl py-2.5 disabled:cursor-default"
                style={{
                  backgroundColor: on ? T.primary : closed ? "transparent" : T.surfaceContainerLow,
                  color: on ? T.onPrimary : closed ? T.outlineVariant : T.onSurface,
                }}
              >
                <span className="text-[10px] font-medium uppercase tracking-[0.06em]"
                      style={{ color: on ? T.onPrimary : closed ? T.outlineVariant : T.onSurfaceVariant }}>
                  {weekdayFmt.format(d.date)}
                </span>
                <span className="mt-0.5 text-[17px] font-semibold leading-none tabular-nums">
                  {dayNumFmt.format(d.date)}
                </span>
                <span className="mt-1 text-[9px] uppercase tracking-[0.05em]"
                      style={{ color: on ? T.onPrimary : T.outline, opacity: showMonth ? 1 : 0 }}>
                  {monthFmt.format(d.date)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-5 text-[13px]" style={{ color: T.onSurfaceVariant }}>
        {fullDayFmt.format(new Date(`${activeDay}T00:00:00`))} · {daySlots.length} available
      </p>

      {/* Slots, grouped by part of day */}
      {groups.map((g) => (
        <section key={g.key} className="mt-5">
          <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.09em]" style={{ color: T.outline }}>
            {g.label}
          </h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {g.slots.map((s) => {
              const on = s.startsAt === chosen;
              return (
                <button
                  key={s.startsAt}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setChosen(s.startsAt)}
                  className="rounded-xl border py-2.5 text-[13px] tabular-nums transition-colors"
                  style={{
                    backgroundColor: on ? T.primary : T.surfaceContainerLowest,
                    borderColor: on ? T.primary : T.outlineVariant,
                    color: on ? T.onPrimary : T.onSurface,
                    fontWeight: on ? 600 : 500,
                  }}
                >
                  {timeFmt.format(new Date(s.startsAt)).replace(" ", "")}
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <StickyAction>
        <form action={holdSlotAction}>
          <input type="hidden" name="coachProfileId" value={coachProfileId} />
          <input type="hidden" name="serviceId" value={serviceId} />
          <input type="hidden" name="startsAt" value={chosen ?? ""} />
          <button
            type="submit"
            disabled={!chosen}
            className="w-full rounded-full py-4 text-[15px] font-medium disabled:cursor-not-allowed"
            style={{
              backgroundColor: chosen ? T.primary : T.surfaceContainer,
              color: chosen ? T.onPrimary : T.outline,
            }}
          >
            {chosen ? `Continue · ${timeFmt.format(new Date(chosen))}` : "Select a time"}
          </button>
          <p className="mt-2 text-center text-xs" style={{ color: T.onSurfaceVariant }}>
            Held for {holdMinutes} minutes while you check out.
          </p>
        </form>
      </StickyAction>
    </>
  );
}
