import type { FoodBalanceUserProfile } from "./types";

export interface NutrientTargetRange {
  lower: number;
  upper: number;
  upperTolerance: number;
}

/** Centralized nutrient target ranges — see scoreAgainstRange in
 * food-foundation.ts for how these are applied. Weight-based targets fall
 * back to population-average assumptions (70kg) when weight is unknown, so
 * the Food Foundation is never blocked by a missing profile (see
 * calculate.ts / calculateFoodFoundationScore). */
const DEFAULT_WEIGHT_KG = 70;
const DEFAULT_HEIGHT_CM = 165;

export function proteinTargetG(profile?: Pick<FoodBalanceUserProfile, "currentWeightKg" | "goals" | "resistanceTraining">): NutrientTargetRange {
  const weightKg = profile?.currentWeightKg ?? DEFAULT_WEIGHT_KG;
  const goals = profile?.goals ?? [];
  // Higher-protein goals (muscle gain, recomposition, fat loss with lean
  // mass preservation) use a broader, higher range; general goals use RDA+.
  // Multiple simultaneous goals: take the highest-protein tier that
  // applies to ANY selected goal — more protein never hurts a
  // lower-protein-tier goal also selected alongside it, so there's no
  // real tradeoff to average away here (unlike calorie targets, which
  // pull in opposite directions).
  const perKgLower = goals.some((g) => g === "gain_muscle" || g === "body_recomposition")
    ? 1.6
    : goals.some((g) => g === "reduce_weight" || g === "reduce_body_fat")
      ? 1.2
      : 0.8;
  const perKgUpper = perKgLower + 0.6;
  return {
    lower: Math.round(weightKg * perKgLower),
    upper: Math.round(weightKg * perKgUpper),
    upperTolerance: Math.round(weightKg * 0.4),
  };
}

export function fibreTargetG(): NutrientTargetRange {
  // General population adequate-intake guidance (~25-35g/day) — broad on
  // purpose per the spec (meal-photo estimates aren't clinically precise).
  return { lower: 25, upper: 35, upperTolerance: 15 };
}

export function carbTargetG(profile?: Pick<FoodBalanceUserProfile, "currentWeightKg">): NutrientTargetRange {
  const weightKg = profile?.currentWeightKg ?? DEFAULT_WEIGHT_KG;
  return { lower: Math.round(weightKg * 2.5), upper: Math.round(weightKg * 4.5), upperTolerance: Math.round(weightKg * 1.5) };
}

export function fatTargetG(profile?: Pick<FoodBalanceUserProfile, "currentWeightKg">): NutrientTargetRange {
  const weightKg = profile?.currentWeightKg ?? DEFAULT_WEIGHT_KG;
  return { lower: Math.round(weightKg * 0.6), upper: Math.round(weightKg * 1.1), upperTolerance: Math.round(weightKg * 0.5) };
}

export function heightOrDefault(heightCm?: number): number {
  return heightCm ?? DEFAULT_HEIGHT_CM;
}

export function weightOrDefault(weightKg?: number): number {
  return weightKg ?? DEFAULT_WEIGHT_KG;
}
