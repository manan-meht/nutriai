// The micronutrient pipeline against an in-memory database: the flag keeps
// it out of production paths entirely, ingestion is idempotent, corrections
// replace in place, failures never throw, nothing private is logged, one
// person's facts and rows never reach another's, supplement doses can't be
// double-counted, and the period loader uses the person's own local days.
// Foreign-key cascades (deleting a meal deletes its estimate) are checked on
// a real Postgres, not here: see migration 0071's verification notes.

import { BACKFILL_HARD_LIMIT, backfillMealNutrients } from "@/lib/nutrients/backfill";
import { afterMealSaved, loadEstimates, recomputeAfterFactChange, recordMealNutrients } from "@/lib/nutrients/pipeline";
import { confirmSupplementDose, saveHouseholdFact, supplementTotalsByDate } from "@/lib/nutrients/store";
import { loadMicronutrientPeriod, loggingStatusFor } from "@/lib/nutrients/view";

import { makeNutrientsDb } from "./helpers/nutrients-db";

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const milk = [{ name: "Milk", quantity: "1 glass", estimated_cooked_weight_grams: "240g" }];
const dal = [{ name: "Dal", quantity: "1 katori", estimated_cooked_weight_grams: "200g" }];

const ENV = process.env.GUIDANCE_MICRONUTRIENTS_ENABLED;
beforeEach(() => {
  process.env.GUIDANCE_MICRONUTRIENTS_ENABLED = "true";
});
afterAll(() => {
  if (ENV === undefined) delete process.env.GUIDANCE_MICRONUTRIENTS_ENABLED;
  else process.env.GUIDANCE_MICRONUTRIENTS_ENABLED = ENV;
});

describe("recordMealNutrients", () => {
  it("does nothing, and touches no table, with the flag off", async () => {
    delete process.env.GUIDANCE_MICRONUTRIENTS_ENABLED;
    const { db, touched } = makeNutrientsDb();
    expect(await recordMealNutrients(db, { mealLogId: "m1", subject: { contactType: "adults", contactId: A }, foods: dal, trigger: "ingestion" })).toEqual({
      ok: false,
      reason: "disabled",
    });
    await afterMealSaved(db, { mealLogId: "m1", isAdults: true, entityId: A, analysis: { foods: dal }, trigger: "ingestion" });
    expect(touched).toEqual([]);
  });

  it("writes one estimate per meal, with its subject and versions", async () => {
    const { db, tables } = makeNutrientsDb();
    const r = await recordMealNutrients(db, { mealLogId: "m1", subject: { contactType: "gym", contactId: B }, foods: dal, trigger: "ingestion" });
    expect(r).toEqual({ ok: true, skipped: false, status: "complete" });
    expect(tables.meal_nutrient_estimates).toHaveLength(1);
    expect(tables.meal_nutrient_estimates[0]).toMatchObject({
      meal_log_id: "m1",
      adults_contact_id: null,
      gym_client_id: B,
      calculation_version: "micro-calc-v1",
      trigger: "ingestion",
      status: "complete",
    });
    expect((tables.meal_nutrient_estimates[0].composition_versions as Record<string, string>)["usda-fdc"]).toBeTruthy();
  });

  it("is idempotent: the same meal ingested twice is one row, the second a no-op", async () => {
    const { db, tables } = makeNutrientsDb();
    const subject = { contactType: "adults" as const, contactId: A };
    await recordMealNutrients(db, { mealLogId: "m1", subject, foods: dal, trigger: "ingestion" });
    const before = { ...tables.meal_nutrient_estimates[0] };
    const again = await recordMealNutrients(db, { mealLogId: "m1", subject, foods: dal, trigger: "ingestion" });
    expect(again).toMatchObject({ ok: true, skipped: true });
    expect(tables.meal_nutrient_estimates).toHaveLength(1);
    expect(tables.meal_nutrient_estimates[0].computed_at).toBe(before.computed_at);
  });

  it("replaces the estimate in place when the meal is corrected", async () => {
    const { db, tables } = makeNutrientsDb();
    const subject = { contactType: "adults" as const, contactId: A };
    await recordMealNutrients(db, { mealLogId: "m1", subject, foods: dal, trigger: "ingestion" });
    const firstHash = tables.meal_nutrient_estimates[0].input_hash;
    await recordMealNutrients(db, { mealLogId: "m1", subject, foods: [{ ...dal[0], estimated_cooked_weight_grams: "300g" }], trigger: "correction" });
    expect(tables.meal_nutrient_estimates).toHaveLength(1);
    expect(tables.meal_nutrient_estimates[0]).toMatchObject({ trigger: "correction" });
    expect(tables.meal_nutrient_estimates[0].input_hash).not.toBe(firstHash);
  });

  it("recomputes when a household fact changes", async () => {
    const { db, tables } = makeNutrientsDb({ meal_logs: [{ id: "m1", adults_contact_id: A, foods: milk, logged_at: "2026-11-05T03:00:00Z" }] });
    const subject = { contactType: "adults" as const, contactId: A };
    await recordMealNutrients(db, { mealLogId: "m1", subject, foods: milk, trigger: "ingestion" });
    const vdBefore = (tables.meal_nutrient_estimates[0].estimate as { nutrients: { vitamin_d: { state: string } } }).nutrients.vitamin_d;
    expect(vdBefore.state).toBe("partial");
    await saveHouseholdFact(db, subject, { key: "milk_fortified", answer: "yes", profileId: null, via: "caregiver" });
    expect(await recomputeAfterFactChange(db, subject, { sinceIso: "2026-11-01T00:00:00Z" })).toEqual({ recomputed: 1, failed: 0 });
    const est = tables.meal_nutrient_estimates[0];
    expect(est.trigger).toBe("fact_change");
    expect((est.estimate as { nutrients: { vitamin_d: { state: string } } }).nutrients.vitamin_d.state).toBe("value");
  });

  it("never throws on a failed write, and logs no food or personal details", async () => {
    const { db, failing } = makeNutrientsDb();
    failing.push("meal_nutrient_estimates.upsert");
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const r = await recordMealNutrients(db, {
      mealLogId: "m1",
      subject: { contactType: "adults", contactId: A },
      foods: [{ name: "Grandma's secret palak paneer", estimated_cooked_weight_grams: "200g" }],
      trigger: "ingestion",
    });
    expect(r).toEqual({ ok: false, reason: "error" });
    const logged = spy.mock.calls.flat().join(" ");
    expect(logged).not.toMatch(/palak|paneer|Grandma/i);
    expect(logged).not.toContain(A);
    spy.mockRestore();
  });

  it("never throws when a read fails either", async () => {
    const { db, failing } = makeNutrientsDb();
    failing.push("nutrition_household_facts.select");
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(afterMealSaved(db, { mealLogId: "m1", isAdults: true, entityId: A, analysis: { foods: dal }, trigger: "ingestion" })).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

describe("profile isolation", () => {
  it("one person's household facts never reach another's estimate", async () => {
    const { db, tables } = makeNutrientsDb();
    await saveHouseholdFact(db, { contactType: "adults", contactId: A }, { key: "milk_fortified", answer: "yes", profileId: null, via: "caregiver" });
    await recordMealNutrients(db, { mealLogId: "mB", subject: { contactType: "adults", contactId: B }, foods: milk, trigger: "ingestion" });
    const est = tables.meal_nutrient_estimates.find((r) => r.meal_log_id === "mB")!.estimate as { items: Array<{ components: Array<{ food: { key: string } }> }> };
    expect(est.items[0].components[0].food.key).toBe("milk_whole");
  });

  it("loads only the asking person's estimates, even given another's meal id", async () => {
    const { db } = makeNutrientsDb();
    await recordMealNutrients(db, { mealLogId: "mA", subject: { contactType: "adults", contactId: A }, foods: dal, trigger: "ingestion" });
    await recordMealNutrients(db, { mealLogId: "mB", subject: { contactType: "adults", contactId: B }, foods: dal, trigger: "ingestion" });
    const forB = await loadEstimates(db, { contactType: "adults", contactId: B }, ["mA", "mB"]);
    expect([...forB.keys()]).toEqual(["mB"]);
  });

  it("won't record a dose against someone else's supplement", async () => {
    const { db, tables } = makeNutrientsDb({
      supplement_schedules: [{ id: "s1", adults_contact_id: A, gym_client_id: null, name: "D3", nutrients_per_dose: { vitamin_d: 25 }, slots: ["morning"], effective_from: "2026-11-01" }],
    });
    expect(
      await confirmSupplementDose(db, { contactType: "adults", contactId: B }, { scheduleId: "s1", takenOn: "2026-11-02", slot: "morning", profileId: null, via: "caregiver" })
    ).toEqual({ ok: false, error: "schedule_not_found" });
    expect(tables.supplement_doses ?? []).toHaveLength(0);
  });
});

describe("supplements", () => {
  const schedule = { id: "s1", name: "D3", brand: null, nutrientsPerDose: { vitamin_d: 25 }, slots: ["morning"], effectiveFrom: "2026-11-01", effectiveTo: null };

  it("confirming the same dose twice records it once", async () => {
    const { db, tables } = makeNutrientsDb({
      supplement_schedules: [{ id: "s1", adults_contact_id: A, gym_client_id: null, name: "D3", nutrients_per_dose: { vitamin_d: 25 }, slots: ["morning"], effective_from: "2026-11-01" }],
    });
    const subject = { contactType: "adults" as const, contactId: A };
    const dose = { scheduleId: "s1", takenOn: "2026-11-02", slot: "morning", profileId: null, via: "caregiver" as const };
    expect(await confirmSupplementDose(db, subject, dose)).toEqual({ ok: true });
    expect(await confirmSupplementDose(db, subject, dose)).toEqual({ ok: true });
    expect(tables.supplement_doses).toHaveLength(1);
  });

  it("counts confirmed doses only; a schedule alone adds nothing", () => {
    const byDate = supplementTotalsByDate([schedule], [{ scheduleId: "s1", takenOn: "2026-11-02", slot: "morning", quantity: 2 }], ["2026-11-02", "2026-11-03", "2026-11-04"], "2026-11-04");
    expect(byDate.get("2026-11-02")).toEqual({ totals: { vitamin_d: 50 }, unconfirmed: 0 });
    expect(byDate.get("2026-11-03")).toEqual({ totals: {}, unconfirmed: 1 });
    // Today isn't over: nothing is "unconfirmed" yet.
    expect(byDate.get("2026-11-04")).toEqual({ totals: {}, unconfirmed: 0 });
  });
});

describe("loadMicronutrientPeriod", () => {
  const person = { sex: "female" as const, ageYears: 50, pregnant: false, lactating: false, whatsappNumber: "+919800000000" };
  const base = {
    contactType: "adults" as const,
    contactId: A,
    start: "2026-11-02",
    end: "2026-11-08",
    previous: { start: "2026-10-26", end: "2026-11-01" },
    timezone: "Asia/Kolkata",
    today: "2026-11-08",
    person,
    expectedMealsPerDay: 1,
  };

  it("is disabled, with no reads, when the flag is off", async () => {
    delete process.env.GUIDANCE_MICRONUTRIENTS_ENABLED;
    const { db, touched } = makeNutrientsDb();
    expect(await loadMicronutrientPeriod(db, base)).toEqual({ enabled: false });
    expect(touched).toEqual([]);
  });

  it("puts a meal on the person's local day, not the UTC day", async () => {
    // 19:00 UTC on 3 Nov is 00:30 on 4 Nov in India.
    const { db } = makeNutrientsDb({ meal_logs: [{ id: "late", adults_contact_id: A, foods: dal, logged_at: "2026-11-03T19:00:00Z" }] });
    await recordMealNutrients(db, { mealLogId: "late", subject: { contactType: "adults", contactId: A }, foods: dal, trigger: "ingestion" });
    const view = await loadMicronutrientPeriod(db, base);
    if (!view.enabled) throw new Error("expected enabled");
    expect(view.days.find((d) => d.date === "2026-11-04")!.meals).toHaveLength(1);
    expect(view.days.find((d) => d.date === "2026-11-03")!.meals).toHaveLength(0);
    expect(view.edition.id).toBe("icmr-nin-2020");
    expect(view.days.find((d) => d.date === "2026-11-08")!.loggingStatus).toBe("in_progress");
  });

  it("uses the shared day statuses when given, so skipped meals count the same everywhere", async () => {
    const { db } = makeNutrientsDb();
    const view = await loadMicronutrientPeriod(db, { ...base, loggingStatus: (d) => (d === "2026-11-05" ? "complete" : null) });
    if (!view.enabled) throw new Error("expected enabled");
    expect(view.days.find((d) => d.date === "2026-11-05")!.loggingStatus).toBe("complete");
    // Not given for this day: the meal-count fallback.
    expect(view.days.find((d) => d.date === "2026-11-06")!.loggingStatus).toBe("unlogged");
  });

  it("assesses every vitamin and mineral, with not enough information on an empty week", async () => {
    const { db } = makeNutrientsDb();
    const view = await loadMicronutrientPeriod(db, base);
    if (!view.enabled) throw new Error("expected enabled");
    expect(view.assessments).toHaveLength(11);
    expect(view.assessments.every((a) => a.status === "not_enough_information")).toBe(true);
    expect(view.likelyLowEnabled).toBe(false);
  });
});

describe("loggingStatusFor", () => {
  it("follows the meal-count rule", () => {
    expect(loggingStatusFor(3, "2026-11-08", "2026-11-08", 3)).toBe("in_progress");
    expect(loggingStatusFor(0, "2026-11-07", "2026-11-08", 3)).toBe("unlogged");
    expect(loggingStatusFor(2, "2026-11-07", "2026-11-08", 3)).toBe("partial");
    expect(loggingStatusFor(3, "2026-11-07", "2026-11-08", 3)).toBe("complete");
  });
});

describe("backfill", () => {
  const meals = Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, adults_contact_id: A, client_id: null, foods: dal, logged_at: `2026-11-0${i + 1}T06:00:00Z` }));

  it("writes nothing on a dry run", async () => {
    const { db, tables } = makeNutrientsDb({ meal_logs: meals });
    const r = await backfillMealNutrients(db, { limit: 10, dryRun: true });
    expect(r).toMatchObject({ dryRun: true, scanned: 5, written: 0, byStatus: { complete: 5, partial: 0, unknown: 0 } });
    expect(tables.meal_nutrient_estimates ?? []).toHaveLength(0);
  });

  it("writes missing estimates only, within its limit, without the feature flag", async () => {
    delete process.env.GUIDANCE_MICRONUTRIENTS_ENABLED;
    const { db, tables } = makeNutrientsDb({ meal_logs: meals });
    expect(await backfillMealNutrients(db, { limit: 2, dryRun: false })).toMatchObject({ scanned: 2, written: 2 });
    expect(await backfillMealNutrients(db, { limit: 10, dryRun: false })).toMatchObject({ scanned: 5, alreadyEstimated: 2, written: 3 });
    expect(tables.meal_nutrient_estimates).toHaveLength(5);
    expect(tables.meal_nutrient_estimates.every((r) => r.trigger === "backfill")).toBe(true);
  });

  it("covers one person only when given one, and no one else's meals", async () => {
    const other = { id: "o1", adults_contact_id: "someone-else", client_id: null, foods: dal, logged_at: "2026-11-03T06:00:00Z" };
    const { db, tables } = makeNutrientsDb({ meal_logs: [...meals, other] });
    const r = await backfillMealNutrients(db, { limit: 10, dryRun: false, subject: { contactType: "adults", contactId: A } });
    expect(r).toMatchObject({ scanned: 5, written: 5 });
    expect(tables.meal_nutrient_estimates.map((e) => e.meal_log_id)).not.toContain("o1");
  });

  it("caps any run at the hard limit", async () => {
    const many = Array.from({ length: BACKFILL_HARD_LIMIT + 20 }, (_, i) => ({ id: `x${i}`, adults_contact_id: A, client_id: null, foods: [], logged_at: "2026-11-01T06:00:00Z" }));
    const { db } = makeNutrientsDb({ meal_logs: many });
    const r = await backfillMealNutrients(db, { limit: 100_000, dryRun: true });
    expect(r.scanned).toBe(BACKFILL_HARD_LIMIT);
    // Meals with no stored foods can't be estimated: unknown, not zero.
    expect(r.byStatus.unknown).toBe(BACKFILL_HARD_LIMIT);
  });
});
