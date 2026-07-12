// Centralized, documented defaults for the Food Balance Score. Nothing here
// should be duplicated elsewhere — every scoring module imports its
// thresholds/weights from this file so they can be tuned in one place
// without touching calculation logic.

// 1.1.0: added the healthy_aging goal (new Goal Alignment formula for that
// goal only — every other goal's calculation is byte-for-byte unchanged).
// Existing stored snapshots keep whatever version they were calculated
// under; this bump only affects newly-calculated scores.
export const FOOD_BALANCE_SCORING_VERSION = "1.1.0";

export const FOOD_BALANCE_CONFIG = {
  minEligibleMeals: 15,
  minDistinctLoggingDays: 5,
  scoringWindowDays: 14,
  recentWindowDays: 7,
  fullConfidenceMealCount: 21,
  maxRecommendations: 3,
  // Within the 14-day window, the most recent 7 days count for 60% of the
  // evidence and days 8-14 count for 40% — see calculate.ts.
  recentWindowWeight: 0.6,
  olderWindowWeight: 0.4,
  // Exponential smoothing: 70% previous displayed score, 30% new raw score,
  // so one unusual meal or day can't swing the displayed number.
  smoothingPreviousWeight: 0.7,
  smoothingNewWeight: 0.3,
} as const;

export const FOOD_FOUNDATION_WEIGHTS = {
  macroAndFibreBalance: 0.25,
  minimallyProcessedFoodBalance: 0.25,
  fruitAndVegetableIntake: 0.2,
  foodDiversity: 0.2,
  homePreparedMealShare: 0.1,
} as const;

export const MACRO_AND_FIBRE_WEIGHTS = {
  proteinAdequacy: 0.35,
  carbohydrateBalance: 0.2,
  fatBalance: 0.2,
  fibreAdequacy: 0.25,
} as const;

export const FRUIT_AND_VEGETABLE_WEIGHTS = {
  combined: 0.7,
  vegetableOnly: 0.3,
} as const;

export const FOOD_DIVERSITY_WEIGHTS = {
  wholeFoodVariety: 0.7,
  foodGroupCoverage: 0.3,
} as const;

export const FOOD_DIVERSITY_TARGETS = {
  uniqueWholeFoodTarget: 20,
  totalFoodGroups: 6,
} as const;

export const HOME_PREPARED_TARGET_SHARE = 0.7;

export const ULTRA_PROCESSED_PENALTY_MULTIPLIER = 1.5;

export const FRUIT_VEGETABLE_TARGETS = {
  combinedDailyServings: 5,
  vegetableDailyServings: 3,
} as const;

// Goal Alignment component weights per goal — see goal-alignment.ts.
export const GOAL_ALIGNMENT_WEIGHTS = {
  reduce_weight: { energyAlignment: 0.45, proteinAdequacy: 0.25, fibreAndMealVolume: 0.15, intakeConsistency: 0.15 },
  reduce_body_fat: { energyAlignment: 0.45, proteinAdequacy: 0.25, fibreAndMealVolume: 0.15, intakeConsistency: 0.15 },
  gain_muscle: { energyAlignment: 0.25, proteinAdequacy: 0.4, carbohydrateSupport: 0.2, proteinDistribution: 0.15 },
  body_recomposition: { energyAlignment: 0.3, proteinAdequacy: 0.4, fibreAdequacy: 0.15, proteinDistribution: 0.15 },
  maintain_weight: { energyAlignment: 0.4, proteinAdequacy: 0.2, fibreAdequacy: 0.2, intakeConsistency: 0.2 },
  // improve_nutrition has no calorie/goal weighting — Food Foundation is
  // used as the full score (see calculate.ts).
  improve_nutrition: null,
  // Healthy Aging: 35% Energy Adequacy + 25% Protein Adequacy + 15% Protein
  // Distribution + 15% Nutrient-Dense Food Coverage + 10% Healthy-Aging
  // Food Pattern. energyAlignment/proteinAdequacy/proteinDistribution reuse
  // the same component keys other goals use (goal-specific formulas, see
  // energy.ts/goal-alignment.ts); nutrientDenseFoodCoverage/
  // healthyAgingFoodPattern are new, Healthy-Aging-only components.
  healthy_aging: {
    energyAlignment: 0.35,
    proteinAdequacy: 0.25,
    proteinDistribution: 0.15,
    nutrientDenseFoodCoverage: 0.15,
    healthyAgingFoodPattern: 0.1,
  },
} as const;

export const FOOD_FOUNDATION_TO_TOTAL_WEIGHT = 0.6;
export const GOAL_ALIGNMENT_TO_TOTAL_WEIGHT = 0.4;

export const ACTIVITY_MULTIPLIERS = {
  mostly_sitting: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
} as const;

export const ENERGY_CONFIG = {
  // ± tolerance applied around an activity-based maintenance midpoint.
  activityRangeTolerance: 0.075,
  // Broad maintenance range used when activity level is unknown.
  unknownActivityLowerMultiplier: 1.25,
  unknownActivityUpperMultiplier: 1.6,
  minimumEnergyConfidence: 0.65,
} as const;

// Initial goal-based offsets from estimated maintenance calories. Expressed
// as [lowerFractionBelowMaintenance, upperFractionBelowMaintenance] etc. —
// see energy.ts's calculateEnergyTargetRange for how these are applied.
export const GOAL_ENERGY_OFFSETS = {
  reduce_weight: { lowerPct: -0.15, upperPct: -0.05 },
  reduce_body_fat: { lowerPct: -0.15, upperPct: -0.05 },
  body_recomposition: { lowerPct: -0.05, upperPct: 0 },
  maintain_weight: { lowerPct: -0.05, upperPct: 0.05 },
  gain_muscle: { lowerPct: 0, upperPct: 0.1 },
  improve_nutrition: null,
  // Healthy Aging targets maintenance, deliberately no deficit or surplus.
  healthy_aging: { lowerPct: 0, upperPct: 0 },
} as const;

// Healthy Aging-specific configuration — kept separate from the shared
// GOAL_ENERGY_OFFSETS/GOAL_ALIGNMENT_WEIGHTS above since these are unique to
// this goal's formulas (steeper under-eating penalty, its own protein
// range, its own coverage-category targets).
export const HEALTHY_AGING_ENERGY_CONFIG = {
  // Coefficients for the piecewise energy-adequacy formula — steeper below
  // the range (400) than above it (250), so inadequate intake is treated
  // more seriously than an equivalent excess. Documented as an explainable
  // product-scoring formula, not a clinically validated diagnostic
  // equation.
  belowRangeCoefficient: 400,
  aboveRangeCoefficient: 250,
  // Secondary reasonableness check only (never the primary calculation,
  // and never applied blindly at extreme body weights — see energy.ts).
  reasonablenessKcalPerKg: 30,
} as const;

export const HEALTHY_AGING_PROTEIN_CONFIG = {
  targetLowerGPerKg: 1.0,
  targetUpperGPerKg: 1.2,
  // Piecewise interpolation breakpoints below the target (see
  // food-foundation.ts's calculateHealthyAgingProteinScore).
  midBreakpointGPerKg: 0.6,
  midBreakpointScore: 40,
} as const;

export const HEALTHY_AGING_PROTEIN_DISTRIBUTION_CONFIG = {
  // meaningfulProteinThresholdGrams = clamp(0.3 * weightKg, 20, 30)
  perKgGrams: 0.3,
  minThresholdGrams: 20,
  maxThresholdGrams: 30,
  targetMeaningfulProteinMealsPerDay: 2.5,
} as const;

export const HEALTHY_AGING_COVERAGE_CONFIG = {
  // A category counts as "present" for a day it appears at least once;
  // categoryScore = clamp(daysPresent / targetDays, 0, 1) * 100 — presence
  // across the window, not an every-day requirement.
  targetDaysPresentOutOf14: 6,
  categoryWeights: {
    calcium_rich_or_fortified_foods: 1,
    b12_containing_or_fortified_foods: 1,
    legumes_or_soy: 1,
    vegetables_including_leafy_vegetables: 1,
    fruit: 1,
    whole_grains_or_high_fibre_starches: 1,
    nuts_and_seeds: 1,
  },
} as const;

export const HEALTHY_AGING_FOOD_PATTERN_CONFIG = {
  // Positive coverage (varied, nutrient-dense foods already tagged via
  // healthyAgingCoverageGroups) dominates this component; the "concern"
  // reduction is intentionally small so one fried meal/packaged snack/
  // restaurant visit barely moves it — only sustained, high-confidence
  // repeated exposure does.
  positiveCoverageWeight: 0.85,
  concernReductionWeight: 0.15,
  // Cap on how much repeated concern-food exposure can pull the component
  // down, so it never dominates or double-counts what the general Food
  // Foundation's processing-level component already scores.
  maxConcernPenaltyPoints: 25,
} as const;

// Significant unintentional weight loss — a safety signal, not a routine
// score-optimization opportunity (see calculate.ts's safety escalation
// check). Kept configurable/documented per the spec.
export const HEALTHY_AGING_SAFETY_CONFIG = {
  significantWeightLossPercent: 0.05,
  weightLossLookbackDays: 180,
} as const;

export const WEIGHT_CALIBRATION_CONFIG = {
  minimumWeighIns: 6,
  lookbackDays: 21,
  minimumMealConfidence: 0.7,
  maximumAdjustmentPerCycle: 0.05,
} as const;

// A meaningful protein serving for protein-distribution purposes — used by
// recommendations.ts and goal-alignment.ts, not an absolute macro target.
export const MEANINGFUL_PROTEIN_SERVING_G = 15;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
