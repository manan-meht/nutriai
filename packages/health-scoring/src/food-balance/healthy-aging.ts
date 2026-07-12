// Healthy Aging-specific component calculators — kept in their own module
// rather than added to food-foundation.ts/goal-alignment.ts's general logic,
// since every formula here is unique to this one goal (per the "smallest
// clean extension" instruction: no other goal's calculation is touched).
import {
  clamp,
  HEALTHY_AGING_COVERAGE_CONFIG,
  HEALTHY_AGING_FOOD_PATTERN_CONFIG,
  HEALTHY_AGING_PROTEIN_CONFIG,
  HEALTHY_AGING_PROTEIN_DISTRIBUTION_CONFIG,
} from "./constants";
import type { FoodBalanceMealInput, HealthyAgingCoverageGroup } from "./types";

function interpolate(value: number, fromLow: number, fromHigh: number, toLow: number, toHigh: number): number {
  if (fromHigh === fromLow) return toHigh;
  const t = (value - fromLow) / (fromHigh - fromLow);
  return toLow + t * (toHigh - toLow);
}

/** Piecewise protein-adequacy score for Healthy Aging: full score at or
 * above 1.0 g/kg/day, no additional reward above the 1.0-1.2 g/kg target
 * range (this component never rewards "more protein" past adequacy — that
 * would make it behave like a muscle-gain goal). */
export function calculateHealthyAgingProteinScore(gramsPerKg: number): number {
  const { targetLowerGPerKg, midBreakpointGPerKg, midBreakpointScore } = HEALTHY_AGING_PROTEIN_CONFIG;
  if (gramsPerKg >= targetLowerGPerKg) return 100;
  if (gramsPerKg >= midBreakpointGPerKg) {
    return clamp(interpolate(gramsPerKg, midBreakpointGPerKg, targetLowerGPerKg, midBreakpointScore, 100), 0, 100);
  }
  return clamp(interpolate(gramsPerKg, 0, midBreakpointGPerKg, 0, midBreakpointScore), 0, 100);
}

/** A meaningful protein meal's threshold, per-user (see the spec's
 * 0.3 * weightKg clamped to 20-30g). */
export function meaningfulProteinThresholdGrams(weightKg: number): number {
  const { perKgGrams, minThresholdGrams, maxThresholdGrams } = HEALTHY_AGING_PROTEIN_DISTRIBUTION_CONFIG;
  return clamp(perKgGrams * weightKg, minThresholdGrams, maxThresholdGrams);
}

export interface HealthyAgingProteinDistributionResult {
  score: number | null;
  confidence: number;
}

/** Rewards protein spread across ~2-3 meals/day rather than concentrated in
 * one — scored over the whole period's average, so one small breakfast or
 * an under-logged day doesn't read as a hard failure (reduces confidence
 * instead, via the days-with-any-meal-logged denominator). */
export function calculateHealthyAgingProteinDistribution(
  meals: FoodBalanceMealInput[],
  weightKg: number
): HealthyAgingProteinDistributionResult {
  const withProtein = meals.filter((m) => m.proteinG != null);
  if (withProtein.length === 0) return { score: null, confidence: 0 };

  const threshold = meaningfulProteinThresholdGrams(weightKg);
  const loggedDays = new Set(meals.map((m) => m.loggedAt.slice(0, 10)));
  const daysWithMeaningfulMealByDay = new Map<string, number>();
  for (const meal of withProtein) {
    if ((meal.proteinG ?? 0) < threshold) continue;
    const day = meal.loggedAt.slice(0, 10);
    daysWithMeaningfulMealByDay.set(day, (daysWithMeaningfulMealByDay.get(day) ?? 0) + 1);
  }

  const totalMeaningfulMeals = Array.from(daysWithMeaningfulMealByDay.values()).reduce((a, b) => a + b, 0);
  const dayCount = Math.max(1, loggedDays.size);
  const averageMeaningfulProteinMealsPerDay = totalMeaningfulMeals / dayCount;

  const score = clamp(
    (averageMeaningfulProteinMealsPerDay / HEALTHY_AGING_PROTEIN_DISTRIBUTION_CONFIG.targetMeaningfulProteinMealsPerDay) * 100,
    0,
    100
  );
  // Confidence reflects how many days actually have logged meals to judge
  // distribution from, not whether the pattern itself looks "good" —
  // under-logged days reduce confidence rather than counting as failures.
  const confidence = clamp(withProtein.length / meals.length, 0, 1);
  return { score, confidence };
}

export interface HealthyAgingCoverageResult {
  score: number | null;
  confidence: number;
}

/** Presence-based coverage across configurable categories — a category
 * scores fully once it's appeared on enough distinct days within the
 * window, not every single day. Never claims measured micronutrient
 * adequacy — purely "this food group showed up regularly." Unknown/
 * untagged meals are excluded from the denominator rather than counted as
 * "missing" categories. */
export function calculateHealthyAgingCoverage(meals: FoodBalanceMealInput[]): HealthyAgingCoverageResult {
  const tagged = meals.filter((m) => (m.healthyAgingCoverageGroups?.length ?? 0) > 0);
  if (tagged.length === 0) return { score: null, confidence: 0 };

  const daysByGroup = new Map<HealthyAgingCoverageGroup, Set<string>>();
  for (const meal of tagged) {
    const day = meal.loggedAt.slice(0, 10);
    for (const group of meal.healthyAgingCoverageGroups ?? []) {
      if (!daysByGroup.has(group)) daysByGroup.set(group, new Set());
      daysByGroup.get(group)!.add(day);
    }
  }

  const categories = Object.keys(HEALTHY_AGING_COVERAGE_CONFIG.categoryWeights) as HealthyAgingCoverageGroup[];
  const targetDays = HEALTHY_AGING_COVERAGE_CONFIG.targetDaysPresentOutOf14;

  let weightedSum = 0;
  let totalWeight = 0;
  for (const category of categories) {
    const weight = HEALTHY_AGING_COVERAGE_CONFIG.categoryWeights[category];
    const daysPresent = daysByGroup.get(category)?.size ?? 0;
    const categoryScore = clamp(daysPresent / targetDays, 0, 1) * 100;
    weightedSum += categoryScore * weight;
    totalWeight += weight;
  }

  const score = totalWeight > 0 ? weightedSum / totalWeight : null;
  const confidence = clamp(tagged.length / meals.length, 0, 1);
  return { score, confidence };
}

export interface HealthyAgingFoodPatternResult {
  score: number | null;
  confidence: number;
}

/** Rewards the same varied, nutrient-dense pattern Nutrient-Dense Food
 * Coverage measures (reused here as the dominant positive signal, avoiding
 * a separate duplicate calculation), with only a small, capped reduction
 * for high-confidence repeated exposure to processed meat / excessively
 * salty packaged food / deep-fried / nutritionally-limited ultra-processed
 * foods — deliberately small so one fried meal or restaurant visit barely
 * moves it, matching the spec's "avoid excessive double-counting" with the
 * general Food Foundation's own processing-level component. */
export function calculateHealthyAgingFoodPattern(
  meals: FoodBalanceMealInput[],
  coverageScore: number | null,
  coverageConfidence: number
): HealthyAgingFoodPatternResult {
  if (coverageScore == null) return { score: null, confidence: 0 };

  const concernMeals = meals.filter((m) => m.isHealthyAgingPatternConcern);
  const concernShare = meals.length > 0 ? concernMeals.length / meals.length : 0;
  const concernPenalty = clamp(concernShare * 100, 0, HEALTHY_AGING_FOOD_PATTERN_CONFIG.maxConcernPenaltyPoints);

  const score = clamp(
    HEALTHY_AGING_FOOD_PATTERN_CONFIG.positiveCoverageWeight * coverageScore +
      HEALTHY_AGING_FOOD_PATTERN_CONFIG.concernReductionWeight * (100 - concernPenalty),
    0,
    100
  );
  return { score, confidence: coverageConfidence };
}
