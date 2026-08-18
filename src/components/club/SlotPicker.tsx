"use client";

import { useMemo, useState } from "react";
import { holdSlotAction } from "@/app/(club)/club/actions";
import { StickyAction } from "./ClubChrome";
import { CLUB_TOKENS as T } from "@/components/coach/tokens";
import { CLUB_MARKET } from "@/lib/club/config";

// Day-then-time picker. Slots arrive already computed by the availability
// engine, so this component never decides what is bookable — it only
// arranges what it was given. Everything is rendered in the market's
// timezone regardless of the visitor's device clock, because a Singapore
// session at 7pm must read as 7pm to a client browsing from anywhere.

interface Slot { startsAt: string; endsAt: string }

const TZ = CLUB_MARKET.timezone;
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const dayLabelFmt = new Intl.DateTimeFormat("en-SG", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("en-SG", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });

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
  const days = useMemo(() => {
    const m = new Map<string, { label: string; slots: Slot[] }>();
    for (const s of slots) {
      const d = new Date(s.startsAt);
      const key = dayKeyFmt.format(d);
      if (!m.has(key)) m.set(key, { label: dayLabelFmt.format(d), slots: [] });
      m.get(key)!.slots.push(s);
    }
    return [...m.entries()].map(([key, v]) => ({ key, ...v }));
  }, [slots]);

  const [activeDay, setActiveDay] = useState(days[0]?.key ?? "");
  const [chosen, setChosen] = useState<string | null>(null);

  if (days.length === 0) {
    return (
      <p className="mt-8 rounded-2xl border p-6 text-center text-sm"
         style={{ borderColor: T.outlineVariant, color: T.onSurfaceVariant }}>
        No open times in the next two weeks. Try another session type, or check back — coaches release
        new times regularly.
      </p>
    );
  }

  const day = days.find((d) => d.key === activeDay) ?? days[0];

  return (
    <>
      <div className="-mx-5 mt-6 overflow-x-auto px-5">
        <div className="flex gap-2 pb-1" role="tablist" aria-label="Date">
          {days.map((d) => {
            const on = d.key === day.key;
            return (
              <button
                key={d.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => { setActiveDay(d.key); setChosen(null); }}
                className="shrink-0 rounded-2xl px-4 py-3 text-sm font-medium"
                style={{
                  backgroundColor: on ? T.primary : T.surfaceContainerLow,
                  color: on ? T.onPrimary : T.onSurfaceVariant,
                }}
              >
                {d.label}
                <span className="mt-0.5 block text-[11px] font-normal opacity-80">
                  {d.slots.length} {d.slots.length === 1 ? "time" : "times"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {day.slots.map((s) => {
          const on = s.startsAt === chosen;
          return (
            <button
              key={s.startsAt}
              type="button"
              aria-pressed={on}
              onClick={() => setChosen(s.startsAt)}
              className="rounded-xl border py-3 text-sm font-medium"
              style={{
                backgroundColor: on ? T.primaryContainer : T.surfaceContainerLowest,
                borderColor: on ? T.primary : T.outlineVariant,
                color: on ? T.primary : T.onSurface,
              }}
            >
              {timeFmt.format(new Date(s.startsAt))}
            </button>
          );
        })}
      </div>

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
            {chosen ? `Hold ${timeFmt.format(new Date(chosen))}` : "Select a time"}
          </button>
          <p className="mt-2 text-center text-xs" style={{ color: T.onSurfaceVariant }}>
            We&rsquo;ll hold it for {holdMinutes} minutes while you check out.
          </p>
        </form>
      </StickyAction>
    </>
  );
}
