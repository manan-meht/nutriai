import fs from "fs";
import path from "path";
import { guessTimezoneFromCountryCode, COMMON_TIMEZONES } from "@nutriai/nutrition-core";

// For a year the mobile app sent no timezone when creating a contact, so the
// column default (Asia/Kolkata) applied to everyone — 41 of 42 active
// contacts, including nine with Singapore numbers. Their lunches were
// logged as breakfast (12:30 in Singapore is 10:00 in Kolkata) and their
// reminders arrived two and a half hours late. The guess now lives in the
// shared package and the mobile API applies it whenever a client sends
// nothing.

const src = (p: string) => fs.readFileSync(path.join(__dirname, "..", "..", p), "utf-8");

describe("timezone guessed from a phone number", () => {
  it.each([
    ["+65 9123 4567", "Asia/Singapore"],
    ["6591234567", "Asia/Singapore"],
    ["+91 98765 43210", "Asia/Kolkata"],
    ["+44 7700 900123", "Europe/London"],
    ["+63 917 123 4567", "Asia/Manila"],
    ["+66 81 234 5678", "Asia/Bangkok"],
    ["+1 212 555 0100", "America/New_York"],
  ])("%s -> %s", (number, tz) => {
    expect(guessTimezoneFromCountryCode(number)).toBe(tz);
  });

  it("takes the longest matching calling code", () => {
    // 971 (UAE) must win over 97x prefixes and over the bare "1".
    expect(guessTimezoneFromCountryCode("+971 50 123 4567")).toBe("Asia/Dubai");
    expect(guessTimezoneFromCountryCode("852 9123 4567")).toBe("Asia/Hong_Kong");
  });

  it("falls back to India for an unknown code", () => {
    expect(guessTimezoneFromCountryCode("+999 1234")).toBe("Asia/Kolkata");
  });

  it("offers every guessed zone in the picker", () => {
    for (const number of ["+65", "+91", "+44", "+63", "+66", "+1", "+971", "+61"]) {
      expect(COMMON_TIMEZONES).toContain(guessTimezoneFromCountryCode(number));
    }
  });
});

describe("the mobile API never leaves the column default in charge", () => {
  it("guesses from the WhatsApp number when the client sends no timezone", () => {
    const t = src("apps/mobile-api/src/lib/adults.ts");
    expect(t).toMatch(/timezone: input\.timezone \|\| guessTimezoneFromCountryCode\(input\.whatsappNumber\)/);
    expect(t).not.toMatch(/\.\.\.\(input\.timezone \? \{ timezone: input\.timezone \} : \{\}\),\n\s*\.\.\.\(input\.remindersEnabled !== undefined[^\n]*\n\s*\.\.\.\(input\.reminderTimes[^\n]*\n\s*\}\)\n\s*\.select\("id"\)/);
  });

  it("the web app shares the same table rather than keeping its own copy", () => {
    const t = src("src/lib/reminders/timezone.ts");
    expect(t).toMatch(/from "@nutriai\/nutrition-core"/);
    expect(t).not.toMatch(/COUNTRY_CODE_TIMEZONES/);
  });
});
