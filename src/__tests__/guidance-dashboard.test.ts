// Guidance mode outside its own screen: the dashboards (today meal by meal,
// history against target) and the WhatsApp replies (the meal in full, the
// day against the target, what's left). The gate is tested here too: none
// of it may show while the release gate is closed, which is production's
// state until the target policy is reviewed.

const mockFlags = { guidance: true };
jest.mock("@/lib/billing/feature-flags", () =>
  Object.defineProperty({ ...jest.requireActual("@/lib/billing/feature-flags") }, "GUIDANCE_ENABLED", {
    get: () => mockFlags.guidance,
    enumerable: true,
  })
);

import { buildAutoSaveMessage, buildCorrectionUpdateMessage, type FoodAnalysisResult } from "@/lib/ai/food-analyzer";
import type { ConfirmedMealRow } from "@/lib/guidance/daily-totals";
import { guidanceHistory, mealImpacts, mealValues } from "@/lib/guidance/meal-impact";
import { loadGuidanceContactIds, loadGuidanceDashboard } from "@/lib/guidance/view";
import {
  formatBalanceLine,
  formatTargetLines,
  formatThisMeal,
  loadWhatsAppGuidance,
  mealRowFrom,
  totalsToday,
  totalsWith,
} from "@/lib/guidance/whatsapp";

import { makeGuidanceDb, type GuidanceRows } from "./helpers/guidance-db";

const TZ = "Asia/Kolkata";
const target = { caloriesKcal: 1890, proteinG: 95, carbsG: 230, fatG: 63, fiberG: 30 };

function meal(id: string, loggedAt: string, kcal: number | null, protein: number | null, fiber: number | null = 5): ConfirmedMealRow {
  return {
    id,
    loggedAt,
    totalCaloriesMin: kcal,
    totalCaloriesMax: kcal,
    totalProteinMin: protein,
    totalProteinMax: protein,
    totalCarbsMin: 50,
    totalCarbsMax: 50,
    totalFatMin: 20,
    totalFatMax: 20,
    totalFiberMin: fiber,
    totalFiberMax: fiber,
  };
}

/** Production, as release.ts recognises it. */
async function inProduction<T>(fn: () => Promise<T>): Promise<T> {
  const prevEnv = process.env.NODE_ENV;
  const prevTistra = process.env.NEXT_PUBLIC_TISTRA_ENV;
  try {
    Object.defineProperty(process.env, "NODE_ENV", { value: "production", configurable: true });
    delete process.env.NEXT_PUBLIC_TISTRA_ENV;
    return await fn();
  } finally {
    Object.defineProperty(process.env, "NODE_ENV", { value: prevEnv, configurable: true });
    if (prevTistra !== undefined) process.env.NEXT_PUBLIC_TISTRA_ENV = prevTistra;
  }
}

beforeEach(() => {
  mockFlags.guidance = true;
});

describe("each meal against the day", () => {
  // 08:30, 13:15 and 20:00 IST on the 2nd; the last is 01:00 IST on the 3rd.
  const breakfast = meal("b", "2026-11-02T03:00:00Z", 500, 20);
  const lunch = meal("l", "2026-11-02T07:45:00Z", 700, 35, null);
  const dinner = meal("d", "2026-11-02T14:30:00Z", 800, 30);
  const nextDay = meal("n", "2026-11-02T19:30:00Z", 300, 10);

  it("lists the day's meals in the order eaten, each with the running total after it", () => {
    const impacts = mealImpacts({ date: "2026-11-02", timezone: TZ, meals: [dinner, nextDay, lunch, breakfast], target });
    expect(impacts.map((i) => i.meal.id)).toEqual(["b", "l", "d"]);
    expect(impacts.map((i) => i.after.calories.remaining)).toEqual([1390, 690, 0]);
    expect(impacts[2].after.calories.over).toBe(110);
    expect(impacts[1].after.protein.consumed).toBe(55);
  });

  it("keeps a missing value unknown rather than zero, and says the total is a floor from then on", () => {
    const impacts = mealImpacts({ date: "2026-11-02", timezone: TZ, meals: [breakfast, lunch, dinner], target });
    expect(impacts[1].values.fiber).toBeNull();
    expect(impacts[0].after.fiber.isIncomplete).toBe(false);
    expect(impacts[1].after.fiber.isIncomplete).toBe(true);
    expect(mealValues(breakfast)).toEqual({ calories: 500, protein: 20, carbs: 50, fat: 20, fiber: 5 });
  });
});

describe("history against the target", () => {
  const targets = [
    { ...target, effectiveFrom: "2026-10-30", effectiveTo: "2026-11-01" },
    // A new target from the 1st.
    { ...target, caloriesKcal: 1700, effectiveFrom: "2026-11-01", effectiveTo: null },
  ];

  it("judges each day against the target that applied that day, newest first", () => {
    const days = guidanceHistory({
      from: "2026-10-29",
      to: "2026-11-02",
      timezone: TZ,
      meals: [meal("a", "2026-10-30T07:00:00Z", 1500, 70), meal("b", "2026-11-02T07:00:00Z", 900, 40)],
      targets,
    });
    // The 29th had no target, so it isn't a Guidance day at all.
    expect(days.map((d) => d.date)).toEqual(["2026-11-02", "2026-11-01", "2026-10-31", "2026-10-30"]);
    expect(days[0].totals.calories).toMatchObject({ target: 1700, consumed: 900 });
    expect(days[3].totals.calories).toMatchObject({ target: 1890, consumed: 1500 });
  });

  it("shows a day with nothing logged as nothing eaten against the target", () => {
    const days = guidanceHistory({ from: "2026-10-31", to: "2026-10-31", timezone: TZ, meals: [], targets });
    expect(days[0].totals).toMatchObject({ mealCount: 0, calories: { consumed: 0, remaining: 1890 } });
  });

  it("files a late meal under the local day it was eaten, not the UTC one", () => {
    // 19:30 UTC on the 1st is 01:00 on the 2nd in Kolkata.
    const days = guidanceHistory({
      from: "2026-11-01",
      to: "2026-11-02",
      timezone: TZ,
      meals: [meal("late", "2026-11-01T19:30:00Z", 400, 10)],
      targets,
    });
    expect(days.find((d) => d.date === "2026-11-02")!.totals.mealCount).toBe(1);
    expect(days.find((d) => d.date === "2026-11-01")!.totals.mealCount).toBe(0);
  });

  it("gives every day a loggedAt the dashboard's date filter can use", () => {
    const [day] = guidanceHistory({ from: "2026-11-02", to: "2026-11-02", timezone: TZ, meals: [], targets });
    expect(day.loggedAt).toBe("2026-11-02T12:00:00");
  });
});

// ─── Loaders, against the shared in-memory tables ───────────────────────────

const KAMLESH = "contact-kamlesh";
const RAVI = "client-ravi";
const now = new Date("2026-11-02T08:00:00Z");

function rows(): GuidanceRows {
  return {
    adults_contacts: [{ id: KAMLESH, caregiver_id: "profile-manan", relationship_type: "family_caregiver", timezone: TZ, full_name: "Kamlesh Mehta" }],
    gym_clients: [{ id: RAVI, trainer_id: "profile-coach", timezone: TZ, full_name: "Ravi" }],
    nutrition_policy_versions: [{ version: "v1-mifflin-2026-10", status: "unreviewed" }],
    nutrition_guidance: [
      { id: "g1", adults_contact_id: KAMLESH, mode: "guidance", activated_at: "2026-10-31T04:00:00Z", activated_via: "caregiver" },
      { id: "g2", gym_client_id: RAVI, mode: "guidance", activated_at: "2026-11-01T04:00:00Z", activated_via: "coach" },
    ],
    nutrition_guidance_screening: [],
    nutrition_targets: [
      { id: "t1", adults_contact_id: KAMLESH, effective_from: "2026-10-31", effective_to: null, policy_version: "v1-mifflin-2026-10", calories_kcal: 1890, protein_g: 95, carbs_g: 230, fat_g: 63, fiber_g: 30, explanation: "x" },
      { id: "t2", gym_client_id: RAVI, effective_from: "2026-11-01", effective_to: null, policy_version: "v1-mifflin-2026-10", calories_kcal: 2800, protein_g: 160, carbs_g: 340, fat_g: 80, fiber_g: 35, explanation: "y" },
    ],
    meal_logs: [
      { id: "m1", adults_contact_id: KAMLESH, logged_at: "2026-11-02T03:00:00Z", meal_type: "breakfast", foods: [{ name: "Poha", quantity: "1 plate" }, { name: "Chai", visible_quantity: "1 cup" }], total_calories_min: 380, total_calories_max: 420, total_protein_min: 8, total_protein_max: 12, total_carbs_min: 60, total_carbs_max: 70, total_fat_min: 10, total_fat_max: 14, total_fiber_min: 3, total_fiber_max: 5 },
      { id: "m0", adults_contact_id: KAMLESH, logged_at: "2026-10-31T07:00:00Z", meal_type: "lunch", foods: [], total_calories_min: 900, total_calories_max: 900, total_protein_min: 40, total_protein_max: 40, total_carbs_min: 100, total_carbs_max: 100, total_fat_min: 30, total_fat_max: 30, total_fiber_min: 10, total_fiber_max: 10 },
      { id: "r1", client_id: RAVI, logged_at: "2026-11-02T02:00:00Z", meal_type: "breakfast", foods: [{ name: "Oats" }], total_calories_min: 500, total_calories_max: 500, total_protein_min: 30, total_protein_max: 30, total_carbs_min: 70, total_carbs_max: 70, total_fat_min: 12, total_fat_max: 12, total_fiber_min: 8, total_fiber_max: 8 },
    ],
  };
}

describe("the dashboard in Guidance mode", () => {
  it("shows today meal by meal, with what was eaten, and every day since Guidance started", async () => {
    const dashboard = await loadGuidanceDashboard(makeGuidanceDb(rows()), { contactId: KAMLESH, now });
    expect(dashboard).not.toBeNull();
    if (!dashboard?.today) throw new Error("expected today");

    expect(dashboard).toMatchObject({ date: "2026-11-02", timezone: TZ, isPreviewOnly: true });
    expect(dashboard.today.meals).toHaveLength(1);
    expect(dashboard.today.meals[0].meal).toMatchObject({
      mealType: "breakfast",
      foods: [
        { name: "Poha", quantity: "1 plate" },
        { name: "Chai", quantity: "1 cup" },
      ],
    });
    expect(dashboard.today.totals.calories).toMatchObject({ consumed: 400, remaining: 1490 });
    expect(dashboard.history.map((d) => d.date)).toEqual(["2026-11-02", "2026-11-01", "2026-10-31"]);
    expect(dashboard.history[2].totals.calories.consumed).toBe(900);
  });

  it("reads a coach client's meals from client_id", async () => {
    const dashboard = await loadGuidanceDashboard(makeGuidanceDb(rows()), { contactId: RAVI, contactType: "gym", now });
    expect(dashboard?.today?.totals.calories).toMatchObject({ target: 2800, consumed: 500 });
    expect(dashboard?.today?.meals[0].meal.foods).toEqual([{ name: "Oats", quantity: null }]);
  });

  it("stays a Tracking dashboard when the flag is off, the gate is closed, or the person is in Tracking", async () => {
    mockFlags.guidance = false;
    expect(await loadGuidanceDashboard(makeGuidanceDb(rows()), { contactId: KAMLESH, now })).toBeNull();
    mockFlags.guidance = true;

    // Production with the policy unreviewed: exactly today's real state.
    expect(await inProduction(() => loadGuidanceDashboard(makeGuidanceDb(rows()), { contactId: KAMLESH, now }))).toBeNull();

    const tracking = rows();
    tracking.nutrition_guidance[0].mode = "tracking";
    expect(await loadGuidanceDashboard(makeGuidanceDb(tracking), { contactId: KAMLESH, now })).toBeNull();
  });
});

describe("the family overview in Guidance mode", () => {
  it("knows which people are in Guidance, so their cards drop the Food Balance Score", async () => {
    const r = rows();
    r.adults_contacts.push({ id: "contact-other", caregiver_id: "profile-manan", relationship_type: "self", timezone: TZ });
    expect(await loadGuidanceContactIds(makeGuidanceDb(r), [KAMLESH, "contact-other"])).toEqual([KAMLESH]);
  });

  it("is empty while the gate is closed", async () => {
    expect(await inProduction(() => loadGuidanceContactIds(makeGuidanceDb(rows()), [KAMLESH]))).toEqual([]);
    mockFlags.guidance = false;
    expect(await loadGuidanceContactIds(makeGuidanceDb(rows()), [KAMLESH])).toEqual([]);
  });
});

describe("WhatsApp in Guidance mode", () => {
  it("loads today's meals and target, behind the same gate", async () => {
    const guidance = await loadWhatsAppGuidance(makeGuidanceDb(rows()), { contactId: KAMLESH, contactType: "adults", now });
    expect(guidance).toMatchObject({ date: "2026-11-02", target: { caloriesKcal: 1890 } });
    // The 31st's lunch is outside the 48-hour window and not today anyway.
    expect(guidance?.mealsToday.map((m) => m.id)).toEqual(["m1"]);

    expect(
      await inProduction(() => loadWhatsAppGuidance(makeGuidanceDb(rows()), { contactId: KAMLESH, contactType: "adults", now }))
    ).toBeNull();
  });

  it("counts a newly saved meal once, and a corrected meal in place of the old version", async () => {
    const guidance = (await loadWhatsAppGuidance(makeGuidanceDb(rows()), { contactId: KAMLESH, contactType: "adults", now }))!;
    const lunch = mealRowFrom(
      { total_calories_min: 600, total_calories_max: 600, total_protein_min: 30, total_protein_max: 30, total_carbs_min: 80, total_carbs_max: 80, total_fat_min: 20, total_fat_max: 20, total_fiber_min: 6, total_fiber_max: 6 },
      "m2",
      "2026-11-02T07:30:00Z"
    );
    expect(totalsWith(guidance, lunch).calories.consumed).toBe(1000);

    // A correction to breakfast: replaced, not added, and still breakfast's time.
    const correctedBreakfast = { ...lunch, id: "m1", loggedAt: "2026-11-02T07:59:00Z" };
    const totals = totalsWith(guidance, correctedBreakfast);
    expect(totals.calories.consumed).toBe(600);
    expect(totals.mealCount).toBe(1);
    expect(totalsToday(guidance).calories.consumed).toBe(400);
  });

  it("writes the meal and the day as plain numbers", () => {
    expect(formatThisMeal(meal("x", "2026-11-02T07:00:00Z", 520, 24, null))).toBe(
      "This meal: 520 kcal · 24 g protein · 50 g carbs · 20 g fat · fiber unknown"
    );

    const totals = totalsWith(
      { date: "2026-11-02", timezone: TZ, target, mealsToday: [meal("a", "2026-11-02T03:00:00Z", 1520, 72)] },
      { ...meal("b", "2026-11-02T07:00:00Z", 0, 0, null), totalFatMin: 51, totalFatMax: 51 }
    );
    const lines = formatTargetLines(totals);
    expect(lines).toContain("Today vs your target:");
    expect(lines).toContain("Calories 1,520 / 1,890 kcal · 370 kcal left");
    // Fat 20 + 51 against 63.
    expect(lines).toContain("Fat 71 / 63 g · 8 g over");
    expect(lines).toContain("Fiber at least 5 / 30 g · 25 g left");
  });

  it("fits what's left on one line, for the reminder template", () => {
    const totals = totalsWith(
      { date: "2026-11-02", timezone: TZ, target, mealsToday: [] },
      { ...meal("a", "2026-11-02T03:00:00Z", 770, 35), totalFatMin: 71, totalFatMax: 71 }
    );
    const line = formatBalanceLine(totals);
    expect(line).toBe("Left for today: 1,120 kcal · 60 g protein · 180 g carbs · fat 8 g over · 25 g fiber");
    expect(line).not.toMatch(/\n/);
  });
});

describe("the meal reply builders", () => {
  const analysis = {
    meal_type: "lunch",
    foods: [{ name: "Dal", quantity: "1 bowl" }, { name: "Rice", quantity: "1 cup" }],
    total_calories_min: 480, total_calories_max: 560,
    total_protein_min: 20, total_protein_max: 28,
    total_carbs_min: 70, total_carbs_max: 80,
    total_fat_min: 10, total_fat_max: 14,
    total_fiber_min: 6, total_fiber_max: 10,
    summary: "dal rice", confidence: "high",
  } as unknown as FoodAnalysisResult;
  const decision = { confidenceLevel: "high", hasHighImpactAmbiguity: false, shouldAutoSave: true, shouldAskClarification: false } as never;
  const guidanceLines = { thisMeal: "This meal: 520 kcal · 24 g protein", today: "Today vs your target:\nCalories 1,520 / 1,890 kcal · 370 kcal left" };

  it("reports instead of coaching when Guidance is on", () => {
    const msg = buildAutoSaveMessage(analysis, "lunch" as never, decision, {
      seed: "s",
      timezone: TZ,
      dailyTotals: { protein: 40, calories: 900, carbs: 100, fat: 30, targetProteinG: 95 },
      guidance: guidanceLines,
    });
    expect(msg).toContain("Dal");
    expect(msg).toContain(guidanceLines.thisMeal);
    expect(msg).toContain(guidanceLines.today);
    // The Tracking estimate and "Today so far" are replaced, not repeated.
    expect(msg).not.toContain("Estimated:");
    expect(msg).not.toContain("Today so far");
    // Corrections still work the same way.
    expect(msg).toContain("Undo");
  });

  it("is unchanged without Guidance", () => {
    const msg = buildAutoSaveMessage(analysis, "lunch" as never, decision, { seed: "s", timezone: TZ });
    expect(msg).toContain("Estimated:");
    expect(msg).not.toContain("Today vs your target");
  });

  it("reports a correction against the day too", () => {
    expect(buildCorrectionUpdateMessage("lunch" as never, analysis, guidanceLines)).toBe(
      `Thanks for the correction — I've updated lunch.\n\n${guidanceLines.thisMeal}\n\n${guidanceLines.today}`
    );
    expect(buildCorrectionUpdateMessage("lunch" as never, analysis)).toContain("New estimate:");
  });
});
