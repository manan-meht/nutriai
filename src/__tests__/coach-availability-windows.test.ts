import fs from "fs";
import path from "path";
import { calculateAvailableSlots } from "@/lib/club/availability";

// A coach may work mornings and evenings with a gap between — a day job,
// school runs, a split shift. The availability engine has always unioned
// several windows per weekday; only the settings form couldn't express it,
// and worse, it keyed rules by weekday into a Map, so a second window was
// invisible there and deleted on the next save.

const src = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf-8");

describe("the engine offers every window on a day", () => {
  const split = () =>
    calculateAvailableSlots({
      now: new Date("2026-08-24T00:00:00+08:00"), // Monday, 00:00 SGT
      timezone: "Asia/Singapore",
      dateRange: { from: new Date("2026-08-24T00:00:00+08:00"), to: new Date("2026-08-25T00:00:00+08:00") },
      serviceDurationMinutes: 60,
      slotIntervalMinutes: 60,
      workingRules: [
        { weekday: 1, startMinute: 6 * 60, endMinute: 9 * 60 },   // 06:00-09:00
        { weekday: 1, startMinute: 18 * 60, endMinute: 21 * 60 }, // 18:00-21:00
      ],
      minNoticeHours: 0,
      maxAdvanceDays: 30,
    });

  it("produces slots in both blocks", () => {
    const hours = split().slots.map((s) =>
      Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Singapore", hour: "2-digit", hour12: false }).format(s.startsAt))
    );
    expect(hours).toContain(6);
    expect(hours).toContain(18);
  });

  it("offers nothing in the gap between them", () => {
    const hours = split().slots.map((s) =>
      Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Singapore", hour: "2-digit", hour12: false }).format(s.startsAt))
    );
    // The whole point of a split day: midday is not bookable.
    for (const midday of [9, 10, 11, 12, 13, 14, 15, 16, 17]) {
      expect([midday, hours.includes(midday)]).toEqual([midday, false]);
    }
  });
});

describe("the form no longer collapses a day to one window", () => {
  const settings = () => src("components/coach/CoachSettings.tsx");

  it("keeps a list of windows per day", () => {
    expect(settings()).toMatch(/windows: rules\s*\n?\s*\.filter\(\(r\) => r\.weekday === weekday\)/);
    // The bug: Map keyed by weekday kept only the last rule.
    expect(settings()).not.toMatch(/new Map\(rules\.map\(\(r\) => \[r\.weekday, r\]\)\)/);
  });

  it("can add and remove blocks", () => {
    expect(settings()).toMatch(/\+ Add another block/);
    expect(settings()).toMatch(/ws\.filter\(\(_, j\) => j !== i\)/);
  });

  it("saves every window, not one per day", () => {
    expect(settings()).toMatch(/days\.flatMap\(\(d\) =>\s*\n?\s*d\.windows\.map\(/);
  });

  it("labels each block's inputs for screen readers", () => {
    expect(settings()).toMatch(/block \$\{i \+ 1\} start/);
  });
});

describe("overlapping windows are rejected", () => {
  it("the action checks per weekday and names the day", () => {
    // The engine unions windows, so an overlap silently becomes one long
    // block — a coach who thought they'd closed midday gets booked in it.
    const actions = src("app/(coach)/coach/actions.ts");
    const fn = actions.slice(actions.indexOf("export async function setAvailabilityRules"));
    expect(fn).toMatch(/sameDay\[i\]\.startMinute < sameDay\[i - 1\]\.endMinute/);
    expect(fn).toMatch(/DAY_NAMES\[weekday\]/);
  });
});

describe("calendar busy applies to every surface", () => {
  it("discovery, the booking page and the coach's own week all fold it in", () => {
    // Previously only the booking page did, so the deck could advertise a
    // time the coach was busy in and the slot vanished on the next screen.
    expect(src("lib/club/discovery.ts")).toMatch(/fetchBusyBlocksForCoaches\(/);
    expect(src("lib/club/discovery.ts")).toMatch(/\.\.\.\(externalBusyByCoach\.get\(c\.id\) \?\? \[\]\)/);
    expect(src("lib/club/coach-queries.ts")).toMatch(/fetchBusyBlocks\(admin, profile\.id, now, weekEnd\)/);
  });

  it("a listing page costs at most one call per connected coach", () => {
    const cal = src("lib/club/calendar.ts");
    // Only coaches with a live connection are asked about at all.
    expect(cal).toMatch(/\.eq\("sync_status", "connected"\)/);
    expect(cal).toMatch(/readBusyCache/);
    expect(cal).toMatch(/writeBusyCache/);
  });

  it("caches only successful reads", () => {
    // Caching a null would pin a coach into "we don't know" after a blip,
    // and "we don't know" is the state that lets a double-booking through.
    const cal = src("lib/club/calendar.ts");
    const fn = cal.slice(cal.indexOf("export async function fetchBusyBlocks"));
    expect(fn).not.toMatch(/writeBusyCache\([^)]*null/);
  });

  it("connect and disconnect drop the cache instead of waiting out the TTL", () => {
    expect(src("lib/club/calendar.ts")).toMatch(/invalidateBusyCache\(coachProfileId\)/);
  });
});
