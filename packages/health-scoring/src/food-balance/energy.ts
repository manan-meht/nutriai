import { ACTIVITY_MULTIPLIERS, ENERGY_CONFIG, GOAL_ENERGY_OFFSETS, HEALTHY_AGING_ENERGY_CONFIG, clamp } from "./constants";
import type { EnergyTargetRange, FoodBalanceUserProfile, MetabolicEquationSex, NutritionGoal } from "./types";

/** Mifflin-St Jeor resting metabolic rate. Never inferred from name/photo/
 * pronouns — callers must supply an explicit metabolicEquationSex. */
export function calculateRestingEnergy(weightKg: number, heightCm: number, age: number, sex: MetabolicEquationSex): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

function ageFromDateOfBirth(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

export interface MaintenanceEstimate {
  rmr: number;
  lowerKcal: number;
  upperKcal: number;
  midpointKcal: number;
  isActivityBased: boolean;
}

/** Estimated maintenance calorie range — the midpoint of an activity-based
 * multiplier ± tolerance when activity is known, or a broad RMR-based range
 * when it isn't. Never returned as a single exact number to the UI. */
export function calculateMaintenanceEstimate(
  profile: Pick<FoodBalanceUserProfile, "currentWeightKg" | "heightCm" | "age" | "dateOfBirth" | "metabolicEquationSex" | "activityLevel">
): MaintenanceEstimate | null {
  const { currentWeightKg, heightCm, metabolicEquationSex } = profile;
  const age = profile.age ?? (profile.dateOfBirth ? ageFromDateOfBirth(profile.dateOfBirth) : undefined);
  if (currentWeightKg == null || heightCm == null || age == null || metabolicEquationSex == null) return null;

  const rmr = calculateRestingEnergy(currentWeightKg, heightCm, age, metabolicEquationSex);
  const activity = profile.activityLevel;

  if (activity && activity !== "unknown" && activity in ACTIVITY_MULTIPLIERS) {
    const midpoint = rmr * ACTIVITY_MULTIPLIERS[activity as keyof typeof ACTIVITY_MULTIPLIERS];
    return {
      rmr,
      midpointKcal: midpoint,
      lowerKcal: midpoint * (1 - ENERGY_CONFIG.activityRangeTolerance),
      upperKcal: midpoint * (1 + ENERGY_CONFIG.activityRangeTolerance),
      isActivityBased: true,
    };
  }

  const lower = rmr * ENERGY_CONFIG.unknownActivityLowerMultiplier;
  const upper = rmr * ENERGY_CONFIG.unknownActivityUpperMultiplier;
  return { rmr, lowerKcal: lower, upperKcal: upper, midpointKcal: (lower + upper) / 2, isActivityBased: false };
}

/** Personalized calorie target range for the user's goal(s), derived from
 * the maintenance estimate — these are starting estimates, never
 * guarantees or medical prescriptions (see GOAL_ENERGY_OFFSETS). Returns
 * null when none of the given goals have a calorie offset defined (e.g.
 * only "improve_nutrition" selected).
 *
 * Multiple simultaneous goals: if "healthy_aging" is among them, its
 * maintenance-range formula wins outright (not blended) — the other
 * goals' offsets are simple ± percentages off the midpoint, while Healthy
 * Aging deliberately returns the maintenance estimate's own wider range
 * rather than collapsing to a point, and mixing the two formulas has no
 * sensible combination. Otherwise, every selected goal that has a defined
 * offset contributes to a simple average of lowerPct/upperPct — e.g.
 * reduce_weight (deficit) + gain_muscle (surplus) averages to a small net
 * offset near zero, which reads sensibly as a recomposition-like target
 * rather than an arbitrary tie-break between contradictory goals. */
export function calculateEnergyTargetRange(
  profile: Pick<FoodBalanceUserProfile, "currentWeightKg" | "heightCm" | "age" | "dateOfBirth" | "metabolicEquationSex" | "activityLevel">,
  goals: NutritionGoal[]
): EnergyTargetRange | null {
  const maintenance = calculateMaintenanceEstimate(profile);
  if (!maintenance) return null;

  if (goals.includes("healthy_aging")) {
    return {
      lowerKcal: maintenance.lowerKcal,
      upperKcal: maintenance.upperKcal,
      midpointKcal: maintenance.midpointKcal,
      isActivityBased: maintenance.isActivityBased,
    };
  }

  const offsets = goals
    .map((g): { lowerPct: number; upperPct: number } | null => GOAL_ENERGY_OFFSETS[g])
    .filter((o): o is { lowerPct: number; upperPct: number } => o != null);
  if (offsets.length === 0) return null;

  const avgLowerPct = offsets.reduce((s, o) => s + o.lowerPct, 0) / offsets.length;
  const avgUpperPct = offsets.reduce((s, o) => s + o.upperPct, 0) / offsets.length;

  const lowerKcal = maintenance.midpointKcal * (1 + avgLowerPct);
  const upperKcal = maintenance.midpointKcal * (1 + avgUpperPct);
  const [orderedLower, orderedUpper] = lowerKcal <= upperKcal ? [lowerKcal, upperKcal] : [upperKcal, lowerKcal];

  return {
    lowerKcal: orderedLower,
    upperKcal: orderedUpper,
    midpointKcal: (orderedLower + orderedUpper) / 2,
    isActivityBased: maintenance.isActivityBased,
  };
}

export interface EnergyAlignmentResult {
  score: number;
  averageDailyCalories: number;
}

/** Scores average estimated daily calorie intake against the personalized
 * target range — always a scoring-window average, never a single day's
 * verdict, and clamped so no single meal can swing it drastically. */
export function calculateEnergyAlignmentScore(averageDailyCalories: number, range: EnergyTargetRange): number {
  const { lowerKcal: L, upperKcal: U, midpointKcal: T } = range;
  if (averageDailyCalories >= L && averageDailyCalories <= U) return 100;
  const distance = averageDailyCalories < L ? L - averageDailyCalories : averageDailyCalories - U;
  const relativeDeviation = distance / T;
  return clamp(100 - 250 * relativeDeviation, 0, 100);
}

/** Healthy Aging's energy-adequacy formula — deliberately asymmetric: a
 * steeper penalty below the maintenance range than above it (400 vs 250
 * coefficient), because for this goal inadequate intake is the primary risk
 * to guard against, not excess. This is an explainable product-scoring
 * formula, not a clinically validated diagnostic equation. Always a
 * scoring-window average, never a single day's verdict. */
export function calculateHealthyAgingEnergyAdequacyScore(averageDailyCalories: number, range: EnergyTargetRange): number {
  const { lowerKcal: L, upperKcal: U, midpointKcal: M } = range;
  if (averageDailyCalories >= L && averageDailyCalories <= U) return 100;
  if (averageDailyCalories < L) {
    return clamp(100 - HEALTHY_AGING_ENERGY_CONFIG.belowRangeCoefficient * ((L - averageDailyCalories) / M), 0, 100);
  }
  return clamp(100 - HEALTHY_AGING_ENERGY_CONFIG.aboveRangeCoefficient * ((averageDailyCalories - U) / M), 0, 100);
}

/** Secondary reasonableness check only (per the spec, never the primary
 * calculation) — flags when a weight is far enough from a typical range
 * that the flat 30 kcal/kg/day heuristic shouldn't be trusted blindly.
 * This product has no clinician-reviewed adjusted-weight equation today,
 * so extreme-weight cases are flagged for reduced confidence rather than
 * inventing one (per the spec's explicit instruction). */
export function isExtremeWeightForReasonablenessCheck(weightKg: number): boolean {
  return weightKg < 40 || weightKg > 150;
}

/** True when there's enough profile + meal-confidence data to responsibly
 * include a calorie component at all — see FOOD_BALANCE spec section 9.5. */
export function hasSufficientEnergyConfidence(
  profile: Pick<FoodBalanceUserProfile, "currentWeightKg" | "heightCm" | "age" | "dateOfBirth" | "metabolicEquationSex">,
  mealCoverageConfidence: number,
  portionEstimationConfidence: number
): boolean {
  const hasProfileData =
    profile.currentWeightKg != null &&
    profile.heightCm != null &&
    (profile.age != null || profile.dateOfBirth != null) &&
    profile.metabolicEquationSex != null;
  if (!hasProfileData) return false;
  const combinedConfidence = Math.min(mealCoverageConfidence, portionEstimationConfidence);
  return combinedConfidence >= ENERGY_CONFIG.minimumEnergyConfidence;
}
