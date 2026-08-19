// The rules a coach sets once that then govern every booking.
//
// Two groups, deliberately kept together because they answer the same
// question — "on what terms will you take work?":
//
//   Booking rules       buffers, notice, how far ahead — read by the
//                       availability engine on every search
//   Cancellation policy snapshotted onto each booking at checkout and used
//                       to compute refunds
//
// Both were already load-bearing in code with no way for a coach to set
// them, so the system was making promises on their behalf: a public profile
// advertising "free cancellation up to 24 hours before" was stating a
// default nobody had agreed to.
//
// Validation lives here rather than in the action so the form and the
// server apply identical rules, and a coach never sees a value accepted by
// one and rejected by the other.

export interface BookingPreferences {
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minNoticeHours: number;
  maxAdvanceDays: number;
  cancellationFullRefundHours: number;
  cancellationPartialRefundPercent: number;
}

interface Bound {
  min: number;
  max: number;
  label: string;
}

export const BOUNDS: Record<keyof BookingPreferences, Bound> = {
  // Two hours of buffer either side is already extreme; beyond that a coach
  // is describing a shorter working day, not a gap between sessions.
  bufferBeforeMinutes: { min: 0, max: 120, label: "Buffer before" },
  bufferAfterMinutes: { min: 0, max: 120, label: "Buffer after" },
  // A week of required notice makes a coach effectively unbookable, which
  // is a choice they're allowed to make — but not by accident.
  minNoticeHours: { min: 0, max: 168, label: "Minimum notice" },
  // At least a day of booking window, at most a year.
  maxAdvanceDays: { min: 1, max: 365, label: "Booking window" },
  cancellationFullRefundHours: { min: 0, max: 168, label: "Free cancellation window" },
  cancellationPartialRefundPercent: { min: 0, max: 100, label: "Partial refund" },
};

export type ValidationResult =
  | { ok: true; value: BookingPreferences }
  | { ok: false; error: string };

/** Coerces and range-checks a set of preferences. Rejects rather than
 * clamping: silently changing a coach's number to something they didn't
 * type is how people end up with rules they never agreed to. */
export function validateBookingPreferences(input: Partial<Record<keyof BookingPreferences, unknown>>): ValidationResult {
  const out = {} as BookingPreferences;

  for (const key of Object.keys(BOUNDS) as Array<keyof BookingPreferences>) {
    const raw = input[key];
    const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
    const bound = BOUNDS[key];

    if (!Number.isFinite(n)) return { ok: false, error: `${bound.label} needs a number.` };
    if (!Number.isInteger(n)) return { ok: false, error: `${bound.label} must be a whole number.` };
    if (n < bound.min || n > bound.max) {
      return { ok: false, error: `${bound.label} must be between ${bound.min} and ${bound.max}.` };
    }
    out[key] = n;
  }

  return { ok: true, value: out };
}

/** Plain-English summary of what a client will be told, so a coach can see
 * the consequence of the numbers rather than inferring it. */
export function describeCancellationPolicy(
  fullRefundHours: number,
  partialRefundPercent: number
): string {
  const window =
    fullRefundHours === 0
      ? "any time before the session"
      : fullRefundHours === 24
        ? "24 hours or more before"
        : `${fullRefundHours} hours or more before`;

  if (partialRefundPercent === 0) {
    return `Cancel ${window}: full refund. Later than that: no refund.`;
  }
  if (partialRefundPercent === 100) {
    return `Cancel ${window}: full refund. Later than that: also a full refund.`;
  }
  return `Cancel ${window}: full refund. Later than that: ${partialRefundPercent}% back.`;
}
