import { clamp, FOOD_BALANCE_CONFIG } from "./constants";
import type { FoodBalanceConfidenceResult, FoodBalanceMealInput, FoodBalanceUserProfile } from "./types";

/** Per-meal confidence following the documented hierarchy: user-corrected >
 * user-confirmed > high-confidence AI > low-confidence AI (reduced weight) >
 * unknown (excluded elsewhere, not scored here). */
export function mealConfidenceWeight(meal: FoodBalanceMealInput): number {
  if (meal.isUserCorrected) return 1;
  if (meal.isUserConfirmed) return 0.9;
  const aiConfidence = meal.aiConfidence ?? 0;
  if (aiConfidence >= 0.8) return 0.7;
  if (aiConfidence >= 0.5) return 0.4;
  return 0;
}

export function calculateMealCoverageConfidence(meals: FoodBalanceMealInput[]): number {
  const mealCoverage = clamp(meals.length / FOOD_BALANCE_CONFIG.fullConfidenceMealCount, 0, 1);
  return mealCoverage;
}

export function calculatePortionEstimationConfidence(meals: FoodBalanceMealInput[]): number {
  if (meals.length === 0) return 0;
  const weights = meals.map(mealConfidenceWeight);
  return weights.reduce((a, b) => a + b, 0) / meals.length;
}

export function calculateProfileCompleteness(profile?: FoodBalanceUserProfile): number {
  if (!profile) return 0;
  const fields = [
    profile.currentWeightKg,
    profile.heightCm,
    profile.age ?? profile.dateOfBirth,
    profile.metabolicEquationSex,
    profile.activityLevel && profile.activityLevel !== "unknown" ? profile.activityLevel : undefined,
  ];
  const known = fields.filter((f) => f != null).length;
  return known / fields.length;
}

/** Overall 0-1 confidence, documented as a weighted average (not a blind
 * product) of meal coverage, classification/portion quality, and profile
 * completeness — a blind multiplication would make confidence collapse
 * unrealistically fast as more independent factors are added. */
export function calculateFoodBalanceConfidence(
  meals: FoodBalanceMealInput[],
  profile?: FoodBalanceUserProfile
): FoodBalanceConfidenceResult {
  const mealCoverage = calculateMealCoverageConfidence(meals);
  const portionEstimation = calculatePortionEstimationConfidence(meals);
  const profileCompleteness = calculateProfileCompleteness(profile);

  const value = clamp(0.4 * mealCoverage + 0.4 * portionEstimation + 0.2 * profileCompleteness, 0, 1);

  const label: FoodBalanceConfidenceResult["label"] = value >= 0.75 ? "high" : value >= 0.45 ? "moderate" : "still_learning";

  return {
    value,
    label,
    componentConfidence: { mealCoverage, portionEstimation, profileCompleteness },
  };
}
