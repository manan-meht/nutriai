// The Progress tab's arithmetic (lib/guidance/aggregation.ts) and the data
// the redesigned Guidance tabs load. Every average, comparison and day
// status on screen comes from these functions, so the rules the redesign
// spec is strictest about are tested here: a missing log is never zero
// intake, a partial or unfinished day never enters an average, and too few
// comparable days gives "not enough data", not a percentage.

const mockFlags = { guidance: true };
jest.mock("@/lib/billing/feature-flags", () =>
  Object.defineProperty({ ...jest.requireActual("@/lib/billing/feature-flags") }, "GUIDANCE_ENABLED", {
    get: () => mockFlags.guidance,
    enumerable: true,
  })
);

import {
  compare,
  DEFAULT_MEALS_PER_DAY,
  daysIn,
  MIN_COMPARABLE_DAYS,
  nutrientStats,
  periodFor,
  summarizeDays,
  type DaySummary,
} from "@/lib/guidance/aggregation";
import { computeDailyTotals, type ConfirmedMealRow } from "@/lib/guidance/daily-totals";
import type { GuidanceDay } from "@/lib/guidance/meal-impact";
import { loadGuidanceDashboard } from "@/lib/guidance/view";

import { makeGuidanceDb, type GuidanceRows } from "./helpers/guidance-db";

const TZ = "Asia/Kolkata";
const target = { caloriesKcal: 2000, proteinG: 100, carbsG: 250, fatG: 65, fiberG: 30 };

function meal(id: string, loggedAt: string, kcal: number, protein: number, fiber: number | null = 6): ConfirmedMealRow {
  return {
    id,
    loggedAt,
    totalCaloriesMin: kcal,
    totalCaloriesMax: kcal,
    totalProteinMin: protein,
    totalProteinMax: protein,
    totalCarbsMin: 50,
    totalCarbsMax: 50,
    totalFatMin: 15,
    totalFatMax: 15,
    totalFiberMin: fiber,
    totalFiberMax: fiber,
  };
}

/** A day from meals at 08:00, 13:00 and 20:00 IST. */
function day(date: string, meals: Array<[number, number, (number | null)?]>, t = target): GuidanceDay {
  const hours = ["02:30", "07:30", "14:30", "16:30"];
  // An explicit null fiber means "no estimate"; leaving it out means 6 g.
  const rows = meals.map(([kcal, protein, fiber], i) =>
    meal(`${date}-${i}`, `${date}T${hours[i]}:00Z`, kcal, protein, fiber === undefined ? 6 : fiber)
  );
  return { date, loggedAt: `${date}T12:00:00`, totals: computeDailyTotals({ date, timezone: TZ, meals: rows, target: t }) };
}

describe("a day's status", () => {
  const days = summarizeDays(
    [
      day("2026-11-09", [[500, 30]]),
      day("2026-11-08", [[600, 30], [700, 35], [600, 30]]),
      day("2026-11-07", [[600, 30], [700, 35]]),
      day("2026-11-06", []),
    ],
    "2026-11-09",
    3
  );

  it("is complete with the usual number of meals, partial with fewer, and unlogged with none", () => {
    expect(days.map((d) => [d.date, d.status])).toEqual([
      ["2026-11-09", "in_progress"],
      ["2026-11-08", "complete"],
      ["2026-11-07", "partial"],
      ["2026-11-06", "unlogged"],
    ]);
  });

  it("is always in progress today, however much is logged", () => {
    const [today] = summarizeDays([day("2026-11-09", [[600, 30], [700, 35], [600, 30], [300, 10]])], "2026-11-09", 3);
    expect(today.status).toBe("in_progress");
  });

  it("uses the person's own meals-per-day answer when they gave one", () => {
    const [d] = summarizeDays([day("2026-11-07", [[600, 30], [700, 35]])], "2026-11-09", 2);
    expect(d.status).toBe("complete");
    expect(DEFAULT_MEALS_PER_DAY).toBe(3);
  });
});

describe("averages", () => {
  it("count only complete days: never unlogged, partial or today's", () => {
    const days = summarizeDays(
      [
        day("2026-11-09", [[400, 20]]), // today
        day("2026-11-08", [[600, 30], [700, 40], [700, 30]]), // 2000 kcal, 100 g
        day("2026-11-07", [[500, 20], [500, 20], [500, 20]]), // 1500 kcal, 60 g
        day("2026-11-06", [[300, 10]]), // partial
        day("2026-11-05", []), // unlogged
      ],
      "2026-11-09",
      3
    );
    const stats = nutrientStats(days, "protein");
    expect(stats).toMatchObject({
      usableDays: 2,
      average: 80,
      averageTarget: 100,
      counts: { complete: 2, partial: 1, unlogged: 1, in_progress: 1 },
    });
    // Unlogged and partial days pulled into the mean would have given 34 g.
  });

  it("treat a complete day missing this nutrient's estimate as partial for that nutrient only", () => {
    const days = summarizeDays(
      [
        day("2026-11-08", [[600, 30], [700, 40, null], [700, 30]]),
        day("2026-11-07", [[500, 20], [500, 20], [500, 20]]),
      ],
      "2026-11-09",
      3
    );
    expect(nutrientStats(days, "fiber")).toMatchObject({ usableDays: 1, average: 18, counts: { complete: 1, partial: 1 } });
    // Protein was estimated in every meal, so both days still count for it.
    expect(nutrientStats(days, "protein")).toMatchObject({ usableDays: 2, counts: { complete: 2, partial: 0 } });
  });

  it("are null rather than zero with no usable day", () => {
    const days = summarizeDays([day("2026-11-08", []), day("2026-11-07", [[300, 10]])], "2026-11-09", 3);
    expect(nutrientStats(days, "calories")).toMatchObject({ usableDays: 0, average: null, averageTarget: null });
  });

  it("average the target over the same days, so a target change mid-period compares like with like", () => {
    const days = summarizeDays(
      [
        day("2026-11-08", [[600, 30], [700, 40], [700, 30]], { ...target, proteinG: 120 }),
        day("2026-11-07", [[600, 30], [700, 40], [700, 30]]),
      ],
      "2026-11-09",
      3
    );
    expect(nutrientStats(days, "protein").averageTarget).toBe(110);
  });
});

describe("comparisons", () => {
  const stats = (usableDays: number, average: number | null) => ({
    nutrient: "protein" as const,
    counts: { complete: usableDays, partial: 0, unlogged: 0, in_progress: 0 },
    usableDays,
    average,
    averageTarget: 100,
  });

  it(`need ${MIN_COMPARABLE_DAYS} usable days on each side`, () => {
    expect(compare(stats(5, 90), stats(2, 70))).toEqual({ kind: "insufficient", currentDays: 5, previousDays: 2, required: 3 });
    expect(compare(stats(2, 90), stats(5, 70))).toMatchObject({ kind: "insufficient" });
  });

  it("report the change in units, with both denominators", () => {
    expect(compare(stats(4, 90), stats(6, 78))).toEqual({
      kind: "change",
      current: 90,
      previous: 78,
      delta: 12,
      currentDays: 4,
      previousDays: 6,
    });
  });
});

describe("periods", () => {
  it("run Monday to today for a week, against the full week before", () => {
    // Sunday 8 November 2026.
    expect(periodFor("week", "2026-11-08")).toEqual({
      kind: "week",
      start: "2026-11-02",
      end: "2026-11-08",
      lastDay: "2026-11-08",
      previous: { start: "2026-10-26", end: "2026-11-01" },
    });
    // Monday the 9th is the first day of its own week: "this week" is just
    // today, still in progress.
    expect(periodFor("week", "2026-11-09")).toMatchObject({
      start: "2026-11-09",
      end: "2026-11-09",
      lastDay: "2026-11-15",
      previous: { start: "2026-11-02", end: "2026-11-08" },
    });
  });

  it("run from the 1st for a month, against the whole previous month, across a year end", () => {
    expect(periodFor("month", "2026-11-09")).toMatchObject({
      start: "2026-11-01",
      end: "2026-11-09",
      lastDay: "2026-11-30",
      previous: { start: "2026-10-01", end: "2026-10-31" },
    });
    expect(periodFor("month", "2027-01-05")).toMatchObject({ start: "2027-01-01", previous: { start: "2026-12-01", end: "2026-12-31" } });
    expect(periodFor("month", "2028-03-01")).toMatchObject({ previous: { start: "2028-02-01", end: "2028-02-29" } });
  });

  it("select days by inclusive date range", () => {
    const days = summarizeDays([day("2026-11-02", []), day("2026-11-01", []), day("2026-10-26", [])], "2026-11-08", 3) as DaySummary[];
    const week = periodFor("week", "2026-11-08");
    expect(daysIn(days, week).map((d) => d.date)).toEqual(["2026-11-02"]);
    expect(daysIn(days, week.previous).map((d) => d.date)).toEqual(["2026-11-01", "2026-10-26"]);
  });
});

// ─── What the tabs load ────────────────────────────────────────────────────

const KAMLESH = "contact-kamlesh";
const RAVI = "client-ravi";
const now = new Date("2026-11-09T08:00:00Z");

function rows(): GuidanceRows {
  return {
    adults_contacts: [
      { id: KAMLESH, caregiver_id: "profile-manan", relationship_type: "family_caregiver", timezone: TZ, primary_nutrition_goal: "reduce_weight", nutrition_goals: null },
    ],
    gym_clients: [{ id: RAVI, trainer_id: "profile-coach", timezone: TZ, nutrition_goals: ["gain_muscle"] }],
    nutrition_policy_versions: [{ version: "v1-mifflin-2026-10", status: "unreviewed" }],
    nutrition_guidance: [
      { id: "g1", adults_contact_id: KAMLESH, mode: "guidance", activated_at: "2026-11-02T04:00:00Z", activated_via: "caregiver", meals_per_day: 4 },
      { id: "g2", gym_client_id: RAVI, mode: "guidance", activated_at: "2026-11-02T04:00:00Z", activated_via: "coach" },
    ],
    nutrition_guidance_screening: [],
    nutrition_targets: [
      { id: "t1", adults_contact_id: KAMLESH, effective_from: "2026-11-02", effective_to: null, policy_version: "v1-mifflin-2026-10", calories_kcal: 1436, protein_g: 70, carbs_g: 180, fat_g: 48, fiber_g: 25, explanation: "x" },
      { id: "t2", gym_client_id: RAVI, effective_from: "2026-11-02", effective_to: null, policy_version: "v1-mifflin-2026-10", calories_kcal: 2800, protein_g: 160, carbs_g: 340, fat_g: 80, fiber_g: 35, explanation: "y" },
    ],
    meal_logs: [
      { id: "old", adults_contact_id: KAMLESH, logged_at: "2026-10-30T07:00:00Z", meal_type: "lunch", foods: [], total_calories_min: 500, total_calories_max: 500 },
      { id: "a", adults_contact_id: KAMLESH, logged_at: "2026-11-08T07:00:00Z", meal_type: "lunch", foods: [{ name: "Dal" }], total_calories_min: 500, total_calories_max: 500 },
      { id: "b", adults_contact_id: KAMLESH, logged_at: "2026-11-09T03:00:00Z", meal_type: "breakfast", foods: [], total_calories_min: 300, total_calories_max: 300 },
    ],
    food_balance_weight_entries: [
      { contact_id: KAMLESH, contact_type: "adults_contact", measured_at: "2026-11-08T03:00:00Z", weight_kg: 71.8 },
      { contact_id: KAMLESH, contact_type: "adults_contact", measured_at: "2026-11-03T03:00:00Z", weight_kg: 72.4 },
      // Another person's reading, and a reading with no weight.
      { contact_id: "someone-else", contact_type: "adults_contact", measured_at: "2026-11-05T03:00:00Z", weight_kg: 90 },
      { contact_id: KAMLESH, contact_type: "adults_contact", measured_at: "2026-11-06T03:00:00Z", weight_kg: null },
    ],
    biomarker_logs: [{ client_id: RAVI, logged_at: "2026-11-04T05:00:00Z", weight_kg: 80.5 }],
  };
}

describe("what the Guidance tabs load", () => {
  const prevNumber = process.env.TISTRA_WHATSAPP_NUMBER;
  afterEach(() => {
    if (prevNumber === undefined) delete process.env.TISTRA_WHATSAPP_NUMBER;
    else process.env.TISTRA_WHATSAPP_NUMBER = prevNumber;
  });

  it("carries the meals, the person's own meals-per-day, their goals and dated weights", async () => {
    process.env.TISTRA_WHATSAPP_NUMBER = "+91 98000 00000";
    const g = await loadGuidanceDashboard(makeGuidanceDb(rows()), { contactId: KAMLESH, now });
    expect(g).toMatchObject({
      expectedMealsPerDay: 4,
      expectedMealsIsDefault: false,
      goals: ["reduce_weight"],
      logMealHref: "https://wa.me/919800000000",
      generatedAt: now.toISOString(),
    });
    // Newest first, and only since Guidance started: 30 Oct predates it.
    expect(g!.meals.map((m) => m.id)).toEqual(["b", "a"]);
    // Oldest first; another person's reading and the empty one are left out.
    expect(g!.weights).toEqual([
      { measuredAt: "2026-11-03T03:00:00Z", weightKg: 72.4 },
      { measuredAt: "2026-11-08T03:00:00Z", weightKg: 71.8 },
    ]);
  });

  it("falls back to the default meals per day, and has no log link without a number", async () => {
    delete process.env.TISTRA_WHATSAPP_NUMBER;
    const g = await loadGuidanceDashboard(makeGuidanceDb(rows()), { contactId: RAVI, contactType: "gym", now });
    expect(g).toMatchObject({ expectedMealsPerDay: 3, expectedMealsIsDefault: true, goals: ["gain_muscle"], logMealHref: null });
    // A coach client's weights come from the coach's biomarker log.
    expect(g!.weights).toEqual([{ measuredAt: "2026-11-04T05:00:00Z", weightKg: 80.5 }]);
  });

  it("gives every history day a status the tabs can show, with today in progress", async () => {
    const g = (await loadGuidanceDashboard(makeGuidanceDb(rows()), { contactId: KAMLESH, now }))!;
    const days = summarizeDays(g.history, g.date, g.expectedMealsPerDay);
    expect(days.find((d) => d.date === "2026-11-09")!.status).toBe("in_progress");
    expect(days.find((d) => d.date === "2026-11-08")!.status).toBe("partial");
    expect(days.find((d) => d.date === "2026-11-05")!.status).toBe("unlogged");
    // A week with no complete day has no average and no comparison.
    const week = nutrientStats(daysIn(days, periodFor("week", g.date)), "calories");
    expect(week).toMatchObject({ usableDays: 0, average: null });
  });
});
