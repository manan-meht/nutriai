import fs from "fs";
import path from "path";

import {
  proposeTargets,
  validateProposal,
  isRestrictiveTarget,
  caloriesFromMacros,
  NUTRITION_POLICY_VERSION,
  RESTRICTIVE_TARGET_FLOOR_KCAL,
  MACRO_CONSISTENCY_TOLERANCE_KCAL,
  type PolicyProfileInputs,
} from "@/lib/guidance/policy";

// The policy decides whether a number is fit to hand to a person. Every
// case here is one where the engine on its own would have produced a
// confident-looking figure that should not have been shown.

const base = {
  isPregnantOrBreastfeeding: false,
  hasEatingDisorderHistory: false,
  conditionsOrMedications: null,
} as const;

/** 38, 178 cm, 88 kg, moderately active — the unremarkable case. */
const typicalAdult: PolicyProfileInputs = {
  ...base,
  ageYears: 38,
  heightCm: 178,
  weightKg: 88,
  metabolicEquationSex: "male",
  activityLevel: "moderately_active",
  goals: ["reduce_weight"],
};

/** 80, 145 cm, 40 kg. BMI 19.0 — not underweight, so screening passes her,
 * and her estimated maintenance is 894 kcal. The case the floor rule has to
 * get right in both directions. */
const smallOlderAdult: PolicyProfileInputs = {
  ...base,
  ageYears: 80,
  heightCm: 145,
  weightKg: 40,
  metabolicEquationSex: "female",
  activityLevel: "mostly_sitting",
  goals: ["maintain_weight"],
};

describe("an ordinary adult gets targets", () => {
  const result = proposeTargets(typicalAdult);

  it("produces the engine's numbers, stamped with the policy version", () => {
    expect(result.outcome).toBe("targets");
    if (result.outcome !== "targets") return;
    expect(result.targets).toEqual({ caloriesKcal: 2381, proteinG: 160, carbsG: 290, fatG: 65, fiberG: 38 });
    expect(result.policyVersion).toBe(NUTRITION_POLICY_VERSION);
    expect(result.strategy).toBe("weight_loss");
    expect(result.notes).toEqual([]);
  });

  it("records what produced the number, with its units", () => {
    if (result.outcome !== "targets") throw new Error("expected targets");
    // Enough to recompute the target from the row alone — otherwise a
    // target can be shown but never explained or audited.
    expect(result.inputs).toMatchObject({
      equation: "mifflin-st-jeor",
      ageYears: 38,
      heightCm: 178,
      weightKg: 88,
      metabolicEquationSex: "male",
      activityLevel: "moderately_active",
      activityBasedEstimate: true,
      restingEnergyKcal: 1808,
      maintenanceMidKcal: 2802,
      proteinGPerKg: 1.8,
      units: { energy: "kcal", macros: "g", height: "cm", weight: "kg" },
    });
  });

  it("records the adjustment that was applied, not the one configured", () => {
    // The engine overrides its own CALORIE_ADJUSTMENT_BY_STRATEGY table on
    // the conservative-recomposition path: -2% where the table says -5%.
    // Reading the table would put a wrong percentage in the explanation and
    // a wrong provenance in the stored row, so the figure is derived from
    // the output instead.
    const conservativeRecomp = proposeTargets({
      ...base,
      ageYears: 68,
      heightCm: 170,
      weightKg: 80,
      metabolicEquationSex: "male",
      activityLevel: "lightly_active",
      goals: ["healthy_aging", "gain_muscle", "reduce_body_fat"],
    });
    if (conservativeRecomp.outcome !== "targets") throw new Error("expected targets");
    expect(conservativeRecomp.strategy).toBe("recomposition");
    expect(conservativeRecomp.inputs.appliedCalorieAdjustment).toBeCloseTo(-0.02, 2);
    expect(conservativeRecomp.explanation).toContain("lowers it by 2%");
  });
});

describe("the calorie floor", () => {
  it("allows a low estimate that is a need, and says so", () => {
    // 894 kcal is this person's estimated maintenance, not a restriction.
    // Clamping it up to 1,200 would tell an 80-year-old to eat a third more
    // than anything we calculated; refusing would deny guidance to exactly
    // the people this product is for.
    const result = proposeTargets(smallOlderAdult);
    expect(result.outcome).toBe("targets");
    if (result.outcome !== "targets") return;
    expect(result.targets.caloriesKcal).toBe(894);
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]).toContain(`below ${RESTRICTIVE_TARGET_FLOOR_KCAL} kcal`);
    expect(result.notes[0]).toMatch(/doctor or dietitian/);
    // The caveat travels with the text someone reads, not only in a field
    // a screen might forget to render.
    expect(result.explanation).toContain(`below ${RESTRICTIVE_TARGET_FLOOR_KCAL} kcal`);
  });

  it("refuses the same person a deficit below the floor", () => {
    const result = proposeTargets({ ...smallOlderAdult, goals: ["reduce_weight"] });
    expect(result.outcome).toBe("needs_professional_review");
    if (result.outcome === "targets") return;
    expect(result.reasons).toEqual(["restrictive_target_below_floor"]);
    expect(result.message).toMatch(/doctor or registered dietitian/);
    // Tracking is unaffected — the refusal is about setting targets.
    expect(result.message).toMatch(/keep logging meals/);
  });

  it("does not clamp a refused deficit up to the floor", () => {
    // A clamped deficit is still a deficit nobody reviewed, wearing a
    // rounder number. There must be no target at all in this branch.
    const result = proposeTargets({ ...smallOlderAdult, goals: ["reduce_weight"] });
    expect(result).not.toHaveProperty("targets");
  });

  it("is measured against the person's own maintenance, not a strategy label", () => {
    expect(isRestrictiveTarget(1700, 2000)).toBe(true);
    expect(isRestrictiveTarget(2000, 2000)).toBe(false);
    expect(isRestrictiveTarget(2100, 2000)).toBe(false);
    // The engine rounds its calorie target to a whole number, so an
    // intended zero adjustment lands a kcal or two off maintenance.
    expect(isRestrictiveTarget(893, 894.3)).toBe(false);
  });
});

describe("who does not get an automated target", () => {
  const refusedFor = (over: Partial<PolicyProfileInputs>) => proposeTargets({ ...typicalAdult, ...over });

  it("sends a minor to a professional, not back to the form", () => {
    const result = refusedFor({ ageYears: 15 });
    expect(result.outcome).toBe("needs_professional_review");
    if (result.outcome === "targets") return;
    expect(result.reasons).toContain("under_18");
  });

  it.each([
    ["pregnancy or breastfeeding", { isPregnantOrBreastfeeding: true }, "pregnant_or_breastfeeding"],
    ["an eating-disorder history", { hasEatingDisorderHistory: true }, "eating_disorder_concern"],
    ["a stated condition", { conditionsOrMedications: "type 2 diabetes, on metformin" }, "medical_oversight_needed"],
    ["being underweight", { weightKg: 48, heightCm: 178 }, "underweight"],
  ])("refuses on %s", (_label, over, reason) => {
    const result = refusedFor(over as Partial<PolicyProfileInputs>);
    expect(result.outcome).toBe("needs_professional_review");
    if (result.outcome === "targets") return;
    expect(result.reasons).toContain(reason);
  });

  it("refuses rather than extrapolates outside adult ranges", () => {
    // Mifflin-St Jeor was fitted on adults; past these bounds it is being
    // extrapolated, and a plausible-looking number is the worst outcome.
    for (const over of [{ weightKg: 320 }, { heightCm: 100 }, { ageYears: 115 }]) {
      const result = refusedFor(over);
      expect(result.outcome).toBe("needs_professional_review");
      if (result.outcome === "targets") continue;
      expect(result.reasons).toEqual(["input_out_of_range"]);
    }
  });

  it("gives the clinical reason when an implausible figure is also a risk flag", () => {
    // 29 kg at 178 cm is both outside the weight bounds and a BMI of 9.
    // Screening runs before the bounds check on purpose, so the reason
    // recorded is the clinical one — which is the more important of the two
    // to have on the row, and the one the message is written for. Either
    // way no target is produced.
    for (const over of [{ weightKg: 29 }, { heightCm: 240 }]) {
      const result = refusedFor(over);
      expect(result.outcome).toBe("needs_professional_review");
      if (result.outcome === "targets") continue;
      expect(result.reasons).toContain("underweight");
    }
  });

  it("asks again instead of referring when the remedy is a question", () => {
    // Missing measurements are answerable. Telling someone to see a doctor
    // because they skipped a height field would be both wrong and alarming.
    const result = refusedFor({ heightCm: null });
    expect(result.outcome).toBe("needs_more_detail");
    if (result.outcome === "targets") return;
    expect(result.reasons).toEqual(["incomplete_answers"]);
    expect(result.message).toMatch(/a few more details/);
    expect(result.message).not.toMatch(/doctor/);
  });

  it("treats a missing metabolic sex as a missing measurement", () => {
    // Found by running the policy against a real contact whose column is
    // null: calculateMaintenanceEstimate returns null, the engine
    // substitutes a flat 2,000 kcal, and a fully confident target reached
    // the screen with only isProfileIncomplete — which nothing acted on —
    // to show it was never calculated.
    const result = refusedFor({ metabolicEquationSex: null });
    expect(result.outcome).toBe("needs_more_detail");
    if (result.outcome === "targets") return;
    expect(result.reasons).toEqual(["incomplete_answers"]);
  });

  it("will not take a deficit off a guessed activity factor", () => {
    // Without an activity answer the maintenance estimate is a broad
    // 1.25–1.6 × resting band. A maintenance target off that band is a
    // fair starting estimate; a deficit off it is a deficit off a guess.
    const deficit = proposeTargets({ ...typicalAdult, activityLevel: null });
    expect(deficit.outcome).toBe("needs_more_detail");
    if (deficit.outcome === "targets") return;
    expect(deficit.reasons).toEqual(["activity_unknown"]);
    expect(deficit.message).not.toMatch(/doctor/);
  });

  it("still sets maintenance targets without an activity answer, and marks them broad", () => {
    const result = proposeTargets({ ...typicalAdult, activityLevel: null, goals: ["improve_nutrition"] });
    expect(result.outcome).toBe("targets");
    if (result.outcome !== "targets") return;
    expect(result.targets.caloriesKcal).toBe(2576);
    expect(result.inputs.activityBasedEstimate).toBe(false);
    expect(result.explanation).toContain("a broad estimate, because we don't know yet how active you are");
  });
});

describe("output validation", () => {
  const sound = {
    caloriesKcal: 2000,
    proteinG: 150,
    carbsG: 200,
    fatG: 67,
    maintenanceMidKcal: 2000,
    restingEnergyKcal: 1500,
  };

  it("passes a target whose macros reconcile within the rounding tolerance", () => {
    // 150×4 + 200×4 + 67×9 = 2,003.
    expect(caloriesFromMacros(sound)).toBe(2003);
    expect(validateProposal(sound)).toEqual({ refusals: [], notes: [] });
  });

  it("refuses when the macros do not add up to the calorie figure", () => {
    // The engine clamps carbohydrate at zero, so a target whose protein and
    // fat alone exceed it silently stops being internally coherent — you
    // cannot eat the protein target and the fat target and stay inside the
    // calories. Showing both would be showing two different plans.
    const clamped = { ...sound, caloriesKcal: 1200, proteinG: 240, carbsG: 0, fatG: 50 };
    expect(caloriesFromMacros(clamped) - clamped.caloriesKcal).toBeGreaterThan(MACRO_CONSISTENCY_TOLERANCE_KCAL);
    expect(validateProposal(clamped).refusals).toContain("internally_inconsistent");
  });

  it("refuses a restrictive target below resting energy", () => {
    // Unreachable under the engine's current constants — the gentlest
    // activity multiplier is 1.2 and the deepest deficit 15%, leaving
    // 1.02 × resting. Exercised directly so that deepening a deficit, or
    // adding a lower multiplier, cannot ship a below-resting target
    // silently.
    const belowResting = { ...sound, caloriesKcal: 1400, proteinG: 105, carbsG: 140, fatG: 47 };
    expect(validateProposal(belowResting).refusals).toContain("below_resting_energy");
  });

  it("does not call a maintenance target below resting energy restrictive", () => {
    // Only a target below estimated NEED is a restriction. If maintenance
    // itself came out under resting energy the estimate is broken, not the
    // plan — and that is the inputs' problem, caught upstream.
    const atMaintenance = { ...sound, caloriesKcal: 1400, maintenanceMidKcal: 1400, proteinG: 105, carbsG: 140, fatG: 47 };
    expect(validateProposal(atMaintenance).refusals).not.toContain("below_resting_energy");
  });
});

describe("the explanation someone approves", () => {
  const result = proposeTargets(typicalAdult);

  it("walks through every step that produced the number", () => {
    if (result.outcome !== "targets") throw new Error("expected targets");
    const text = result.explanation;
    expect(text).toContain("Mifflin-St Jeor");
    expect(text).toContain("1,808 kcal");  // resting
    expect(text).toContain("2,802 kcal");  // maintenance
    expect(text).toContain("lowers it by 15%");
    expect(text).toContain("2,381 kcal");  // the target itself
    expect(text).toContain("1.8 g per kg of body weight");
    expect(text).toContain("25% of those calories");
    expect(text).toContain("the energy left after protein and fat");
    expect(text).toContain('activity factor for "Moderately active"');
  });

  it("says fiber is not derived from the calorie figure", () => {
    // It is a flat band by age and sex, unlike every other line — stating
    // that is the difference between an explanation and a formula.
    if (result.outcome !== "targets") throw new Error("expected targets");
    expect(result.explanation).toContain("not derived from your calories");
  });

  it("frames the targets as a starting point, never as correct for them", () => {
    if (result.outcome !== "targets") throw new Error("expected targets");
    expect(result.explanation).toContain("starting targets, not a prescription");
    expect(result.explanation).not.toMatch(/you (should|must|need to) eat/i);
    expect(result.explanation).not.toMatch(/\brecommended for you\b|\bcorrect\b|\bideal\b|\boptimal\b/i);
  });

  it("reuses the goal vocabulary the rest of the app shows", () => {
    // goal-options.ts is the single source of truth for these labels; a
    // second set here would drift from what the profile screen says.
    if (result.outcome !== "targets") throw new Error("expected targets");
    expect(result.explanation).toContain("(Reduce weight)");
  });
});

describe("the policy version is a real, unreviewed row", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "..", "..", "supabase", "migrations", "0068_nutrition_guidance.sql"),
    "utf-8"
  );

  it("matches the version seeded in the migration", () => {
    // policy_version is a foreign key into nutrition_policy_versions, so a
    // mismatch is an insert that fails at runtime, on activation, for a
    // real person — not at build time.
    expect(migration).toContain(`'${NUTRITION_POLICY_VERSION}'`);
  });

  it("is seeded unreviewed, so nothing claims a review that has not happened", () => {
    expect(migration).toMatch(new RegExp(`'${NUTRITION_POLICY_VERSION}',\\s*'unreviewed'`));
  });

  it("has somewhere to store the fiber target it produces", () => {
    const result = proposeTargets(typicalAdult);
    if (result.outcome !== "targets") throw new Error("expected targets");
    expect(result.targets.fiberG).toBeGreaterThan(0);
    expect(migration).toMatch(/fiber_g\s+integer not null/);
  });
});
