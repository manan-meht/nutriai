import { computeRollingWeekMealCount, computeMacroWindowSummaries } from "../macro-summary";

const TZ = "Asia/Kolkata";

function mealAt(isoDate: string) {
  return {
    logged_at: `${isoDate}T12:00:00.000Z`,
    total_calories_min: 100,
    total_calories_max: 200,
    total_protein_min: 10,
    total_protein_max: 20,
    total_carbs_min: 10,
    total_carbs_max: 20,
    total_fat_min: 5,
    total_fat_max: 10,
  };
}

describe("computeRollingWeekMealCount — true rolling 7 days, not Monday-reset", () => {
  it("counts meals within the trailing 7 days (inclusive of today)", () => {
    // "now" = Wednesday 2026-01-14. Rolling window: 2026-01-08..2026-01-14.
    const now = new Date("2026-01-14T18:00:00.000Z");
    const meals = [
      mealAt("2026-01-08"), // oldest day still in window
      mealAt("2026-01-10"),
      mealAt("2026-01-14"), // today
    ];
    expect(computeRollingWeekMealCount(meals, TZ, now)).toBe(3);
  });

  it("excludes a meal exactly 8 days old", () => {
    const now = new Date("2026-01-14T18:00:00.000Z");
    const meals = [mealAt("2026-01-06")]; // 8 days before 01-14
    expect(computeRollingWeekMealCount(meals, TZ, now)).toBe(0);
  });

  it("does not reset on a Monday boundary the way the calendar-week summary does", () => {
    // "now" = Tuesday 2026-01-13. A meal from the prior Thursday
    // (2026-01-08) is 5 days old — inside the rolling window, but would be
    // excluded from computeMacroWindowSummaries' Monday-start calendar week
    // (which only covers 2026-01-12 onward).
    const now = new Date("2026-01-13T12:00:00.000Z");
    const meals = [mealAt("2026-01-08")];

    expect(computeRollingWeekMealCount(meals, TZ, now)).toBe(1);
    expect(computeMacroWindowSummaries(meals, TZ, now).week.mealCount).toBe(0);
  });

  it("returns 0 for no meals", () => {
    expect(computeRollingWeekMealCount([], TZ, new Date("2026-01-14T12:00:00.000Z"))).toBe(0);
  });
});
