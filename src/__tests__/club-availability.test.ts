import { calculateAvailableSlots, type AvailabilityInput } from "@/lib/club/availability";
import { haversineKm, travelFeeCents, EstimatedTravelTimeProvider } from "@/lib/club/travel/provider";
import { zonedWeekday, zonedTimeToInstant } from "@/lib/club/time";

// The availability engine decides whether a coach can be booked, so every
// rule it enforces is either lost revenue (too strict) or a double-booked,
// stranded coach (too loose). These tests pin each subtraction in the
// pipeline independently, then together.
//
// Fixture: Tuesday 1 Sep 2026, Asia/Singapore (UTC+8, no DST).
// SGT 09:00 == 01:00Z, SGT 17:00 == 09:00Z.

const TZ = "Asia/Singapore";
const TUESDAY = "2026-09-01";
const sgt = (hhmm: string, date = TUESDAY) => {
  const [h, m] = hhmm.split(":").map(Number);
  return zonedTimeToInstant(date, h * 60 + m, TZ);
};

/** Well before the fixture day, so min-notice never interferes unless a
 * test is specifically about it. */
const NOW = sgt("09:00", "2026-08-25");

function baseInput(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    now: NOW,
    timezone: TZ,
    dateRange: { from: sgt("00:00"), to: sgt("23:59") },
    serviceDurationMinutes: 60,
    slotIntervalMinutes: 30,
    workingRules: [{ weekday: 2, startMinute: 9 * 60, endMinute: 17 * 60 }], // Tue 09:00-17:00
    ...overrides,
  };
}

describe("timezone fixture sanity", () => {
  it("treats 1 Sep 2026 as a Tuesday in Singapore", () => {
    expect(zonedWeekday(sgt("12:00"), TZ)).toBe(2);
  });

  it("maps SGT wall-clock to the right UTC instant", () => {
    expect(sgt("09:00").toISOString()).toBe("2026-09-01T01:00:00.000Z");
  });
});

describe("working hours", () => {
  it("generates slots across the working window on the interval grid", () => {
    const { slots } = calculateAvailableSlots(baseInput());
    // 09:00-17:00 with 60min sessions every 30min => last start 16:00 => 15 slots.
    expect(slots).toHaveLength(15);
    expect(slots[0].startsAt.toISOString()).toBe("2026-09-01T01:00:00.000Z"); // 09:00 SGT
    expect(slots[slots.length - 1].startsAt.toISOString()).toBe("2026-09-01T08:00:00.000Z"); // 16:00 SGT
  });

  it("never offers a slot that would run past the working window", () => {
    const { slots } = calculateAvailableSlots(baseInput({ serviceDurationMinutes: 90 }));
    const last = slots[slots.length - 1];
    expect(last.endsAt.getTime()).toBeLessThanOrEqual(sgt("17:00").getTime());
  });

  it("produces nothing on a weekday the coach does not work", () => {
    const wednesday = { from: sgt("00:00", "2026-09-02"), to: sgt("23:59", "2026-09-02") };
    const { slots } = calculateAvailableSlots(baseInput({ dateRange: wednesday }));
    expect(slots).toHaveLength(0);
  });

  it("honours a working start that is off the interval grid", () => {
    // A 07:10 start must offer 07:10, not silently round to 07:00/07:30.
    const { slots } = calculateAvailableSlots(
      baseInput({ workingRules: [{ weekday: 2, startMinute: 7 * 60 + 10, endMinute: 9 * 60 + 10 }] })
    );
    expect(slots[0].startsAt.toISOString()).toBe("2026-08-31T23:10:00.000Z"); // 07:10 SGT
  });
});

describe("calendar busy and existing bookings", () => {
  it("removes slots overlapping a busy block", () => {
    const { slots } = calculateAvailableSlots(
      baseInput({ busy: [{ startsAt: sgt("11:00"), endsAt: sgt("12:00") }] })
    );
    const starts = slots.map((s) => s.startsAt.toISOString());
    expect(starts).not.toContain("2026-09-01T03:00:00.000Z"); // 11:00 clash
    expect(starts).not.toContain("2026-09-01T02:30:00.000Z"); // 10:30 runs into it
    expect(starts).toContain("2026-09-01T04:00:00.000Z"); // 12:00 is fine
  });

  it("treats touching edges as compatible, not overlapping", () => {
    // A busy block ending exactly at 12:00 must not block a 12:00 start.
    const { slots } = calculateAvailableSlots(
      baseInput({ busy: [{ startsAt: sgt("11:00"), endsAt: sgt("12:00") }] })
    );
    expect(slots.some((s) => s.startsAt.getTime() === sgt("12:00").getTime())).toBe(true);
  });

  it("counts a direct clash separately from a buffer-only clash", () => {
    const result = calculateAvailableSlots(
      baseInput({
        busy: [{ startsAt: sgt("11:00"), endsAt: sgt("12:00") }],
        bufferAfterMinutes: 30,
      })
    );
    // 10:00-11:00 no longer fits: its 30min after-buffer runs into the block.
    expect(result.slots.some((s) => s.startsAt.getTime() === sgt("10:00").getTime())).toBe(false);
    expect(result.rejections.buffer_conflict).toBeGreaterThan(0);
    expect(result.rejections.calendar_busy).toBeGreaterThan(0);
  });
});

describe("exceptions", () => {
  it("blocks slots inside a blocked exception", () => {
    const { slots } = calculateAvailableSlots(
      baseInput({
        exceptions: [{ startsAt: sgt("09:00"), endsAt: sgt("13:00"), type: "blocked" }],
      })
    );
    expect(slots[0].startsAt.getTime()).toBe(sgt("13:00").getTime());
  });

  it("adds availability outside working hours for an 'extra' exception", () => {
    const sunday = { from: sgt("00:00", "2026-09-06"), to: sgt("23:59", "2026-09-06") };
    const { slots } = calculateAvailableSlots(
      baseInput({
        dateRange: sunday,
        exceptions: [
          { startsAt: sgt("08:00", "2026-09-06"), endsAt: sgt("10:00", "2026-09-06"), type: "extra" },
        ],
      })
    );
    // Coach doesn't normally work Sunday, but opened a one-off window.
    // 08:00-10:00 fits 60min sessions starting 08:00, 08:30 and 09:00 (the
    // last ending exactly on the boundary).
    expect(slots.map((s) => s.startsAt.toISOString())).toEqual([
      "2026-09-06T00:00:00.000Z",
      "2026-09-06T00:30:00.000Z",
      "2026-09-06T01:00:00.000Z",
    ]);
  });
});

describe("notice and advance windows", () => {
  it("rejects slots inside the minimum notice period", () => {
    const result = calculateAvailableSlots(
      baseInput({ now: sgt("08:00"), minNoticeHours: 4 })
    );
    // Anything before 12:00 SGT is inside the 4h notice window.
    expect(result.slots[0].startsAt.getTime()).toBe(sgt("12:00").getTime());
    expect(result.rejections.min_notice).toBeGreaterThan(0);
  });

  it("rejects slots beyond the maximum advance window", () => {
    const result = calculateAvailableSlots(baseInput({ maxAdvanceDays: 3 }));
    expect(result.slots).toHaveLength(0);
    expect(result.rejections.max_advance).toBeGreaterThan(0);
  });
});

describe("travel feasibility", () => {
  // The defining case from the spec: a session in East Coast ending at
  // 15:00 cannot be followed by 15:30 in Bukit Timah.
  const eastCoastSession = {
    startsAt: sgt("14:00"),
    endsAt: sgt("15:00"),
    locationKey: "east-coast",
  };

  it("rejects a slot the coach cannot physically reach in time", () => {
    const result = calculateAvailableSlots(
      baseInput({
        requestedLocationKey: "bukit-timah",
        neighbouringBookings: [eastCoastSession],
        travelMinutes: { "east-coast->bukit-timah": 45 },
      })
    );
    // 15:30 needs 45min travel from a 15:00 finish — impossible.
    expect(result.slots.some((s) => s.startsAt.getTime() === sgt("15:30").getTime())).toBe(false);
    expect(result.rejections.travel_infeasible).toBeGreaterThan(0);
  });

  it("allows the slot once enough travel time exists", () => {
    const result = calculateAvailableSlots(
      baseInput({
        requestedLocationKey: "bukit-timah",
        neighbouringBookings: [eastCoastSession],
        travelMinutes: { "east-coast->bukit-timah": 25 },
      })
    );
    // 15:30 start leaves 30min for a 25min journey.
    expect(result.slots.some((s) => s.startsAt.getTime() === sgt("15:30").getTime())).toBe(true);
  });

  it("checks travel to the NEXT booking, not only from the previous one", () => {
    const result = calculateAvailableSlots(
      baseInput({
        requestedLocationKey: "bukit-timah",
        neighbouringBookings: [
          { startsAt: sgt("13:00"), endsAt: sgt("14:00"), locationKey: "east-coast" },
        ],
        travelMinutes: { "east-coast->bukit-timah": 10, "bukit-timah->east-coast": 50 },
      })
    );
    // A 14:00 booking is BEFORE; add one after to exercise the outbound leg.
    const withAfter = calculateAvailableSlots(
      baseInput({
        requestedLocationKey: "bukit-timah",
        neighbouringBookings: [
          { startsAt: sgt("16:00"), endsAt: sgt("17:00"), locationKey: "east-coast" },
        ],
        travelMinutes: { "bukit-timah->east-coast": 50 },
      })
    );
    expect(result.slots.length).toBeGreaterThan(0);
    // A 15:00-16:00 session can't be followed by a 16:00 start 50min away.
    expect(withAfter.slots.some((s) => s.startsAt.getTime() === sgt("15:00").getTime())).toBe(false);
  });

  it("treats unknown travel time as infeasible, never as zero", () => {
    // The single most dangerous default in the whole engine.
    const result = calculateAvailableSlots(
      baseInput({
        requestedLocationKey: "bukit-timah",
        neighbouringBookings: [eastCoastSession],
        travelMinutes: {}, // no data at all
      })
    );
    expect(result.slots.some((s) => s.startsAt.getTime() === sgt("15:30").getTime())).toBe(false);
    expect(result.rejections.travel_unknown).toBeGreaterThan(0);
  });

  it("needs no travel time between sessions at the same location", () => {
    const result = calculateAvailableSlots(
      baseInput({
        requestedLocationKey: "east-coast",
        neighbouringBookings: [eastCoastSession],
        travelMinutes: {},
      })
    );
    expect(result.slots.some((s) => s.startsAt.getTime() === sgt("15:00").getTime())).toBe(true);
  });

  it("adds the coach's travel buffer on top of computed travel", () => {
    const result = calculateAvailableSlots(
      baseInput({
        requestedLocationKey: "bukit-timah",
        neighbouringBookings: [eastCoastSession],
        travelMinutes: { "east-coast->bukit-timah": 25 },
        travelBufferMinutes: 15, // 25 + 15 = 40 > the 30min gap
      })
    );
    expect(result.slots.some((s) => s.startsAt.getTime() === sgt("15:30").getTime())).toBe(false);
  });

  it("inflates estimated travel times and flags the slot", () => {
    const result = calculateAvailableSlots(
      baseInput({
        requestedLocationKey: "bukit-timah",
        neighbouringBookings: [eastCoastSession],
        travelMinutes: { "east-coast->bukit-timah": 25 },
        estimatedTravelKeys: ["bukit-timah"],
        travelEstimateSafetyMultiplier: 1.25, // 25 * 1.25 = 32 > 30min gap
      })
    );
    expect(result.slots.some((s) => s.startsAt.getTime() === sgt("15:30").getTime())).toBe(false);

    const laterSlot = calculateAvailableSlots(
      baseInput({
        requestedLocationKey: "bukit-timah",
        neighbouringBookings: [eastCoastSession],
        travelMinutes: { "east-coast->bukit-timah": 20 },
        estimatedTravelKeys: ["bukit-timah"],
      })
    ).slots.find((s) => s.startsAt.getTime() === sgt("15:30").getTime());
    expect(laterSlot?.travelEstimated).toBe(true);
  });

  it("ignores travel entirely for online sessions", () => {
    const result = calculateAvailableSlots(
      baseInput({
        requestedLocationKey: null, // ONLINE
        neighbouringBookings: [eastCoastSession],
        travelMinutes: {},
      })
    );
    expect(result.slots.some((s) => s.startsAt.getTime() === sgt("15:00").getTime())).toBe(true);
  });
});

describe("everything together", () => {
  it("applies working hours, busy, buffers, notice and travel in one pass", () => {
    const result = calculateAvailableSlots(
      baseInput({
        now: sgt("07:00"),
        minNoticeHours: 3, // nothing before 10:00
        busy: [{ startsAt: sgt("12:00"), endsAt: sgt("13:00") }],
        bufferAfterMinutes: 15,
        requestedLocationKey: "river-valley",
        neighbouringBookings: [
          { startsAt: sgt("15:00"), endsAt: sgt("16:00"), locationKey: "katong" },
        ],
        travelMinutes: { "river-valley->katong": 35, "katong->river-valley": 35 },
      })
    );
    const starts = result.slots.map((s) => s.startsAt.getTime());
    expect(starts).not.toContain(sgt("09:00").getTime()); // min notice
    expect(starts).not.toContain(sgt("12:00").getTime()); // busy
    expect(starts).not.toContain(sgt("11:30").getTime()); // buffer into busy
    expect(starts).not.toContain(sgt("14:00").getTime()); // can't reach Katong by 15:00
    expect(starts).toContain(sgt("10:00").getTime()); // clean morning slot
  });
});

describe("travel provider", () => {
  it("measures Singapore distances plausibly", () => {
    const riverValley = { latitude: 1.2936, longitude: 103.8354 };
    const eastCoast = { latitude: 1.3016, longitude: 103.9065 };
    const km = haversineKm(riverValley, eastCoast);
    expect(km).toBeGreaterThan(7);
    expect(km).toBeLessThan(10);
  });

  it("never estimates zero travel time, even next door", async () => {
    const provider = new EstimatedTravelTimeProvider();
    const a = { latitude: 1.2936, longitude: 103.8354 };
    const estimate = await provider.travelTime(a, { ...a, latitude: a.latitude + 0.0005 }, new Date());
    expect(estimate.minutes).toBeGreaterThanOrEqual(10);
    expect(estimate.estimated).toBe(true);
  });

  it("charges the first band whose limit covers the distance", () => {
    const bands = [
      { uptoKm: 3, feeCents: 0 },
      { uptoKm: 7, feeCents: 1000 },
      { uptoKm: 12, feeCents: 2000 },
    ];
    expect(travelFeeCents(2, bands)).toBe(0);
    expect(travelFeeCents(3, bands)).toBe(0);
    expect(travelFeeCents(5, bands)).toBe(1000);
    expect(travelFeeCents(11.9, bands)).toBe(2000);
    expect(travelFeeCents(20, bands)).toBeNull(); // out of range, not free
  });
});
