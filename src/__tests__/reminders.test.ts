import { guessTimezoneFromCountryCode } from "@/lib/reminders/timezone";
import { getLocalDateAndTime, isReminderDue } from "@/lib/reminders/schedule";
import { buildReminderMessage } from "@/lib/reminders/messages";

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

describe("buildReminderMessage", () => {
  it("includes the person's first name", () => {
    expect(buildReminderMessage("Priya")).toContain("Priya");
  });
});
