import { calculateMaintenanceEstimate } from "./energy";
import type { FoodBalanceUserProfile, MetabolicEquationSex, NutritionGoal } from "./types";

/** One resolved macro strategy per the product spec — several goal
 * combinations collapse onto the same strategy (e.g. gain_muscle +
 * reduce_body_fat and body_recomposition both become "recomposition"),
 * so the strategy is always a single value even when goals is a set. */
export type MacroStrategy =
  | "weight_loss"
  | "fat_loss"
  | "muscle_gain"
  | "recomposition"
  | "maintenance"
  | "nutrition_quality"
  | "healthy_aging";

/** Resolves one or more simultaneous NutritionGoals into a single
 * MacroStrategy. Order of checks matters — recomposition-triggering
 * combinations are checked before the single-goal strategies they would
 * otherwise resolve to individually. */
export function resolveMacroStrategy(goals: NutritionGoal[]): MacroStrategy {
  const has = (g: NutritionGoal) => goals.includes(g);

  if (has("body_recomposition")) return "recomposition";
  if (has("gain_muscle") && has("reduce_body_fat")) return "recomposition";
  if (has("reduce_weight") && has("gain_muscle")) return "recomposition";

  if (has("reduce_weight")) return "weight_loss";
  if (has("reduce_body_fat")) return "fat_loss";
  if (has("gain_muscle")) return "muscle_gain";
  if (has("maintain_weight")) return "maintenance";
  if (has("improve_nutrition")) return "nutrition_quality";
  if (has("healthy_aging")) return "healthy_aging";

  return "nutrition_quality";
}

/** True when the resolved strategy came from a combination that should use
 * the more conservative end of its calorie-adjustment range — currently
 * just healthy_aging paired with a deficit-oriented goal. */
function isConservativeRecomposition(goals: NutritionGoal[]): boolean {
  return goals.includes("healthy_aging") && goals.includes("gain_muscle") && goals.includes("reduce_body_fat");
}

export const CALORIE_ADJUSTMENT_BY_STRATEGY: Record<MacroStrategy, number> = {
  weight_loss: -0.15,
  fat_loss: -0.1,
  muscle_gain: 0.05,
  recomposition: -0.05,
  maintenance: 0,
  nutrition_quality: 0,
  healthy_aging: 0,
};

export const PROTEIN_G_PER_KG_BY_STRATEGY: Record<MacroStrategy, { min: number; target: number; max: number }> = {
  weight_loss: { min: 1.6, target: 1.8, max: 2.2 },
  fat_loss: { min: 1.6, target: 1.8, max: 2.2 },
  muscle_gain: { min: 1.6, target: 1.8, max: 2.2 },
  recomposition: { min: 1.8, target: 2.0, max: 2.2 },
  maintenance: { min: 1.2, target: 1.5, max: 1.8 },
  nutrition_quality: { min: 1.2, target: 1.5, max: 1.8 },
  healthy_aging: { min: 1.4, target: 1.6, max: 1.8 },
};

export const FAT_PERCENT_BY_STRATEGY: Record<MacroStrategy, { min: number; target: number; max: number }> = {
  weight_loss: { min: 0.2, target: 0.25, max: 0.3 },
  fat_loss: { min: 0.2, target: 0.25, max: 0.3 },
  muscle_gain: { min: 0.2, target: 0.25, max: 0.3 },
  recomposition: { min: 0.2, target: 0.25, max: 0.3 },
  maintenance: { min: 0.25, target: 0.3, max: 0.35 },
  nutrition_quality: { min: 0.25, target: 0.3, max: 0.35 },
  healthy_aging: { min: 0.25, target: 0.3, max: 0.35 },
};

/** Plain-language "why these targets" copy shown alongside the strategy —
 * never a medical claim, always framed as a starting suggestion. */
export const STRATEGY_EXPLANATIONS: Record<MacroStrategy, string> = {
  weight_loss: "Tistra suggests a gentle calorie deficit with enough protein and fiber to support a sustainable routine.",
  fat_loss: "Tistra suggests a conservative fat-loss target with higher protein, balanced carbs and fats, and fiber-rich foods.",
  muscle_gain: "Tistra suggests enough calories and higher protein to support muscle gain alongside resistance training.",
  recomposition: "Tistra suggests a balanced recomposition approach: higher protein, fiber-rich foods, and a conservative calorie target.",
  maintenance: "Tistra suggests maintenance calories with balanced macros to keep weight broadly stable while eating well.",
  nutrition_quality: "Tistra suggests balanced maintenance targets focused on variety, protein consistency, and fiber-rich foods.",
  healthy_aging: "Tistra suggests maintenance-style targets focused on enough food, protein consistency, fiber-rich foods, and long-term strength.",
};

const DEFAULT_WEIGHT_KG = 70;

/** Simple, deliberately non-clinical fiber target — flat by age/sex bands
 * rather than derived from calories, per the product spec. */
export function fiberTargetGForProfile(age: number | undefined, sex: MetabolicEquationSex | undefined): { min: number; target: number; max: number } {
  if (sex === "female") {
    if (age != null && age >= 50) return { min: 21, target: 23, max: 25 };
    return { min: 25, target: 25, max: 28 };
  }
  if (sex === "male") {
    if (age != null && age >= 50) return { min: 30, target: 30, max: 34 };
    return { min: 38, target: 38, max: 42 };
  }
  return { min: 25, target: 27, max: 30 };
}

export type MacroTargetSource = "tistra_recommended" | "user_custom" | "coach_custom";

export interface MacroTargetValue {
  min: number | null;
  target: number;
  max: number | null;
  unit: "kcal" | "g";
  source: MacroTargetSource;
}

export interface MacroTargets {
  calories: MacroTargetValue;
  protein: MacroTargetValue;
  carbs: MacroTargetValue;
  fat: MacroTargetValue;
  fiber: MacroTargetValue;
  selectedGoals: NutritionGoal[];
  strategy: MacroStrategy;
  explanation: string;
  /** True when the profile was missing enough data (weight/height/age/sex
   * or activity level) that targets fall back to safe defaults rather than
   * a fully personalized calculation — the UI should show a "complete your
   * profile" prompt when this is true. */
  isProfileIncomplete: boolean;
  calculatedAt: string;
}

function roundTo(value: number, nearest: number): number {
  return Math.round(value / nearest) * nearest;
}

/** Calculates Tistra's recommended macro targets from a profile's selected
 * goals + body/activity data. Calculation order (per spec): maintenance
 * calories -> goal-based calorie adjustment -> protein -> fat -> carbs from
 * remaining calories -> fiber. Never persisted by this pure package —
 * callers decide whether/how to store recommendedMacroTargets vs.
 * activeMacroTargets (a possibly user-edited override). */
export function calculateMacroTargets(profile: FoodBalanceUserProfile): MacroTargets {
  const strategy = resolveMacroStrategy(profile.goals);
  const conservativeRecomp = isConservativeRecomposition(profile.goals);

  const weightKg = profile.currentWeightKg ?? DEFAULT_WEIGHT_KG;
  const isProfileIncomplete = profile.currentWeightKg == null || profile.heightCm == null || profile.age == null || profile.metabolicEquationSex == null;

  const maintenance = calculateMaintenanceEstimate(profile);
  // Safe fallback maintenance estimate when profile data is incomplete —
  // deliberately a wide, unbranded "general adult" range, never presented
  // as precise.
  const maintenanceMid = maintenance?.midpointKcal ?? 2000;

  let adjustmentPct = CALORIE_ADJUSTMENT_BY_STRATEGY[strategy];
  if (conservativeRecomp) {
    // Use the conservative (smaller-magnitude) end of the recomposition
    // deficit range rather than the default -5%.
    adjustmentPct = -0.02;
  }

  const calorieTarget = Math.round(maintenanceMid * (1 + adjustmentPct));
  const calorieTolerance = Math.round(maintenanceMid * 0.05);
  const calories: MacroTargetValue = {
    min: calorieTarget - calorieTolerance,
    target: calorieTarget,
    max: calorieTarget + calorieTolerance,
    unit: "kcal",
    source: "tistra_recommended",
  };

  const proteinPerKg = PROTEIN_G_PER_KG_BY_STRATEGY[strategy];
  const proteinTarget = roundTo(weightKg * proteinPerKg.target, 5);
  const protein: MacroTargetValue = {
    min: roundTo(weightKg * proteinPerKg.min, 5),
    target: proteinTarget,
    max: roundTo(weightKg * proteinPerKg.max, 5),
    unit: "g",
    source: "tistra_recommended",
  };

  const fatPct = FAT_PERCENT_BY_STRATEGY[strategy];
  const fatTargetG = roundTo((calorieTarget * fatPct.target) / 9, 5);
  const fat: MacroTargetValue = {
    min: roundTo((calorieTarget * fatPct.min) / 9, 5),
    target: fatTargetG,
    max: roundTo((calorieTarget * fatPct.max) / 9, 5),
    unit: "g",
    source: "tistra_recommended",
  };

  const proteinCalories = protein.target * 4;
  const fatCalories = fat.target * 9;
  const carbCalories = Math.max(0, calorieTarget - proteinCalories - fatCalories);
  const carbTargetG = roundTo(carbCalories / 4, 5);
  const carbCaloriesMin = Math.max(0, calories.min! - protein.max! * 4 - fat.max! * 9);
  const carbCaloriesMax = Math.max(0, calories.max! - protein.min! * 4 - fat.min! * 9);
  const carbs: MacroTargetValue = {
    min: roundTo(carbCaloriesMin / 4, 5),
    target: carbTargetG,
    max: roundTo(carbCaloriesMax / 4, 5),
    unit: "g",
    source: "tistra_recommended",
  };

  const fiberRange = fiberTargetGForProfile(profile.age, profile.metabolicEquationSex);
  const fiber: MacroTargetValue = {
    min: Math.round(fiberRange.min),
    target: Math.round(fiberRange.target),
    max: Math.round(fiberRange.max),
    unit: "g",
    source: "tistra_recommended",
  };

  return {
    calories,
    protein,
    carbs,
    fat,
    fiber,
    selectedGoals: profile.goals,
    strategy,
    explanation: STRATEGY_EXPLANATIONS[strategy],
    isProfileIncomplete,
    calculatedAt: new Date().toISOString(),
  };
}
