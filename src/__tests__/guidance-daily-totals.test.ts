import {
  computeDailyTotals,
  nutrientValue,
  localDate,
  targetForDate,
  type ConfirmedMealRow,
} from "@/lib/guidance/daily-totals";

// Guidance tells someone how much is left to eat. Every rule here exists
// because getting it wrong changes that number in a direction that matters.

const TARGET = { caloriesKcal: 1800, proteinG: 110, carbsG: 205, fatG: 60, fiberG: 25 };

const meal = (over: Partial<ConfirmedMealRow> & { id: string; loggedAt: string }): ConfirmedMealRow => ({
  totalCaloriesMin: 400,
  totalCaloriesMax: 500,
  totalProteinMin: 20,
  totalProteinMax: 30,
  totalCarbsMin: 40,
  totalCarbsMax: 60,
  totalFatMin: 10,
  totalFatMax: 20,
  totalFiberMin: 4,
  totalFiberMax: 6,
  ...over,
});

describe("a missing nutrient is missing, not zero", () => {
  it("returns null when a meal reported neither bound", () => {
    expect(nutrientValue(null, null)).toBeNull();
  });

  it("does not average a single-sided range against zero", () => {
    // The existing macro-summary.ts coerces with (min ?? 0), so min=40 and
    // max=null yields 20 — half the value actually known.
    expect(nutrientValue(40, null)).toBe(40);
    expect(nutrientValue(null, 40)).toBe(40);
  });

  it("takes the midpoint when both bounds are present", () => {
    expect(nutrientValue(40, 60)).toBe(50);
  });

  it("excludes an unknown nutrient from the total and says the day is incomplete", () => {
    const totals = computeDailyTotals({
      date: "2026-10-09",
      timezone: "Asia/Kolkata",
      target: TARGET,
      meals: [
        meal({ id: "a", loggedAt: "2026-10-09T06:00:00Z", totalProteinMin: 20, totalProteinMax: 20 }),
        meal({ id: "b", loggedAt: "2026-10-09T08:00:00Z", totalProteinMin: null, totalProteinMax: null }),
      ],
    });
    // 20 from the known meal; the unknown one contributes nothing rather
    // than a zero that would read as "ate no protein".
    expect(totals.protein.consumed).toBe(20);
    expect(totals.protein.isIncomplete).toBe(true);
    expect(totals.protein.mealsMissingData).toBe(1);
    expect(totals.hasIncompleteData).toBe(true);
  });

  it("totals fiber like any other nutrient", () => {
    // Fiber came to meal_logs later than the macros (migration 0025), so
    // it is the column most likely to be null on an older row — and the
    // one the Food Balance Score leans on hardest.
    const totals = computeDailyTotals({
      date: "2026-10-09",
      timezone: "Asia/Kolkata",
      target: TARGET,
      meals: [
        meal({ id: "a", loggedAt: "2026-10-09T06:00:00Z" }),
        meal({ id: "b", loggedAt: "2026-10-09T08:00:00Z", totalFiberMin: null, totalFiberMax: null }),
      ],
    });
    expect(totals.fiber.target).toBe(25);
    expect(totals.fiber.consumed).toBe(5);
    expect(totals.fiber.remaining).toBe(20);
    expect(totals.fiber.mealsMissingData).toBe(1);
    expect(totals.hasIncompleteData).toBe(true);
  });

  it("is complete when every meal reported everything", () => {
    const totals = computeDailyTotals({
      date: "2026-10-09",
      timezone: "Asia/Kolkata",
      target: TARGET,
      meals: [meal({ id: "a", loggedAt: "2026-10-09T06:00:00Z" })],
    });
    expect(totals.hasIncompleteData).toBe(false);
    expect(totals.protein.mealsMissingData).toBe(0);
  });
});

describe("remaining never goes negative", () => {
  it("reports zero remaining and the excess separately once the target is passed", () => {
    const totals = computeDailyTotals({
      date: "2026-10-09",
      timezone: "Asia/Kolkata",
      target: TARGET,
      meals: [meal({ id: "a", loggedAt: "2026-10-09T06:00:00Z", totalCaloriesMin: 2000, totalCaloriesMax: 2000 })],
    });
    // A negative "remaining" reads as a debt, and a food target is not one.
    expect(totals.calories.consumed).toBe(2000);
    expect(totals.calories.remaining).toBe(0);
    expect(totals.calories.over).toBe(200);
  });

  it("reports no excess while under target", () => {
    const totals = computeDailyTotals({
      date: "2026-10-09",
      timezone: "Asia/Kolkata",
      target: TARGET,
      meals: [meal({ id: "a", loggedAt: "2026-10-09T06:00:00Z", totalCaloriesMin: 1000, totalCaloriesMax: 1000 })],
    });
    expect(totals.calories.remaining).toBe(800);
    expect(totals.calories.over).toBe(0);
  });

  it("a day with no meals is all remaining, and not incomplete", () => {
    const totals = computeDailyTotals({ date: "2026-10-09", timezone: "Asia/Kolkata", target: TARGET, meals: [] });
    expect(totals.mealCount).toBe(0);
    expect(totals.calories.consumed).toBe(0);
    expect(totals.calories.remaining).toBe(1800);
    // No meals is a known state, not missing data.
    expect(totals.hasIncompleteData).toBe(false);
  });
});

describe("days are the tracked person's days", () => {
  it("assigns a late-evening meal to the local date, not the UTC one", () => {
    // 20:00 UTC on the 8th is 01:30 on the 9th in Kolkata.
    const totals = computeDailyTotals({
      date: "2026-10-09",
      timezone: "Asia/Kolkata",
      target: TARGET,
      meals: [meal({ id: "a", loggedAt: "2026-10-08T20:00:00Z" })],
    });
    expect(totals.mealCount).toBe(1);
  });

  it("puts the same meal on different days for people in different zones", () => {
    const m = [meal({ id: "a", loggedAt: "2026-10-08T20:00:00Z" })];
    expect(computeDailyTotals({ date: "2026-10-09", timezone: "Asia/Kolkata", target: TARGET, meals: m }).mealCount).toBe(1);
    expect(computeDailyTotals({ date: "2026-10-08", timezone: "Europe/London", target: TARGET, meals: m }).mealCount).toBe(1);
  });

  it("ignores meals from other days in the supplied window", () => {
    const totals = computeDailyTotals({
      date: "2026-10-09",
      timezone: "Asia/Kolkata",
      target: TARGET,
      meals: [
        meal({ id: "a", loggedAt: "2026-10-09T06:00:00Z" }),
        meal({ id: "b", loggedAt: "2026-10-07T06:00:00Z" }),
      ],
    });
    expect(totals.mealCount).toBe(1);
  });

  it("keeps the meal rather than dropping it when the zone is unrecognised", () => {
    expect(localDate("2026-10-09T06:00:00Z", "Mars/Olympus_Mons")).toBe("2026-10-09");
  });
});

describe("history uses the target that applied then", () => {
  const targets = [
    { effectiveFrom: "2026-09-01", effectiveTo: "2026-10-01", caloriesKcal: 1700 },
    { effectiveFrom: "2026-10-01", effectiveTo: null, caloriesKcal: 1900 },
  ];

  it("picks the historical target for a past date", () => {
    // A past week is not retroactively improved by a later raise.
    expect(targetForDate(targets, "2026-09-15")?.caloriesKcal).toBe(1700);
  });

  it("picks the current target for today", () => {
    expect(targetForDate(targets, "2026-10-09")?.caloriesKcal).toBe(1900);
  });

  it("treats effectiveTo as exclusive, so the boundary day belongs to the new target", () => {
    expect(targetForDate(targets, "2026-10-01")?.caloriesKcal).toBe(1900);
    expect(targetForDate(targets, "2026-09-30")?.caloriesKcal).toBe(1700);
  });

  it("returns null before any target existed, which is a real state", () => {
    expect(targetForDate(targets, "2026-08-01")).toBeNull();
  });

  it("resolves an overlap to the later start rather than to row order", () => {
    const overlapping = [
      { effectiveFrom: "2026-09-01", effectiveTo: null, caloriesKcal: 1700 },
      { effectiveFrom: "2026-10-01", effectiveTo: null, caloriesKcal: 1900 },
    ];
    expect(targetForDate(overlapping, "2026-10-09")?.caloriesKcal).toBe(1900);
    expect(targetForDate([...overlapping].reverse(), "2026-10-09")?.caloriesKcal).toBe(1900);
  });
});

describe("corrections and deletions", () => {
  it("reflects a corrected meal rather than both versions", () => {
    // A correction updates the row in place (updateSavedMeal) — it never
    // writes a second meal_logs row — so the caller passing current rows
    // gets the corrected figure with no de-duplication needed here.
    const corrected = computeDailyTotals({
      date: "2026-10-09",
      timezone: "Asia/Kolkata",
      target: TARGET,
      meals: [meal({ id: "a", loggedAt: "2026-10-09T06:00:00Z", totalCaloriesMin: 300, totalCaloriesMax: 300 })],
    });
    expect(corrected.calories.consumed).toBe(300);
  });

  it("drops a deleted meal from the day", () => {
    expect(
      computeDailyTotals({ date: "2026-10-09", timezone: "Asia/Kolkata", target: TARGET, meals: [] }).calories.consumed
    ).toBe(0);
  });
});
