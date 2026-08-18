import {
  MINUTE_MS,
  eachZonedDate,
  zonedDateString,
  zonedMinuteOfDay,
  zonedTimeToInstant,
  zonedWeekday,
} from "./time";

// The availability engine (ADR-005).
//
// A bookable slot must satisfy ALL of: working hours, minus availability
// exceptions, minus calendar busy time, minus existing bookings, minus
// buffers, minus travel feasibility, minus minimum notice, minus maximum
// advance. Getting any one of those wrong either double-books a coach or
// hides slots they could have sold.
//
// This module is deliberately PURE and synchronous. Every external input —
// Google busy blocks, existing bookings, travel-time lookups — is resolved
// by the caller and passed in as plain data. That keeps the hardest logic
// in the product exhaustively unit-testable with no database, no network
// and no wall clock, and it's the only practical way to reason about
// travel feasibility and buffers together.

export interface TimeRange {
  startsAt: Date;
  endsAt: Date;
}

export interface WorkingRule {
  /** 0 = Sunday .. 6 = Saturday, in the coach's timezone. */
  weekday: number;
  startMinute: number;
  endMinute: number;
  /** When set, this working block only offers sessions at one location. */
  locationId?: string | null;
}

export interface AvailabilityException extends TimeRange {
  type: "blocked" | "extra";
}

/** A booking the coach already has, with where it happens — the anchor for
 * travel feasibility. `locationKey` is an opaque identifier the caller also
 * uses as the key into `travelMinutes`. */
export interface NeighbouringBooking extends TimeRange {
  locationKey: string;
}

export interface AvailabilityInput {
  /** "Now" is injected, never read from the clock, so tests are stable. */
  now: Date;
  timezone: string;
  dateRange: { from: Date; to: Date };

  serviceDurationMinutes: number;
  /** Slot start granularity, e.g. 30 => :00 and :30 starts. */
  slotIntervalMinutes?: number;

  workingRules: WorkingRule[];
  exceptions?: AvailabilityException[];
  /** Google Calendar busy blocks AND existing Tistra bookings, already
   * merged by the caller. Only opaque ranges — no event titles, attendees
   * or descriptions ever reach this layer, let alone the browser (spec). */
  busy?: TimeRange[];

  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  minNoticeHours?: number;
  maxAdvanceDays?: number;

  // --- Travel feasibility -------------------------------------------
  /** Where the prospective session would happen. Omit for ONLINE. */
  requestedLocationKey?: string | null;
  /** Bookings that day which the coach must physically travel to/from. */
  neighbouringBookings?: NeighbouringBooking[];
  /** Minutes between two location keys, precomputed by the caller (this
   * module does no I/O). Key format: `${fromKey}->${toKey}`. A missing
   * entry is treated as NOT FEASIBLE rather than free — never silently
   * assume zero travel time (spec). */
  travelMinutes?: Record<string, number>;
  /** Coach's own padding on top of computed travel time. */
  travelBufferMinutes?: number;
  /** Multiplier applied when travel came from an estimate rather than live
   * routing, so uncertainty costs margin instead of causing late arrivals. */
  travelEstimateSafetyMultiplier?: number;
  /** Location keys whose travel numbers were estimates. */
  estimatedTravelKeys?: string[];
}

export type SlotRejection =
  | "outside_working_hours"
  | "exception_blocked"
  | "calendar_busy"
  | "buffer_conflict"
  | "min_notice"
  | "max_advance"
  | "travel_infeasible"
  | "travel_unknown";

export interface AvailableSlot {
  startsAt: Date;
  endsAt: Date;
  /** Local date (YYYY-MM-DD) in the coach's timezone — handy for grouping
   * in UI without re-deriving the zone. */
  localDate: string;
  locationKey?: string | null;
  /** True when travel feasibility for this slot relied on an estimate. */
  travelEstimated?: boolean;
}

export interface AvailabilityResult {
  slots: AvailableSlot[];
  /** Why candidate starts were dropped — powers "why am I not bookable?"
   * in the coach UI and makes test failures legible. Counts only. */
  rejections: Record<SlotRejection, number>;
}

const DEFAULTS = {
  slotIntervalMinutes: 30,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  minNoticeHours: 0,
  maxAdvanceDays: 365,
  travelBufferMinutes: 0,
  travelEstimateSafetyMultiplier: 1.25,
};

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  // Touching edges do not overlap: a 15:00 end and a 15:00 start are fine.
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Can the coach physically make this slot, given the sessions already
 * around it? Checks the booking immediately before (can they arrive in
 * time?) and immediately after (can they leave and still make it?).
 */
function travelFeasible(
  slotStart: number,
  slotEnd: number,
  input: AvailabilityInput
): { ok: true; estimated: boolean } | { ok: false; reason: "travel_infeasible" | "travel_unknown" } {
  const requested = input.requestedLocationKey;
  const neighbours = input.neighbouringBookings ?? [];
  // ONLINE sessions (no location) and coaches with nothing else booked have
  // nothing to travel between.
  if (!requested || neighbours.length === 0) return { ok: true, estimated: false };

  const travel = input.travelMinutes ?? {};
  const buffer = input.travelBufferMinutes ?? DEFAULTS.travelBufferMinutes;
  const safety = input.travelEstimateSafetyMultiplier ?? DEFAULTS.travelEstimateSafetyMultiplier;
  const estimatedKeys = new Set(input.estimatedTravelKeys ?? []);
  let usedEstimate = false;

  const legMinutes = (fromKey: string, toKey: string): number | null => {
    if (fromKey === toKey) return 0; // same place: no travel, buffers still apply elsewhere
    const raw = travel[`${fromKey}->${toKey}`];
    if (raw == null) return null; // unknown => not feasible, never "free"
    const isEstimate = estimatedKeys.has(fromKey) || estimatedKeys.has(toKey);
    if (isEstimate) usedEstimate = true;
    return Math.ceil(raw * (isEstimate ? safety : 1)) + buffer;
  };

  // Nearest booking that ENDS at or before this slot starts.
  const before = neighbours
    .filter((b) => b.endsAt.getTime() <= slotStart)
    .sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime())[0];
  if (before) {
    const need = legMinutes(before.locationKey, requested);
    if (need == null) return { ok: false, reason: "travel_unknown" };
    if (before.endsAt.getTime() + need * MINUTE_MS > slotStart) {
      return { ok: false, reason: "travel_infeasible" };
    }
  }

  // Nearest booking that STARTS at or after this slot ends.
  const after = neighbours
    .filter((b) => b.startsAt.getTime() >= slotEnd)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
  if (after) {
    const need = legMinutes(requested, after.locationKey);
    if (need == null) return { ok: false, reason: "travel_unknown" };
    if (slotEnd + need * MINUTE_MS > after.startsAt.getTime()) {
      return { ok: false, reason: "travel_infeasible" };
    }
  }

  return { ok: true, estimated: usedEstimate };
}

export function calculateAvailableSlots(input: AvailabilityInput): AvailabilityResult {
  const {
    now,
    timezone,
    dateRange,
    serviceDurationMinutes,
    slotIntervalMinutes = DEFAULTS.slotIntervalMinutes,
    workingRules,
    exceptions = [],
    busy = [],
    bufferBeforeMinutes = DEFAULTS.bufferBeforeMinutes,
    bufferAfterMinutes = DEFAULTS.bufferAfterMinutes,
    minNoticeHours = DEFAULTS.minNoticeHours,
    maxAdvanceDays = DEFAULTS.maxAdvanceDays,
  } = input;

  const rejections: Record<SlotRejection, number> = {
    outside_working_hours: 0,
    exception_blocked: 0,
    calendar_busy: 0,
    buffer_conflict: 0,
    min_notice: 0,
    max_advance: 0,
    travel_infeasible: 0,
    travel_unknown: 0,
  };
  const slots: AvailableSlot[] = [];

  if (serviceDurationMinutes <= 0) return { slots, rejections };

  const earliest = now.getTime() + minNoticeHours * 60 * MINUTE_MS;
  const latest = now.getTime() + maxAdvanceDays * 24 * 60 * MINUTE_MS;

  const blocked = exceptions.filter((e) => e.type === "blocked");
  const extra = exceptions.filter((e) => e.type === "extra");

  for (const localDate of eachZonedDate(dateRange.from, dateRange.to, timezone)) {
    // Working blocks for this weekday, plus any "extra" exception windows
    // that fall on this local date (they add availability outside normal
    // hours — e.g. a one-off Sunday morning).
    const dayStart = zonedTimeToInstant(localDate, 0, timezone);
    const weekday = zonedWeekday(dayStart, timezone);

    const windows: Array<{ start: number; end: number; locationId?: string | null }> = workingRules
      .filter((r) => r.weekday === weekday)
      .map((r) => ({
        start: zonedTimeToInstant(localDate, r.startMinute, timezone).getTime(),
        end: zonedTimeToInstant(localDate, r.endMinute, timezone).getTime(),
        locationId: r.locationId ?? null,
      }));

    for (const ex of extra) {
      if (zonedDateString(ex.startsAt, timezone) === localDate) {
        windows.push({ start: ex.startsAt.getTime(), end: ex.endsAt.getTime(), locationId: null });
      }
    }

    for (const window of windows) {
      const step = slotIntervalMinutes * MINUTE_MS;
      const duration = serviceDurationMinutes * MINUTE_MS;

      // Align the first candidate to the interval grid relative to the
      // window start, so a 07:10 working start with a 30-minute interval
      // still offers 07:10, 07:40 … rather than silently shifting to :00.
      for (let start = window.start; start + duration <= window.end; start += step) {
        const end = start + duration;

        if (start < earliest) {
          rejections.min_notice++;
          continue;
        }
        if (start > latest) {
          rejections.max_advance++;
          continue;
        }

        if (blocked.some((e) => overlaps(start, end, e.startsAt.getTime(), e.endsAt.getTime()))) {
          rejections.exception_blocked++;
          continue;
        }

        // Buffers extend the footprint the coach actually needs free, so a
        // session touching a busy block's edge is rejected when a buffer
        // would overlap it.
        const guardedStart = start - bufferBeforeMinutes * MINUTE_MS;
        const guardedEnd = end + bufferAfterMinutes * MINUTE_MS;

        const busyHit = busy.find((b) => overlaps(guardedStart, guardedEnd, b.startsAt.getTime(), b.endsAt.getTime()));
        if (busyHit) {
          // Distinguish a direct clash from a buffer-only clash: the coach
          // UI explains the second differently ("shorten your buffer").
          const direct = overlaps(start, end, busyHit.startsAt.getTime(), busyHit.endsAt.getTime());
          if (direct) rejections.calendar_busy++;
          else rejections.buffer_conflict++;
          continue;
        }

        const travel = travelFeasible(start, end, input);
        if (!travel.ok) {
          rejections[travel.reason]++;
          continue;
        }

        slots.push({
          startsAt: new Date(start),
          endsAt: new Date(end),
          localDate,
          locationKey: input.requestedLocationKey ?? window.locationId ?? null,
          travelEstimated: travel.estimated || undefined,
        });
      }
    }
  }

  // Windows can overlap (a working rule plus an "extra" exception), so the
  // same start can be produced twice; de-duplicate and order.
  const seen = new Set<number>();
  const unique = slots
    .filter((s) => {
      const key = s.startsAt.getTime();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  return { slots: unique, rejections };
}

/** First bookable slot, for the "next available" field on discovery cards. */
export function nextAvailableSlot(input: AvailabilityInput): AvailableSlot | null {
  return calculateAvailableSlots(input).slots[0] ?? null;
}

/** Local minute-of-day of a slot, for grouping in UI. */
export function slotLocalMinute(slot: AvailableSlot, timezone: string): number {
  return zonedMinuteOfDay(slot.startsAt, timezone);
}
