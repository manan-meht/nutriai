// Period assessments (src/lib/nutrients/assessment.ts). What must hold:
// only fully logged, well-covered days count; today and unlogged days never
// do; too little data gives "not enough information", not a judgement;
// "likely low" never appears without a configured rule; upper limits are
// form-aware; schedules aren't intake; and the concerns shown are few,
// ranked and deduplicated.

import {
  ASSESSMENT_CONFIG,
  assessMicronutrients,
  dayNutrient,
  nextClarification,
  periodStats,
  topConcerns,
  trendFor,
  type AssessInput,
  type DayInput,
  type MicronutrientAssessment,
} from "@/lib/nutrients/assessment";
import { ALL_NUTRIENT_KEYS, MICRO_KEYS, type NutrientKey } from "@/lib/nutrients/catalog";
import { CALCULATION_VERSION, sumComponents, type ComponentEstimate, type MealEstimate } from "@/lib/nutrients/meal-estimate";
import { resolveReferences } from "@/lib/nutrients/references";

function component(key: string, grams: number, amounts: Partial<Record<NutrientKey, number>>, opts: { unknownAll?: boolean; floors?: NutrientKey[] } = {}): ComponentEstimate {
  const known = opts.unknownAll ? {} : amounts;
  return {
    name: key,
    grams,
    food: opts.unknownAll ? null : { id: `test:${key}`, key, sourceId: "test", sourceVersion: "t1", dataset: "test", description: key, state: "cooked" },
    product: null,
    approximate: false,
    stateMismatch: false,
    amounts: known,
    trace: [],
    unknown: ALL_NUTRIENT_KEYS.filter((k) => known[k] == null),
    floors: opts.floors ?? [],
  };
}

function meal(components: ComponentEstimate[], reasons: MealEstimate["reasons"] = []): MealEstimate {
  return {
    calculationVersion: CALCULATION_VERSION,
    catalogVersion: "c",
    recipesVersion: "r",
    compositionVersions: {},
    status: "complete",
    items: [{ name: "item", grams: 100, gramsBasis: "analysis_grams", origin: "matched", recipe: null, components, reasons, nutrients: sumComponents(components) }],
    nutrients: sumComponents(components),
    reasons,
  };
}

/** A fully logged day: three meals, each with one food. */
function fullDay(date: string, amounts: Partial<Record<NutrientKey, number>>, extra: Partial<DayInput> = {}): DayInput {
  const third = Object.fromEntries(Object.entries(amounts).map(([k, v]) => [k, (v as number) / 3]));
  return {
    date,
    loggingStatus: "complete",
    meals: [1, 2, 3].map((i) => meal([component(`food${i}`, 200, third)])),
    supplementDoses: {},
    unconfirmedScheduledDoses: 0,
    ...extra,
  };
}

const WEEK = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"];
const LAST_WEEK = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"];
const refs = resolveReferences({ sex: "female", ageYears: 40, market: "other", pregnant: false, lactating: false }, MICRO_KEYS);

function input(days: DayInput[], extra: Partial<AssessInput> = {}): AssessInput {
  return { period: { start: WEEK[0], end: WEEK[6] }, days, previousDays: [], references: refs, household: {}, ...extra };
}
const find = (list: MicronutrientAssessment[], n: string) => list.find((a) => a.nutrient === n)!;

describe("dayNutrient", () => {
  it("counts a complete, covered day", () => {
    const d = dayNutrient(fullDay(WEEK[0], { iron: 12 }), "iron");
    expect(d).toMatchObject({ documented: true, food: 12, foodIsFloor: false, coverage: 1 });
  });

  it("never counts today, an unlogged day or a partial day", () => {
    expect(dayNutrient(fullDay(WEEK[0], { iron: 12 }, { loggingStatus: "in_progress" }), "iron")).toMatchObject({ documented: false, excludedBecause: "in_progress" });
    expect(dayNutrient({ date: WEEK[0], loggingStatus: "unlogged", meals: [], supplementDoses: {}, unconfirmedScheduledDoses: 0 }, "iron")).toMatchObject({
      documented: false,
      food: null,
    });
    expect(dayNutrient(fullDay(WEEK[0], { iron: 12 }, { loggingStatus: "partial" }), "iron").excludedBecause).toBe("not_complete");
  });

  it("doesn't count a day with a meal that has no estimate", () => {
    const day = fullDay(WEEK[0], { iron: 12 });
    day.meals[1] = null;
    expect(dayNutrient(day, "iron")).toMatchObject({ documented: false, excludedBecause: "meal_without_estimate", foodIsFloor: true });
  });

  it("doesn't count a day where too little of the food has a value, and marks a covered-but-not-fully day as a floor", () => {
    const low: DayInput = { ...fullDay(WEEK[0], {}), meals: [meal([component("a", 100, { iron: 3 }), component("b", 300, {}, { unknownAll: true })])] };
    expect(dayNutrient(low, "iron")).toMatchObject({ documented: false, excludedBecause: "low_coverage", coverage: 0.25 });
    const mostly: DayInput = { ...fullDay(WEEK[0], {}), meals: [meal([component("a", 900, { iron: 10 }), component("b", 100, {}, { unknownAll: true })])] };
    expect(dayNutrient(mostly, "iron")).toMatchObject({ documented: true, coverage: 0.9, foodIsFloor: true });
  });
});

describe("assessMicronutrients", () => {
  it("says not enough information with fewer than the minimum documented days", () => {
    const a = assessMicronutrients(input([fullDay(WEEK[0], { iron: 20 }), fullDay(WEEK[1], { iron: 20 })]));
    const iron = find(a, "iron");
    expect(iron.status).toBe("not_enough_information");
    expect(iron.days).toEqual({ documented: 2, total: 2 });
    expect(iron.observation).toMatch(/Only 2 of 2 days/);
    expect(iron.percentOfReference).not.toBeNull();
  });

  it("is within range when the documented average reaches the RDA", () => {
    const a = assessMicronutrients(input(WEEK.slice(0, 4).map((d) => fullDay(d, { iron: 21 }))));
    expect(find(a, "iron")).toMatchObject({ status: "within_range", total: 21, percentOfReference: 117 });
  });

  it("is a neutral below-reference comparison, never a deficiency", () => {
    const a = assessMicronutrients(input(WEEK.slice(0, 4).map((d) => fullDay(d, { iron: 9 }))));
    const iron = find(a, "iron");
    expect(iron.status).toBe("below_reference");
    expect(iron.observation).toMatch(/about 50% of the 18 mg reference/);
    expect(`${iron.observation} ${iron.explanation}`).not.toMatch(/deficien|you need|supplement/i);
  });

  it("says an AI isn't a requirement when it's the reference", () => {
    const a = assessMicronutrients(input(WEEK.slice(0, 4).map((d) => fullDay(d, { potassium: 1500 }))));
    expect(find(a, "potassium").explanation).toMatch(/doesn't mean intake is inadequate/);
  });

  it("excludes today and unlogged days from the average: missing is not zero", () => {
    const days = [
      ...WEEK.slice(0, 3).map((d) => fullDay(d, { iron: 21 })),
      { date: WEEK[3], loggingStatus: "unlogged" as const, meals: [], supplementDoses: {}, unconfirmedScheduledDoses: 0 },
      fullDay(WEEK[4], { iron: 1 }, { loggingStatus: "in_progress" }),
    ];
    const iron = find(assessMicronutrients(input(days)), "iron");
    expect(iron.total).toBe(21);
    expect(iron.days).toEqual({ documented: 3, total: 5 });
  });

  it("says no reliable source when no single serving gave 10% of the reference", () => {
    // B12 reference 2.4 µg; every serving under 0.24 µg.
    const days = WEEK.slice(0, 4).map((d) => fullDay(d, { vitamin_b12: 0.6 }));
    const b12 = find(assessMicronutrients(input(days, { household: { supplements_in_routine: "no" } })), "vitamin_b12");
    expect(b12.status).toBe("no_reliable_source");
    expect(b12.nextStep.kind).toBe("food");
  });

  it("asks about supplements before claiming anything, when that's unknown", () => {
    const days = WEEK.slice(0, 4).map((d) => fullDay(d, { vitamin_b12: 0.6 }));
    const b12 = find(assessMicronutrients(input(days)), "vitamin_b12");
    expect(b12.nextStep).toMatchObject({ kind: "clarify", key: "supplements_in_routine" });
  });

  it("checks the magnesium upper limit against supplements only", () => {
    const foodOnly = WEEK.slice(0, 4).map((d) => fullDay(d, { magnesium: 500 }));
    expect(find(assessMicronutrients(input(foodOnly)), "magnesium").status).toBe("within_range");
    const withSupplement = WEEK.slice(0, 4).map((d) => fullDay(d, { magnesium: 200 }, { supplementDoses: { magnesium: 400 } }));
    const mg = find(assessMicronutrients(input(withSupplement)), "magnesium");
    expect(mg.status).toBe("above_upper_limit");
    expect(mg.observation).toMatch(/from supplements/);
  });

  it("checks the folate upper limit against folic acid only", () => {
    const foodFolate = WEEK.slice(0, 4).map((d) => fullDay(d, { folate: 1500, folic_acid: 0 }));
    expect(find(assessMicronutrients(input(foodFolate)), "folate").status).toBe("within_range");
    const supplement = WEEK.slice(0, 4).map((d) => fullDay(d, { folate: 400, folic_acid: 0 }, { supplementDoses: { folate: 1700, folic_acid: 1000 * 1.2 } }));
    expect(find(assessMicronutrients(input(supplement)), "folate").status).toBe("above_upper_limit");
  });

  it("doesn't call vitamin A within a safe range when the retinol form is unknown", () => {
    // Plenty of vitamin A, but no retinol values: the UL can't be checked.
    const days = WEEK.slice(0, 4).map((d) => fullDay(d, { vitamin_a: 4000 }));
    const a = find(assessMicronutrients(input(days)), "vitamin_a");
    expect(a.status).toBe("within_range");
    expect(a.explanation).toMatch(/upper limit applies to preformed retinol only, which isn't known/);
  });

  it("counts confirmed supplement doses separately and never schedules", () => {
    const days = WEEK.slice(0, 4).map((d) => fullDay(d, { vitamin_d: 3 }, { supplementDoses: { vitamin_d: 25 }, unconfirmedScheduledDoses: 1 }));
    const vd = find(assessMicronutrients(input(days)), "vitamin_d");
    expect(vd.food.average).toBe(3);
    expect(vd.supplements.average).toBe(25);
    expect(vd.total).toBe(28);
    expect(vd.supplements.unconfirmedScheduledDoses).toBe(4);
    expect(vd.explanation).toMatch(/4 scheduled supplement doses weren't confirmed and aren't counted/);
  });

  it("keeps iodine unknown and asks about iodised salt", () => {
    const io = find(assessMicronutrients(input(WEEK.slice(0, 4).map((d) => fullDay(d, { iron: 10 })))), "iodine");
    expect(io.status).toBe("not_enough_information");
    expect(io.nextStep).toMatchObject({ kind: "clarify", key: "iodised_salt" });
    expect(io.total).toBeNull();
  });

  it("asks about fortified milk when vitamin D depends on it", () => {
    const days = WEEK.slice(0, 4).map((d) => ({
      ...fullDay(d, {}),
      meals: [meal([{ ...component("milk_whole", 240, { vitamin_d: 0.2, calcium: 270 }, { floors: ["vitamin_d"] }) }], ["milk_fortification_unknown"])],
    }));
    const vd = find(assessMicronutrients(input(days)), "vitamin_d");
    expect(vd.nextStep).toMatchObject({ kind: "clarify", key: "milk_fortified" });
  });

  describe("likely low", () => {
    const original = process.env.GUIDANCE_LIKELY_LOW_ENABLED;
    afterEach(() => {
      if (original === undefined) delete process.env.GUIDANCE_LIKELY_LOW_ENABLED;
      else process.env.GUIDANCE_LIKELY_LOW_ENABLED = original;
    });
    const lowIron = WEEK.map((d) => fullDay(d, { iron: 4 }));

    it("is never emitted as shipped, even with the flag on: no rule is configured", () => {
      expect(ASSESSMENT_CONFIG.likelyLowRules).toEqual({});
      process.env.GUIDANCE_LIKELY_LOW_ENABLED = "true";
      const statuses = assessMicronutrients(input(lowIron)).map((a) => a.status);
      expect(statuses).not.toContain("likely_low");
    });

    it("needs both a configured rule and the flag", () => {
      const config = {
        ...ASSESSMENT_CONFIG,
        likelyLowRules: { iron: { against: "EAR" as const, factor: 1, minDocumentedDays: 5, minCoverage: 0.9, approvedBy: "test reviewer", citation: "test" } },
      };
      delete process.env.GUIDANCE_LIKELY_LOW_ENABLED;
      expect(find(assessMicronutrients(input(lowIron), config), "iron").status).not.toBe("likely_low");
      process.env.GUIDANCE_LIKELY_LOW_ENABLED = "true";
      expect(find(assessMicronutrients(input(lowIron), config), "iron").status).toBe("likely_low");
      // Too few documented days for the rule: no flag.
      expect(find(assessMicronutrients(input(lowIron.slice(0, 4)), config), "iron").status).not.toBe("likely_low");
    });
  });
});

describe("trend", () => {
  it("needs enough comparable days on both sides", () => {
    const cur = periodStats(WEEK.slice(0, 4).map((d) => dayNutrient(fullDay(d, { iron: 12 }), "iron")));
    const prev = periodStats(LAST_WEEK.slice(0, 2).map((d) => dayNutrient(fullDay(d, { iron: 8 }), "iron")));
    expect(trendFor(cur, prev)).toMatchObject({ kind: "insufficient", currentDays: 4, previousDays: 2, required: 3 });
    const prev3 = periodStats(LAST_WEEK.slice(0, 3).map((d) => dayNutrient(fullDay(d, { iron: 9 }), "iron")));
    expect(trendFor(cur, prev3)).toMatchObject({ kind: "change", current: 12, previous: 9, delta: 3 });
  });
});

describe("topConcerns", () => {
  it("shows at most two, safety first, without repeating a next step", () => {
    const days = WEEK.slice(0, 5).map((d) =>
      fullDay(d, { iron: 9, zinc: 3, calcium: 1500, vitamin_b12: 0.3, magnesium: 200 }, { supplementDoses: { magnesium: 400 } })
    );
    const all = assessMicronutrients(input(days));
    const top = topConcerns(all);
    expect(top).toHaveLength(2);
    expect(top[0].nutrient).toBe("magnesium");
    expect(top[0].status).toBe("above_upper_limit");
    // Both the magnesium and B12 next steps ask about supplements: only one survives.
    const keys = top.map((t) => (t.nextStep.kind === "clarify" ? t.nextStep.key : t.nutrient));
    expect(new Set(keys).size).toBe(top.length);
  });

  it("leaves out within-range nutrients and floors", () => {
    const top = topConcerns(assessMicronutrients(input(WEEK.slice(0, 4).map((d) => fullDay(d, { iron: 30, calcium: 1500 })))));
    expect(top.map((t) => t.nutrient)).not.toContain("iron");
    expect(top.map((t) => t.nutrient)).not.toContain("calcium");
  });
});

describe("nextClarification", () => {
  const days = WEEK.slice(0, 4).map((d) => fullDay(d, { iron: 9 }));
  it("asks about supplements when there's a gap, then about iodised salt", () => {
    const assessments = assessMicronutrients(input(days));
    expect(nextClarification({ days, household: {}, assessments })).toMatchObject({ key: "supplements_in_routine" });
    expect(nextClarification({ days, household: { supplements_in_routine: "no" }, assessments })).toMatchObject({ key: "iodised_salt" });
    expect(nextClarification({ days, household: { supplements_in_routine: "no", iodised_salt: "yes" }, assessments })).toBeNull();
  });

  it("doesn't repeat a question already asked", () => {
    const assessments = assessMicronutrients(input(days));
    expect(nextClarification({ days, household: {}, assessments }, new Set(["supplements_in_routine"]))).toMatchObject({ key: "iodised_salt" });
  });

  it("asks for the brand of a packaged item it couldn't match", () => {
    const withBiscuit = [
      ...days,
      {
        ...fullDay(WEEK[5], {}),
        meals: [{ ...meal([component("x", 30, {}, { unknownAll: true })]), items: [{ ...meal([]).items[0], name: "Marie biscuit", origin: "unmatched" as const }] }],
      },
    ];
    const assessments = assessMicronutrients(input(withBiscuit));
    expect(nextClarification({ days: withBiscuit, household: { supplements_in_routine: "no" }, assessments })).toMatchObject({
      key: "product_brand",
      itemName: "Marie biscuit",
    });
  });
});
