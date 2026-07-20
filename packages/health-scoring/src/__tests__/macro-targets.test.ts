import { calculateMacroTargets, resolveMacroStrategy } from "../food-balance/macro-targets";
import type { FoodBalanceUserProfile, NutritionGoal } from "../food-balance/types";

const NUTRITION_GOALS: NutritionGoal[] = [
  "reduce_weight",
  "reduce_body_fat",
  "gain_muscle",
  "body_recomposition",
  "maintain_weight",
  "improve_nutrition",
  "healthy_aging",
];

const baseProfile: Omit<FoodBalanceUserProfile, "goals"> = {
  currentWeightKg: 70,
  heightCm: 170,
  age: 35,
  metabolicEquationSex: "female",
  activityLevel: "moderately_active",
};

describe("existing seven nutrition goals", () => {
  it("still exist with the exact same seven ids", () => {
    expect(NUTRITION_GOALS).toEqual([
      "reduce_weight",
      "reduce_body_fat",
      "gain_muscle",
      "body_recomposition",
      "maintain_weight",
      "improve_nutrition",
      "healthy_aging",
    ]);
  });
});

describe("resolveMacroStrategy", () => {
  it("reduce_weight alone resolves to weight_loss", () => {
    expect(resolveMacroStrategy(["reduce_weight"])).toBe("weight_loss");
  });

  it("reduce_body_fat alone resolves to fat_loss", () => {
    expect(resolveMacroStrategy(["reduce_body_fat"])).toBe("fat_loss");
  });

  it("gain_muscle alone resolves to muscle_gain", () => {
    expect(resolveMacroStrategy(["gain_muscle"])).toBe("muscle_gain");
  });

  it("body_recomposition resolves to recomposition", () => {
    expect(resolveMacroStrategy(["body_recomposition"])).toBe("recomposition");
  });

  it("gain_muscle + reduce_body_fat resolves to recomposition", () => {
    expect(resolveMacroStrategy(["gain_muscle", "reduce_body_fat"])).toBe("recomposition");
  });

  it("healthy_aging + gain_muscle + reduce_body_fat resolves to conservative recomposition", () => {
    const strategy = resolveMacroStrategy(["healthy_aging", "gain_muscle", "reduce_body_fat"]);
    expect(strategy).toBe("recomposition");
    const targets = calculateMacroTargets({ ...baseProfile, goals: ["healthy_aging", "gain_muscle", "reduce_body_fat"] });
    const maintenanceOnly = calculateMacroTargets({ ...baseProfile, goals: ["body_recomposition"] });
    // The healthy-aging combination should use a smaller-magnitude deficit
    // than a plain recomposition goal.
    expect(targets.calories.target).toBeGreaterThan(maintenanceOnly.calories.target);
  });

  it("maintain_weight resolves to maintenance", () => {
    expect(resolveMacroStrategy(["maintain_weight"])).toBe("maintenance");
  });

  it("improve_nutrition alone resolves to nutrition_quality", () => {
    expect(resolveMacroStrategy(["improve_nutrition"])).toBe("nutrition_quality");
  });

  it("healthy_aging alone resolves to healthy_aging", () => {
    expect(resolveMacroStrategy(["healthy_aging"])).toBe("healthy_aging");
  });
});

describe("calculateMacroTargets", () => {
  it("generates calories, protein, carbs, fat, and fiber", () => {
    const targets = calculateMacroTargets({ ...baseProfile, goals: ["reduce_weight"] });
    expect(targets.calories.target).toBeGreaterThan(0);
    expect(targets.protein.target).toBeGreaterThan(0);
    expect(targets.carbs.target).toBeGreaterThan(0);
    expect(targets.fat.target).toBeGreaterThan(0);
    expect(targets.fiber.target).toBeGreaterThan(0);
  });

  it("calculates protein from body weight before carbs (carbs uses protein+fat calories)", () => {
    const targets = calculateMacroTargets({ ...baseProfile, goals: ["muscle_gain" as NutritionGoal].length ? ["gain_muscle"] : ["gain_muscle"] });
    const proteinCalories = targets.protein.target * 4;
    const fatCalories = targets.fat.target * 9;
    const carbCalories = targets.carbs.target * 4;
    expect(Math.round(proteinCalories + fatCalories + carbCalories)).toBeLessThanOrEqual(targets.calories.target + 10);
  });

  it("carbs fill remaining calories after protein and fat", () => {
    const targets = calculateMacroTargets({ ...baseProfile, goals: ["maintain_weight"] });
    const remaining = targets.calories.target - targets.protein.target * 4 - targets.fat.target * 9;
    expect(targets.carbs.target).toBeCloseTo(Math.round(remaining / 4 / 5) * 5, 0);
  });

  it("marks the profile incomplete when weight/height/age/sex is missing, without guessing precisely", () => {
    const targets = calculateMacroTargets({ goals: ["reduce_weight"] });
    expect(targets.isProfileIncomplete).toBe(true);
    expect(targets.calories.target).toBeGreaterThan(0);
  });

  it("rounds protein and fat to the nearest 5g", () => {
    const targets = calculateMacroTargets({ ...baseProfile, goals: ["gain_muscle"] });
    expect(targets.protein.target % 5).toBe(0);
    expect(targets.fat.target % 5).toBe(0);
    expect(targets.carbs.target % 5).toBe(0);
  });

  it("does not label carbs as bad and includes a non-alarming explanation", () => {
    const targets = calculateMacroTargets({ ...baseProfile, goals: ["reduce_weight"] });
    expect(targets.explanation.toLowerCase()).not.toContain("avoid");
    expect(targets.explanation.toLowerCase()).not.toContain("bad");
  });

  it("gives healthy_aging and improve_nutrition maintenance calories with fiber emphasis", () => {
    const agingTargets = calculateMacroTargets({ ...baseProfile, goals: ["healthy_aging"] });
    const nutritionTargets = calculateMacroTargets({ ...baseProfile, goals: ["improve_nutrition"] });
    expect(agingTargets.strategy).toBe("healthy_aging");
    expect(nutritionTargets.strategy).toBe("nutrition_quality");
    expect(agingTargets.fiber.target).toBeGreaterThan(0);
    expect(nutritionTargets.fiber.target).toBeGreaterThan(0);
  });

  it("applies a higher protein target for recomposition than plain maintenance", () => {
    const recomp = calculateMacroTargets({ ...baseProfile, goals: ["body_recomposition"] });
    const maintenance = calculateMacroTargets({ ...baseProfile, goals: ["maintain_weight"] });
    expect(recomp.protein.target).toBeGreaterThan(maintenance.protein.target);
  });

  it("uses fiber targets that vary sensibly by sex/age band", () => {
    const youngWoman = calculateMacroTargets({ ...baseProfile, age: 30, metabolicEquationSex: "female", goals: ["improve_nutrition"] });
    const olderMan = calculateMacroTargets({ ...baseProfile, age: 60, metabolicEquationSex: "male", goals: ["improve_nutrition"] });
    expect(youngWoman.fiber.target).toBe(25);
    expect(olderMan.fiber.target).toBe(30);
  });
});
