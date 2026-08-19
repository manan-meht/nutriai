import fs from "fs";
import path from "path";
import {
  validateBookingPreferences,
  describeCancellationPolicy,
  BOUNDS,
} from "@/lib/club/booking-preferences";

// Booking rules and the cancellation policy were already governing every
// search and every refund, with no way for a coach to set them — so the
// product was making promises on their behalf. A public profile
// advertising "free cancellation up to 24 hours before" was stating a
// default nobody had agreed to.

const src = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf-8");

const VALID = {
  bufferBeforeMinutes: 10,
  bufferAfterMinutes: 15,
  minNoticeHours: 12,
  maxAdvanceDays: 60,
  cancellationFullRefundHours: 24,
  cancellationPartialRefundPercent: 50,
};

describe("validation", () => {
  it("accepts a sensible set", () => {
    const r = validateBookingPreferences(VALID);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(VALID);
  });

  it("accepts numeric strings from a form", () => {
    const r = validateBookingPreferences(
      Object.fromEntries(Object.entries(VALID).map(([k, v]) => [k, String(v)]))
    );
    expect(r.ok).toBe(true);
  });

  it("rejects rather than clamping an out-of-range value", () => {
    // Silently changing a coach's number to something they didn't type is
    // how people end up with rules they never agreed to.
    const r = validateBookingPreferences({ ...VALID, minNoticeHours: 1000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Minimum notice must be between 0 and 168/);
  });

  it("rejects a zero booking window, which would make the coach unbookable", () => {
    expect(validateBookingPreferences({ ...VALID, maxAdvanceDays: 0 }).ok).toBe(false);
  });

  it("rejects non-numbers and fractions", () => {
    expect(validateBookingPreferences({ ...VALID, bufferBeforeMinutes: "abc" }).ok).toBe(false);
    expect(validateBookingPreferences({ ...VALID, bufferBeforeMinutes: 7.5 }).ok).toBe(false);
  });

  it("names the field that was wrong", () => {
    const r = validateBookingPreferences({ ...VALID, cancellationPartialRefundPercent: 150 });
    if (!r.ok) expect(r.error).toContain(BOUNDS.cancellationPartialRefundPercent.label);
  });

  it("allows the permissive and the strict extremes", () => {
    expect(validateBookingPreferences({ ...VALID, minNoticeHours: 0, cancellationFullRefundHours: 0 }).ok).toBe(true);
    expect(validateBookingPreferences({ ...VALID, minNoticeHours: 168, cancellationPartialRefundPercent: 0 }).ok).toBe(true);
  });
});

describe("policy is explained, not just numbered", () => {
  it("spells out the common case", () => {
    expect(describeCancellationPolicy(24, 50)).toBe(
      "Cancel 24 hours or more before: full refund. Later than that: 50% back."
    );
  });

  it("says plainly when there is no refund after the window", () => {
    expect(describeCancellationPolicy(24, 0)).toMatch(/no refund/);
  });

  it("handles a zero-hour window without reading as nonsense", () => {
    expect(describeCancellationPolicy(0, 0)).toMatch(/any time before the session/);
  });
});

describe("wiring", () => {
  it("the action validates before writing", () => {
    const actions = src("app/(coach)/coach/actions.ts");
    const fn = actions.slice(actions.indexOf("export async function updateBookingPreferences"));
    expect(fn).toMatch(/validateBookingPreferences\(input\)/);
    expect(fn).toMatch(/if \(!parsed\.ok\) return \{ ok: false, error: parsed\.error \}/);
    // Scoped to the signed-in coach, like every other action here.
    expect(fn).toMatch(/\.eq\("id", coach\.id\)/);
  });

  it("shares validation between form and server, so limits cannot drift", () => {
    expect(src("components/coach/CoachSettings.tsx")).toMatch(/booking-preferences/);
  });

  it("says the policy applies only to new bookings", () => {
    // Existing bookings carry a snapshot from checkout, so a coach cannot
    // tighten terms retroactively on sessions already sold.
    expect(src("components/coach/CoachSettings.tsx")).toMatch(/keep the terms they were sold under/);
  });

  it("loads the saved values back into the form", () => {
    expect(src("app/(coach)/coach/settings/page.tsx")).toMatch(/bufferBeforeMinutes: coach\.buffer_before_minutes/);
    expect(src("app/(coach)/coach/settings/page.tsx")).toMatch(/cancellation_full_refund_hours/);
  });

  it("the values it sets are the ones the engine reads", () => {
    // Otherwise the form would look like it worked and change nothing.
    const engineInputs = src("lib/club/discovery.ts");
    for (const col of ["buffer_before_minutes", "min_notice_hours", "max_advance_days"]) {
      expect([col, engineInputs.includes(col)]).toEqual([col, true]);
    }
  });
});
