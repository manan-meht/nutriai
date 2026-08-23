import { statedMealType, resolveMealLabel } from "@/lib/ai/food-analyzer";
import fs from "fs";
import path from "path";

// Changing a meal's type by replying to the bot.
//
// A real user replied "This is my snack" to a dinner logged at 8pm and was
// told "I've updated dinner". Her answer was not misunderstood — it was
// discarded: resolveMealLabel took the meal type as an argument and then
// returned the time-of-day default regardless, for everything except
// drinks.

const src = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf-8");

const EIGHT_PM_IST = new Date("2026-08-23T14:30:00.000Z");

describe("what the person says wins over the clock", () => {
  it("relabels a dinner as a snack when they say so", () => {
    expect(resolveMealLabel("snack", EIGHT_PM_IST, "Asia/Kolkata")).toBe("dinner");
    expect(resolveMealLabel("snack", EIGHT_PM_IST, "Asia/Kolkata", { userStated: true })).toBe("snack");
  });

  it("still defaults by time when the MODEL guessed the type", () => {
    // The default exists for a reason: the model guessing "breakfast" from
    // a photo of eggs at 9pm is usually wrong.
    expect(resolveMealLabel("breakfast", EIGHT_PM_IST, "Asia/Kolkata")).toBe("dinner");
  });

  it("leaves drinks alone either way", () => {
    // A tea is a tea whatever the hour.
    expect(resolveMealLabel("tea", EIGHT_PM_IST, "Asia/Kolkata")).toBe("tea");
    expect(resolveMealLabel("coffee", EIGHT_PM_IST, "Asia/Kolkata", { userStated: true })).toBe("coffee");
  });
});

describe("recognising a meal type in the person's own words", () => {
  it.each([
    ["This is my snack", "snack"],
    ["this is a snack", "snack"],
    ["it's my snack", "snack"],
    ["change it to snack", "snack"],
    ["mark as breakfast", "breakfast"],
    ["make it lunch", "lunch"],
    ["Actually it's dinner", "dinner"],
    ["snack", "snack"],
  ])("reads %j as %s", (text, expected) => {
    expect(statedMealType(text)).toBe(expected);
  });

  it.each([
    ["the rice was half a cup"],
    ["no this is fish not chicken"],
    ["I skipped breakfast today"],
  ])("does not relabel on %j", (text) => {
    // A false positive relabels a meal nobody asked to relabel, which is
    // worse than missing one — so a passing mention must not match.
    expect(statedMealType(text)).toBeNull();
  });

  it("takes the meal being labelled, not one merely mentioned", () => {
    expect(statedMealType("I had a snack earlier, this is dinner")).toBe("dinner");
  });

  it("handles empty input", () => {
    expect(statedMealType("")).toBeNull();
    expect(statedMealType(null)).toBeNull();
    expect(statedMealType(undefined)).toBeNull();
  });
});

describe("the correction path uses it", () => {
  it("passes what the person wrote into the label decision", () => {
    const t = src("lib/whatsapp/conversation-handler.ts");
    expect(t).toMatch(/statedMealType: statedMealType\(correctionText\)/);
    expect(t).toMatch(/resolveMealLabel\(opts\.statedMealType, new Date\(\), contactTimezone, \{ userStated: true \}\)/);
  });
});
