// Cadence and eligibility rules for the "you're missing meal updates"
// nudge. Imported by relative path, not "@/", because the root jest config
// maps "@/" to the WEB app's src — the mobile package has no runner of its
// own, and push-nudge.ts is dependency-free precisely so it can be tested
// from here.
import {
  NUDGE_INTERVAL_MS,
  isTrackedLovedOne,
  trackedLovedOneNames,
  shouldShowWeeklyNudge,
  parseLastShownAt,
  missingUpdatesMessage,
  type NudgeContact,
} from "../lib/push-nudge";

const contact = (over: Partial<NudgeContact> = {}): NudgeContact => ({
  fullName: "Kamlesh Mehta",
  relationshipType: "family_caregiver",
  last7DaysMealCount: 4,
  mealCount: 120,
  ...over,
});

describe("isTrackedLovedOne", () => {
  it("counts a family contact who logged this week", () => {
    expect(isTrackedLovedOne(contact())).toBe(true);
  });

  it("excludes the caregiver's own 'self' contact", () => {
    // Notifying someone about their own upload is the thing the whole
    // feature is gated to avoid.
    expect(isTrackedLovedOne(contact({ relationshipType: "self" }))).toBe(false);
  });

  it("excludes a loved one who has gone quiet this week", () => {
    expect(isTrackedLovedOne(contact({ last7DaysMealCount: 0 }))).toBe(false);
  });

  it("falls back to the lifetime count when the rolling window is absent", () => {
    // A missing field must never silently disable the nudge.
    expect(isTrackedLovedOne(contact({ last7DaysMealCount: undefined }))).toBe(true);
    expect(
      isTrackedLovedOne(contact({ last7DaysMealCount: undefined, mealCount: 0 }))
    ).toBe(false);
  });
});

describe("trackedLovedOneNames", () => {
  it("returns first names of eligible contacts only", () => {
    expect(
      trackedLovedOneNames([
        contact({ fullName: "Kamlesh Mehta" }),
        contact({ fullName: "Manan Mehta", relationshipType: "self" }),
        contact({ fullName: "Asha Rao", last7DaysMealCount: 0 }),
        contact({ fullName: "Ravi Kumar", last7DaysMealCount: 2 }),
      ])
    ).toEqual(["Kamlesh", "Ravi"]);
  });
});

describe("shouldShowWeeklyNudge", () => {
  const now = new Date("2026-09-01T12:00:00+07:00").getTime();

  it("shows when it has never been shown", () => {
    expect(shouldShowWeeklyNudge(null, now)).toBe(true);
  });

  it("stays visible for the rest of the day it first appeared", () => {
    const earlierToday = new Date("2026-09-01T06:00:00+07:00").getTime();
    expect(shouldShowWeeklyNudge(earlierToday, now)).toBe(true);
  });

  it("hides the day after, rather than nagging", () => {
    const yesterday = now - 26 * 60 * 60 * 1000;
    expect(shouldShowWeeklyNudge(yesterday, now)).toBe(false);
  });

  it("hides throughout the rest of the week", () => {
    expect(shouldShowWeeklyNudge(now - 6 * 24 * 60 * 60 * 1000, now)).toBe(false);
  });

  it("reappears once a full week has passed", () => {
    expect(shouldShowWeeklyNudge(now - NUDGE_INTERVAL_MS, now)).toBe(true);
  });

  it("treats a corrupt stored value as never shown", () => {
    expect(shouldShowWeeklyNudge(Number.NaN, now)).toBe(true);
  });
});

describe("parseLastShownAt", () => {
  it("reads a stored timestamp", () => {
    expect(parseLastShownAt("1756700000000")).toBe(1756700000000);
  });

  it("returns null for absent or unparseable values", () => {
    expect(parseLastShownAt(null)).toBeNull();
    expect(parseLastShownAt("")).toBeNull();
    expect(parseLastShownAt("not-a-number")).toBeNull();
  });
});

describe("missingUpdatesMessage", () => {
  it("names one person", () => {
    expect(missingUpdatesMessage(["Kamlesh"])).toBe(
      "You're missing meal updates from Kamlesh."
    );
  });

  it("joins two with 'and'", () => {
    expect(missingUpdatesMessage(["Kamlesh", "Ravi"])).toBe(
      "You're missing meal updates from Kamlesh and Ravi."
    );
  });

  it("uses a list for three or more", () => {
    expect(missingUpdatesMessage(["Kamlesh", "Ravi", "Asha"])).toBe(
      "You're missing meal updates from Kamlesh, Ravi and Asha."
    );
  });

  it("falls back to a generic phrase with no names", () => {
    expect(missingUpdatesMessage([])).toBe(
      "You're missing meal updates from your loved ones."
    );
  });
});
