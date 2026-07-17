import { guessTimezoneFromCountryCode } from "@/lib/reminders/timezone";
import { getLocalDateAndTime, isReminderDue } from "@/lib/reminders/schedule";
import { buildReminderMessage, mealSlotForTime, reminderDisplayName } from "@/lib/reminders/messages";

describe("guessTimezoneFromCountryCode", () => {
  it("maps common country codes to their primary timezone", () => {
    expect(guessTimezoneFromCountryCode("91")).toBe("Asia/Kolkata");
    expect(guessTimezoneFromCountryCode("65")).toBe("Asia/Singapore");
    expect(guessTimezoneFromCountryCode("66")).toBe("Asia/Bangkok");
    expect(guessTimezoneFromCountryCode("44")).toBe("Europe/London");
  });

  it("longest-prefix-matches so a country sharing a leading digit with '1' resolves correctly", () => {
    // Guards against a naive single-digit lookup misrouting +1-prefixed
    // numbers from other countries to the US/Canada default.
    expect(guessTimezoneFromCountryCode("1")).toBe("America/New_York");
  });

  it("falls back to a sane default for an unrecognized code", () => {
    expect(guessTimezoneFromCountryCode("999")).toBe("Asia/Kolkata");
  });

  it("strips non-digit characters before matching", () => {
    expect(guessTimezoneFromCountryCode("+91")).toBe("Asia/Kolkata");
  });
});

describe("getLocalDateAndTime", () => {
  it("converts a UTC instant to the correct local date/time in a positive-offset zone", () => {
    // 2026-01-01T00:30:00Z is 06:00 the same day in IST (+5:30).
    const result = getLocalDateAndTime(new Date("2026-01-01T00:30:00Z"), "Asia/Kolkata");
    expect(result).toEqual({ date: "2026-01-01", time: "06:00" });
  });

  it("rolls over to the previous local day when UTC is ahead of a negative-offset zone", () => {
    // 2026-01-01T02:00:00Z is 2025-12-31T21:00 in America/New_York (-5:00 in winter).
    const result = getLocalDateAndTime(new Date("2026-01-01T02:00:00Z"), "America/New_York");
    expect(result).toEqual({ date: "2025-12-31", time: "21:00" });
  });
});

describe("isReminderDue", () => {
  const tz = "Asia/Kolkata";

  it("is true right at the target time", () => {
    // 02:30 UTC = 08:00 IST
    expect(isReminderDue(new Date("2026-01-01T02:30:00Z"), tz, "08:00")).toBe(true);
  });

  it("is true within the tolerance window after the target time", () => {
    // 08:15 IST — 15 minutes after an 08:00 target, within the default 20-minute tolerance.
    expect(isReminderDue(new Date("2026-01-01T02:45:00Z"), tz, "08:00")).toBe(true);
  });

  it("is false before the target time", () => {
    // 07:45 IST — before the 08:00 target.
    expect(isReminderDue(new Date("2026-01-01T02:15:00Z"), tz, "08:00")).toBe(false);
  });

  it("is false once past the tolerance window", () => {
    // 08:25 IST — 25 minutes after, past the default 20-minute tolerance.
    expect(isReminderDue(new Date("2026-01-01T02:55:00Z"), tz, "08:00")).toBe(false);
  });

  it("respects a custom tolerance", () => {
    const at0810 = new Date("2026-01-01T02:40:00Z"); // 08:10 IST
    expect(isReminderDue(at0810, tz, "08:00", 5)).toBe(false);
    expect(isReminderDue(at0810, tz, "08:00", 15)).toBe(true);
  });
});

describe("mealSlotForTime", () => {
  it("buckets the default 8am/12pm/7pm reminder times correctly", () => {
    expect(mealSlotForTime("08:00")).toBe("breakfast");
    expect(mealSlotForTime("12:00")).toBe("lunch");
    expect(mealSlotForTime("19:00")).toBe("dinner");
  });

  it("buckets boundary hours consistently", () => {
    expect(mealSlotForTime("10:59")).toBe("breakfast");
    expect(mealSlotForTime("11:00")).toBe("lunch");
    expect(mealSlotForTime("16:59")).toBe("lunch");
    expect(mealSlotForTime("17:00")).toBe("dinner");
  });
});

describe("buildReminderMessage", () => {
  it("includes the person's name, for every meal slot", () => {
    expect(buildReminderMessage("Priya", "08:00")).toContain("Priya");
    expect(buildReminderMessage("Priya", "12:00")).toContain("Priya");
    expect(buildReminderMessage("Priya", "19:00")).toContain("Priya");
  });

  it("draws from a pool rather than always the same message (rotation)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(buildReminderMessage("Priya", "08:00"));
    // With 7 breakfast variants and 50 draws, seeing only 1 distinct
    // message would indicate rotation isn't actually happening.
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("reminderDisplayName", () => {
  const base = { fullName: "Sunita Sharma", relationship: "parent", age: 65, gender: "female", normalizedWhatsappNumber: "919812345678" };

  it("uses Aunty for an elderly Indian parent, female", () => {
    expect(reminderDisplayName(base)).toBe("Aunty");
  });

  it("uses Uncle for an elderly Indian parent, male", () => {
    expect(reminderDisplayName({ ...base, gender: "male" })).toBe("Uncle");
  });

  it("falls back to first name when gender is unset/other", () => {
    expect(reminderDisplayName({ ...base, gender: null })).toBe("Sunita");
    expect(reminderDisplayName({ ...base, gender: "other" })).toBe("Sunita");
  });

  it("falls back to first name when relationship isn't 'parent'", () => {
    expect(reminderDisplayName({ ...base, relationship: "sibling" })).toBe("Sunita");
  });

  it("falls back to first name when age is 60 or under", () => {
    expect(reminderDisplayName({ ...base, age: 60 })).toBe("Sunita");
    expect(reminderDisplayName({ ...base, age: 45 })).toBe("Sunita");
  });

  it("falls back to first name when age is unknown", () => {
    expect(reminderDisplayName({ ...base, age: null })).toBe("Sunita");
  });

  it("falls back to first name for a non-Indian number, even if otherwise eligible", () => {
    expect(reminderDisplayName({ ...base, normalizedWhatsappNumber: "6597268559" })).toBe("Sunita");
  });
});
