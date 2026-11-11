// Phase 2 of the Guidance redesign: the next-meal suggestion, planned meals,
// confirmed skipped meals and the weekly habit. The rules under test are the
// ones the spec is strict about: planning never counts as eating, a plan and
// the meal that fills it are never both counted, a skipped meal is not an
// unlogged one, the habit doesn't change with every photo, ambiguous meals
// aren't successes, and one person's rows never reach another's.

const mockFlags = { guidance: true };
jest.mock("@/lib/billing/feature-flags", () =>
  Object.defineProperty({ ...jest.requireActual("@/lib/billing/feature-flags") }, "GUIDANCE_ENABLED", {
    get: () => mockFlags.guidance,
    enumerable: true,
  })
);

import type { DietaryProfile } from "@/lib/dietary-profile/types";
import { periodFor, summarizeDays } from "@/lib/guidance/aggregation";
import type { GuidanceActor } from "@/lib/guidance/authorization";
import { computeDailyTotals } from "@/lib/guidance/daily-totals";
import { cancelPlan, confirmPlannedMeal, linkPlans, planMeal, setMealSkipped, type PlannedMeal } from "@/lib/guidance/day-plan";
import { chooseHabit, habitOptions, habitProgress } from "@/lib/guidance/habits";
import { guidanceHistory } from "@/lib/guidance/meal-impact";
import { effectiveSkips } from "@/lib/guidance/next-steps";
import { dietAllowances, mapAllergies, nextSlot, suggestMeals, type SuggestionInput } from "@/lib/guidance/suggestions";
import { loadGuidanceDashboard, type GuidanceMealRow } from "@/lib/guidance/view";

import { makeGuidanceDb, type GuidanceRows, type Row } from "./helpers/guidance-db";

const TZ = "Asia/Kolkata";
const KAMLESH = "contact-kamlesh";
const OTHER = "contact-other";
const CAREGIVER: GuidanceActor = { kind: "caregiver", profileId: "profile-manan" };
const STRANGER: GuidanceActor = { kind: "caregiver", profileId: "profile-stranger" };
// Monday 9 November 2026, 11:30 IST.
const now = new Date("2026-11-09T06:00:00Z");
const TODAY = "2026-11-09";

function mealRow(id: string, contact: string, loggedAt: string, type: string, kcal: number | null, protein: number | null, fiber: number | null = 5): Row {
  return {
    id,
    adults_contact_id: contact,
    logged_at: loggedAt,
    meal_type: type,
    foods: [{ name: type === "breakfast" ? "Paratha" : "Rice" }],
    total_calories_min: kcal,
    total_calories_max: kcal,
    total_protein_min: protein,
    total_protein_max: protein,
    total_carbs_min: 50,
    total_carbs_max: 50,
    total_fat_min: 15,
    total_fat_max: 15,
    total_fiber_min: fiber,
    total_fiber_max: fiber,
  };
}

function rows(extra: Partial<GuidanceRows> = {}): GuidanceRows {
  const guidance = (id: string, contact: string) => ({ id, adults_contact_id: contact, mode: "guidance", activated_at: "2026-10-26T04:00:00Z", activated_via: "caregiver" });
  const target = (id: string, contact: string) => ({
    id,
    adults_contact_id: contact,
    effective_from: "2026-10-26",
    effective_to: null,
    policy_version: "v1-mifflin-2026-10",
    calories_kcal: 1436,
    protein_g: 95,
    carbs_g: 170,
    fat_g: 48,
    fiber_g: 25,
    explanation: "x",
  });
  return {
    adults_contacts: [
      { id: KAMLESH, caregiver_id: "profile-manan", relationship_type: "family_caregiver", timezone: TZ, full_name: "Kamlesh Mehta", workspace_id: "ws-1" },
      { id: OTHER, caregiver_id: "profile-stranger", relationship_type: "family_caregiver", timezone: TZ, full_name: "Someone Else", workspace_id: "ws-2" },
    ],
    gym_clients: [],
    nutrition_policy_versions: [{ version: "v1-mifflin-2026-10", status: "unreviewed" }],
    nutrition_guidance: [guidance("g1", KAMLESH), guidance("g2", OTHER)],
    nutrition_guidance_screening: [],
    nutrition_targets: [target("t1", KAMLESH), target("t2", OTHER)],
    // Breakfast today at 08:10 IST.
    meal_logs: [mealRow("m-today-b", KAMLESH, "2026-11-09T02:40:00Z", "breakfast", 789, 30)],
    ...extra,
  };
}

beforeEach(() => {
  mockFlags.guidance = true;
});

// ─── Suggestions ────────────────────────────────────────────────────────────

const VEG_PROFILE = null;
const EGG_CHICKEN = {
  explicit_vegan: false,
  explicit_vegetarian: false,
  inferred_pattern: "mixed_diet_observed",
  observed_eggs: true,
  explicit_avoids_eggs: false,
  observed_chicken: true,
  explicit_avoids_chicken: false,
  observed_fish: false,
  explicit_avoids_fish: false,
  observed_red_meat: false,
  explicit_avoids_red_meat: false,
  explicit_avoids_dairy: false,
} as unknown as DietaryProfile;

function input(overrides: Partial<SuggestionInput> = {}): SuggestionInput {
  const meals = [{ id: "b", loggedAt: "2026-11-09T02:40:00Z", ...macro(789, 30, 4) }];
  return {
    date: TODAY,
    slot: "lunch",
    totals: computeDailyTotals({ date: TODAY, timezone: TZ, meals, target: { caloriesKcal: 1436, proteinG: 95, carbsG: 170, fatG: 48, fiberG: 25 } }),
    target: { caloriesKcal: 1436, proteinG: 95, fiberG: 25 },
    laterSlots: ["dinner"],
    plannedLater: { calories: 0, protein: 0 },
    lastLoggedSlot: "breakfast",
    diet: dietAllowances(EGG_CHICKEN),
    allergies: [],
    avoidedFoods: [],
    cookingAccess: "full_kitchen",
    usualFoods: ["Paratha", "egg bhurji", "dal", "rice"],
    ...overrides,
  };
}

function macro(kcal: number, protein: number, fiber: number) {
  return {
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

const foodsOf = (r: ReturnType<typeof suggestMeals>) => (r.kind === "options" ? r.options.flatMap((o) => o.components.map((c) => c.id)) : []);

describe("next-meal suggestions", () => {
  it("sizes a lunch to the share of what's left, with portions from the source's own gram weights", () => {
    const result = suggestMeals(input());
    if (result.kind !== "options") throw new Error(result.message);
    const best = result.options[0];
    // 647 kcal left for lunch and dinner; lunch's share is half.
    expect(best.estimate.calories).toBeGreaterThan(220);
    expect(best.estimate.calories).toBeLessThan(450);
    expect(best.components.every((c) => c.source.dataset.length > 0 && c.grams > 0)).toBe(true);
    const rice = result.options.flatMap((o) => o.components).find((c) => c.id === "rice" && c.portion === "½ cup cooked rice");
    if (rice) expect(rice.grams).toBe(79); // FDC: 1 cup cooked white rice = 158 g
    expect(best.headline).toBe("Make room for protein");
    expect(best.reason).toBe("A simple lunch to build on breakfast.");
  });

  it("offers each option around a different main food, with stable ids", () => {
    const a = suggestMeals(input());
    const b = suggestMeals(input());
    if (a.kind !== "options" || b.kind !== "options") throw new Error("expected options");
    expect(a.options.map((o) => o.id)).toEqual(b.options.map((o) => o.id));
    const mains = a.options.map((o) => o.components.find((c) => c.role === "protein" || c.role === "dal")!.id);
    expect(new Set(mains).size).toBe(mains.length);
  });

  it("suggests only vegetarian foods until it knows what the person eats, and says so", () => {
    const result = suggestMeals(input({ diet: dietAllowances(VEG_PROFILE) }));
    expect(foodsOf(result)).not.toEqual(expect.arrayContaining(["chicken"]));
    expect(foodsOf(result).some((f) => f === "chicken" || f === "eggs" || f === "fish")).toBe(false);
    expect(result.notes[0]).toMatch(/Vegetarian ideas only/);
  });

  it("leaves out foods for an allergy it recognises, and shows one it doesn't", () => {
    const result = suggestMeals(input({ diet: dietAllowances(VEG_PROFILE), allergies: ["Dairy", "kiwi"], avoidedFoods: ["rajma"] }));
    const foods = foodsOf(result);
    expect(foods).not.toContain("paneer");
    expect(foods).not.toContain("rajma");
    expect(result.notes).toContain('Check this against the allergy noted in setup: "kiwi".');
    expect(mapAllergies(["Peanuts", "none"]).tags.has("peanut")).toBe(true);
  });

  it("with no kitchen, suggests only what needs no cooking, or says there's nothing", () => {
    const breakfast = suggestMeals(input({ slot: "breakfast", laterSlots: ["lunch", "dinner"], totals: null, lastLoggedSlot: null, cookingAccess: "none" }));
    expect(foodsOf(breakfast).every((f) => ["curd", "sprouts", "toast", "banana", "papaya", "guava"].includes(f))).toBe(true);
    const lunch = suggestMeals(input({ cookingAccess: "none" }));
    expect(lunch.kind === "fallback" || foodsOf(lunch).every((f) => f === "salad")).toBe(true);
  });

  it("suggests nothing once the day's energy is about used, rather than a meal past the target", () => {
    const meals = [{ id: "b", loggedAt: "2026-11-09T02:40:00Z", ...macro(1350, 60, 10) }];
    const totals = computeDailyTotals({ date: TODAY, timezone: TZ, meals, target: { caloriesKcal: 1436, proteinG: 95, carbsG: 170, fatG: 48, fiberG: 25 } });
    const result = suggestMeals(input({ totals }));
    expect(result).toMatchObject({ kind: "fallback", reason: "target_reached" });
  });

  it("sets a meal already planned for later aside before sizing this one", () => {
    const free = suggestMeals(input({ laterSlots: [] }));
    const planned = suggestMeals(input({ laterSlots: [], plannedLater: { calories: 400, protein: 30 } }));
    if (free.kind !== "options" || planned.kind !== "options") throw new Error("expected options");
    expect(planned.options[0].estimate.calories!).toBeLessThan(free.options[0].estimate.calories!);
  });

  it("favours a vitamin or mineral gap between meals that fit equally, and says so only for a meaningful amount", () => {
    const plain = suggestMeals(input());
    const calcium = suggestMeals(input({ priority: { nutrient: "calcium", reference: 1000 } }));
    if (plain.kind !== "options" || calcium.kind !== "options") throw new Error("expected options");
    expect(plain.options[0].brings ?? null).toBeNull();
    const amount = (o: (typeof calcium.options)[number]) => o.brings?.amount ?? 0;
    expect(Math.max(...calcium.options.map(amount))).toBeGreaterThanOrEqual(100);
    for (const o of calcium.options) {
      if (o.brings) {
        expect(o.brings).toMatchObject({ nutrient: "calcium", label: "Calcium", unit: "mg" });
        expect(o.brings.amount).toBeGreaterThanOrEqual(100);
      }
    }
    // Energy still decides: the calcium-favoured option stays inside the
    // same energy band as the plain one.
    expect(Math.abs(calcium.options[0].estimate.calories! - plain.options[0].estimate.calories!)).toBeLessThan(250);
  });

  it("picks the next meal by the clock, skipping meals already logged or skipped", () => {
    const base = { today: TODAY, tomorrow: "2026-11-10", includeSnack: false };
    expect(nextSlot({ ...base, hour: 8, done: new Set() })).toEqual({ date: TODAY, slot: "breakfast" });
    expect(nextSlot({ ...base, hour: 8, done: new Set(["breakfast"]) })).toEqual({ date: TODAY, slot: "lunch" });
    expect(nextSlot({ ...base, hour: 16, done: new Set(["breakfast", "lunch"]) })).toEqual({ date: TODAY, slot: "dinner" });
    expect(nextSlot({ ...base, hour: 21, done: new Set(["dinner"]) })).toEqual({ date: "2026-11-10", slot: "breakfast" });
  });
});

// ─── Plans ──────────────────────────────────────────────────────────────────

async function dashboardFor(db: ReturnType<typeof makeGuidanceDb>, contactId = KAMLESH) {
  const d = await loadGuidanceDashboard(db, { contactId, now });
  if (!d?.nextSteps?.nextMeal || d.nextSteps.nextMeal.suggestions.kind !== "options") throw new Error("expected suggestions");
  return { dashboard: d, next: d.nextSteps.nextMeal, option: d.nextSteps.nextMeal.suggestions.options[0] };
}

describe("planned meals", () => {
  it("never adds a plan to the day's totals", async () => {
    const data = rows();
    const db = makeGuidanceDb(data);
    const before = await dashboardFor(db);
    expect(before.next).toMatchObject({ date: TODAY, slot: "lunch", plan: null });

    const result = await planMeal(db, { contactId: KAMLESH, actor: CAREGIVER, date: before.next.date, suggestion: before.option, now });
    expect(result.ok).toBe(true);

    const after = await dashboardFor(db);
    expect(after.dashboard.today!.totals).toEqual(before.dashboard.today!.totals);
    expect(after.next.plan).toMatchObject({ slot: "lunch", logged: null, plannedVia: "caregiver" });
    expect(data.nutrition_meal_plans).toHaveLength(1);
  });

  it("keeps one live plan per meal: planning again replaces it", async () => {
    const data = rows();
    const db = makeGuidanceDb(data);
    const { next, option } = await dashboardFor(db);
    await planMeal(db, { contactId: KAMLESH, actor: CAREGIVER, date: next.date, suggestion: option, now });
    await planMeal(db, { contactId: KAMLESH, actor: CAREGIVER, date: next.date, suggestion: option, now });
    expect(data.nutrition_meal_plans!.map((p) => p.status)).toEqual(["cancelled", "planned"]);
  });

  it("logs a confirmed plan once, as one meal, and refuses to log it again", async () => {
    const data = rows();
    const db = makeGuidanceDb(data);
    const { next, option } = await dashboardFor(db);
    const plan = await planMeal(db, { contactId: KAMLESH, actor: CAREGIVER, date: next.date, suggestion: option, now });
    if (!plan.ok) throw new Error("plan failed");

    const first = await confirmPlannedMeal(db, { contactId: KAMLESH, actor: CAREGIVER, planId: plan.planId, now });
    expect(first.ok).toBe(true);
    const logged = data.meal_logs.filter((m) => m.source === "guidance_plan");
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ adults_contact_id: KAMLESH, meal_type: "lunch", total_calories_min: option.estimate.calories, workspace_id: "ws-1" });

    const again = await confirmPlannedMeal(db, { contactId: KAMLESH, actor: CAREGIVER, planId: plan.planId, now });
    expect(again).toMatchObject({ ok: false, kind: "invalid", message: "This meal is already logged." });
    expect(data.meal_logs.filter((m) => m.source === "guidance_plan")).toHaveLength(1);

    // Counted once: the day's energy rose by the plan's estimate, not twice.
    const after = await loadGuidanceDashboard(db, { contactId: KAMLESH, now });
    expect(after!.today!.totals.calories.consumed).toBe(789 + option.estimate.calories!);
  });

  it("refuses 'I had this' when a photo already filled the planned meal", async () => {
    const data = rows();
    const db = makeGuidanceDb(data);
    const { next, option } = await dashboardFor(db);
    const plan = await planMeal(db, { contactId: KAMLESH, actor: CAREGIVER, date: next.date, suggestion: option, now });
    if (!plan.ok) throw new Error("plan failed");
    data.meal_logs.push(mealRow("m-photo-lunch", KAMLESH, "2026-11-09T05:50:00Z", "lunch", 600, 35));

    const result = await confirmPlannedMeal(db, { contactId: KAMLESH, actor: CAREGIVER, planId: plan.planId, now });
    expect(result).toMatchObject({ ok: false, kind: "invalid", message: "This meal is already logged." });
  });

  it("links a plan to the meal that filled it, and unlinks it if that meal is deleted or moved", () => {
    const plan: PlannedMeal = { id: "p1", date: TODAY, slot: "lunch", suggestion: {} as never, mealLogId: null, plannedVia: "caregiver", createdAt: "" };
    const lunch = { id: "x", loggedAt: "2026-11-09T07:00:00Z", mealType: "lunch" };
    expect(linkPlans([plan], [lunch], TZ).get("p1")?.id).toBe("x");
    expect(linkPlans([plan], [], TZ).size).toBe(0);
    expect(linkPlans([plan], [{ ...lunch, mealType: "dinner" }], TZ).size).toBe(0);
    // One meal fills one plan at most.
    const plan2 = { ...plan, id: "p2" };
    expect(linkPlans([plan, plan2], [lunch], TZ).size).toBe(1);
  });

  it("refuses someone else's plan, and a stranger", async () => {
    const data = rows();
    const db = makeGuidanceDb(data);
    const { next, option } = await dashboardFor(db);
    expect(await planMeal(db, { contactId: KAMLESH, actor: STRANGER, date: next.date, suggestion: option, now })).toMatchObject({
      ok: false,
      kind: "forbidden",
    });
    const other = await planMeal(db, { contactId: OTHER, actor: STRANGER, date: next.date, suggestion: option, now });
    if (!other.ok) throw new Error("expected the other caregiver's plan to save");
    // Kamlesh's caregiver can't cancel or confirm it by id.
    expect(await cancelPlan(db, { contactId: KAMLESH, actor: CAREGIVER, planId: other.planId })).toMatchObject({ ok: false, kind: "not_found" });
    expect(await confirmPlannedMeal(db, { contactId: KAMLESH, actor: CAREGIVER, planId: other.planId, now })).toMatchObject({ ok: false, kind: "not_found" });
    // And it never shows on Kamlesh's screen.
    const kamlesh = await loadGuidanceDashboard(db, { contactId: KAMLESH, now });
    expect(kamlesh!.nextSteps!.nextMeal!.plan).toBeNull();
  });

  it("plans only for today or tomorrow, and not while the release gate is closed", async () => {
    const db = makeGuidanceDb(rows());
    const { option } = await dashboardFor(db);
    expect(await planMeal(db, { contactId: KAMLESH, actor: CAREGIVER, date: "2026-11-08", suggestion: option, now })).toMatchObject({ ok: false, kind: "invalid" });
    mockFlags.guidance = false;
    expect(await planMeal(db, { contactId: KAMLESH, actor: CAREGIVER, date: TODAY, suggestion: option, now })).toMatchObject({ ok: false, kind: "unavailable" });
  });
});

// ─── Skipped meals ─────────────────────────────────────────────────────────

const day = (date: string, mealCount: number) =>
  guidanceHistory({
    from: date,
    to: date,
    timezone: TZ,
    meals: Array.from({ length: mealCount }, (_, i) => ({ id: `${date}-${i}`, loggedAt: `${date}T0${3 + i}:00:00Z`, ...macro(500, 20, 5) })),
    targets: [{ caloriesKcal: 1436, proteinG: 95, carbsG: 170, fatG: 48, fiberG: 25, effectiveFrom: "2026-10-26", effectiveTo: null }],
  })[0];

describe("confirmed skipped meals", () => {
  it("complete a day that an unlogged meal would leave partial, without adding intake", () => {
    const d = day("2026-11-05", 2);
    expect(summarizeDays([d], TODAY, 3)[0]).toMatchObject({ status: "partial", skipped: 0 });
    const [withSkip] = summarizeDays([d], TODAY, 3, [{ date: "2026-11-05" }]);
    expect(withSkip).toMatchObject({ status: "complete", skipped: 1 });
    expect(withSkip.totals.calories.consumed).toBe(1000);
  });

  it("leave a day with every meal skipped and nothing logged partial, not a zero-intake day", () => {
    const d = day("2026-11-05", 0);
    expect(summarizeDays([d], TODAY, 3, [{ date: "2026-11-05" }, { date: "2026-11-05" }, { date: "2026-11-05" }])[0].status).toBe("partial");
  });

  it("drop a skip once a meal is logged in that slot", () => {
    const meals = [{ id: "a", loggedAt: "2026-11-05T07:00:00Z", mealType: "lunch", foods: [], ...macro(500, 20, 5) }] as GuidanceMealRow[];
    const skips = [
      { date: "2026-11-05", slot: "lunch" as const, confirmedVia: "caregiver" as const },
      { date: "2026-11-05", slot: "dinner" as const, confirmedVia: "caregiver" as const },
    ];
    expect(effectiveSkips(skips, meals, TZ).map((s) => s.slot)).toEqual(["dinner"]);
  });

  it("are saved once however often they're tapped, can be taken back, and only for the past week", async () => {
    const data = rows();
    const db = makeGuidanceDb(data);
    const skip = (date: string, skipped = true) => setMealSkipped(db, { contactId: KAMLESH, actor: CAREGIVER, date, slot: "dinner", skipped, now });
    expect(await skip("2026-11-08")).toEqual({ ok: true });
    expect(await skip("2026-11-08")).toEqual({ ok: true });
    expect(data.nutrition_meal_skips).toHaveLength(1);
    expect(data.nutrition_meal_skips![0]).toMatchObject({ confirmed_via: "caregiver", meal_slot: "dinner" });
    expect(await skip("2026-11-08", false)).toEqual({ ok: true });
    expect(data.nutrition_meal_skips).toHaveLength(0);
    expect(await skip("2026-10-20")).toMatchObject({ ok: false, kind: "invalid" });
    expect(await skip("2026-11-10")).toMatchObject({ ok: false, kind: "invalid" });
    expect(await setMealSkipped(db, { contactId: KAMLESH, actor: STRANGER, date: "2026-11-08", slot: "dinner", skipped: true, now })).toMatchObject({
      ok: false,
      kind: "forbidden",
    });
  });
});

// ─── Weekly habit ──────────────────────────────────────────────────────────

/** Fourteen days before 9 November with three logged meals each; breakfast
 * protein as given. */
function lookbackMeals(breakfastProtein: (i: number) => number | null): GuidanceMealRow[] {
  const out: GuidanceMealRow[] = [];
  for (let i = 1; i <= 14; i++) {
    const date = new Date(Date.parse("2026-11-09T12:00:00Z") - i * 86_400_000).toISOString().slice(0, 10);
    out.push({ id: `b${i}`, loggedAt: `${date}T02:30:00Z`, mealType: "breakfast", foods: [{ name: "egg bhurji", quantity: null }], ...macro(400, 0, 4), totalProteinMin: breakfastProtein(i), totalProteinMax: breakfastProtein(i) });
    out.push({ id: `l${i}`, loggedAt: `${date}T07:30:00Z`, mealType: "lunch", foods: [], ...macro(500, 30, 9) });
    out.push({ id: `d${i}`, loggedAt: `${date}T14:30:00Z`, mealType: "dinner", foods: [], ...macro(500, 30, 9) });
  }
  return out;
}

function summariesFor(meals: GuidanceMealRow[], today = TODAY) {
  const history = guidanceHistory({
    from: "2026-10-26",
    to: today,
    timezone: TZ,
    meals,
    targets: [{ caloriesKcal: 1436, proteinG: 95, carbsG: 170, fatG: 48, fiberG: 25, effectiveFrom: "2026-10-26", effectiveTo: null }],
  });
  return summarizeDays(history, today, 3);
}

describe("the weekly habit", () => {
  const diet = dietAllowances(EGG_CHICKEN);
  const weekStart = periodFor("week", TODAY).start;

  it("is proposed from meals before the week, with the observation behind it", () => {
    const meals = lookbackMeals(() => 10);
    const [top] = habitOptions({ meals, summaries: summariesFor(meals), weekStart, timezone: TZ, target: { protein: 95, fiber: 25 }, diet });
    expect(top.key).toBe("protein_breakfast");
    expect(top.evidence.observation).toBe("14 of 14 logged breakfasts had under 15 g of protein.");
    expect(top.change.standard).toBe("Next time you have egg bhurji, try adding one extra egg.");
    expect(top.change.easier).toBe("Add one boiled egg to breakfast on the days you can.");
  });

  it("doesn't change with photos logged during the week", () => {
    const meals = lookbackMeals(() => 10);
    const before = habitOptions({ meals, summaries: summariesFor(meals), weekStart, timezone: TZ, target: { protein: 95, fiber: 25 }, diet });
    const during = [
      ...meals,
      { id: "new", loggedAt: "2026-11-09T02:30:00Z", mealType: "breakfast", foods: [], ...macro(400, 40, 4) } as GuidanceMealRow,
    ];
    const after = habitOptions({ meals: during, summaries: summariesFor(during), weekStart, timezone: TZ, target: { protein: 95, fiber: 25 }, diet });
    expect(after).toEqual(before);
  });

  it("asks for complete days first when too few were logged", () => {
    const meals = lookbackMeals(() => 10).slice(0, 4);
    const [top] = habitOptions({ meals, summaries: summariesFor(meals), weekStart, timezone: TZ, target: { protein: 95, fiber: 25 }, diet });
    expect(top.key).toBe("log_every_meal");
  });

  it("suggests no protein habit when protein is already at target on complete days", () => {
    const meals = lookbackMeals(() => 40);
    const options = habitOptions({ meals, summaries: summariesFor(meals), weekStart, timezone: TZ, target: { protein: 95, fiber: 25 }, diet });
    expect(options.map((o) => o.key)).not.toContain("protein_breakfast");
  });

  it("counts only meals with a clear result: a breakfast with no protein estimate isn't a success", () => {
    const meals: GuidanceMealRow[] = [
      { id: "a", loggedAt: "2026-11-09T02:30:00Z", mealType: "breakfast", foods: [], ...macro(400, 24, 4) },
      { id: "b", loggedAt: "2026-11-10T02:30:00Z", mealType: "breakfast", foods: [], ...macro(400, 12, 4) },
      { id: "c", loggedAt: "2026-11-11T02:30:00Z", mealType: "breakfast", foods: [], ...macro(400, 0, 4), totalProteinMin: null, totalProteinMax: null },
      { id: "d", loggedAt: "2026-11-11T07:30:00Z", mealType: "lunch", foods: [], ...macro(400, 40, 4) },
    ];
    const p = habitProgress({ key: "protein_breakfast", variant: "standard", meals, summaries: [], weekStart, today: "2026-11-12", timezone: TZ });
    expect(p).toEqual({ eligible: 2, successes: 1, unclear: 1, marks: [true, false], noun: "breakfasts" });
    const easier = habitProgress({ key: "protein_breakfast", variant: "easier", meals, summaries: [], weekStart, today: "2026-11-12", timezone: TZ });
    expect(easier.successes).toBe(1); // 12 g is still under the easier 15 g
  });

  it("is stored once per week, replaced by a new choice, and only for this week or next", async () => {
    const data = rows();
    const db = makeGuidanceDb(data);
    const choose = (week: string, key: "protein_breakfast" | "fibre_lunch", actor = CAREGIVER) =>
      chooseHabit(db, { contactId: KAMLESH, actor, weekStart: week, key, variant: "standard", evidence: null, now });
    expect(await choose(weekStart, "protein_breakfast")).toEqual({ ok: true });
    expect(await choose(weekStart, "fibre_lunch")).toEqual({ ok: true });
    expect(data.nutrition_habits!.map((h) => [h.habit_key, h.status])).toEqual([
      ["protein_breakfast", "replaced"],
      ["fibre_lunch", "active"],
    ]);
    expect(await choose("2026-11-16", "fibre_lunch")).toEqual({ ok: true });
    expect(await choose("2026-11-23", "fibre_lunch")).toMatchObject({ ok: false, kind: "invalid" });
    expect(await choose(weekStart, "fibre_lunch", STRANGER)).toMatchObject({ ok: false, kind: "forbidden" });
  });

  it("shows the chosen habit and its progress on the dashboard", async () => {
    const data = rows({
      nutrition_habits: [
        { id: "h1", adults_contact_id: KAMLESH, week_start: weekStart, habit_key: "protein_breakfast", habit_version: "v", variant: "standard", status: "active", chosen_via: "caregiver", evidence: { observation: "5 of 6 logged breakfasts had under 15 g of protein.", looked: 6, low: 5, from: "2026-10-26", to: "2026-11-08" } },
      ],
    });
    const dashboard = await loadGuidanceDashboard(makeGuidanceDb(data), { contactId: KAMLESH, now });
    expect(dashboard!.nextSteps!.habit.current).toMatchObject({
      key: "protein_breakfast",
      evidence: { observation: "5 of 6 logged breakfasts had under 15 g of protein." },
      progress: { eligible: 1, successes: 1, unclear: 0 },
      keptForNextWeek: false,
    });
  });
});
