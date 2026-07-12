import {
  clamp,
  FOOD_FOUNDATION_WEIGHTS,
  MACRO_AND_FIBRE_WEIGHTS,
  FRUIT_AND_VEGETABLE_WEIGHTS,
  FOOD_DIVERSITY_WEIGHTS,
  FOOD_DIVERSITY_TARGETS,
  HOME_PREPARED_TARGET_SHARE,
  ULTRA_PROCESSED_PENALTY_MULTIPLIER,
  FRUIT_VEGETABLE_TARGETS,
} from "./constants";
import { proteinTargetG, fibreTargetG, carbTargetG, fatTargetG, type NutrientTargetRange } from "./targets";
import type { ComponentScore, FoodBalanceComponentScores, FoodBalanceMealInput, FoodBalanceUserProfile } from "./types";

export function scoreAgainstRange(value: number, range: NutrientTargetRange): number {
  if (value >= range.lower && value <= range.upper) return 100;
  if (value < range.lower) return clamp(100 * (value / range.lower), 0, 100);
  return clamp(100 - (100 * (value - range.upper)) / range.upperTolerance, 0, 100);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function windowDays(meals: FoodBalanceMealInput[]): number {
  if (meals.length === 0) return 1;
  const days = new Set(meals.map((m) => m.loggedAt.slice(0, 10)));
  return Math.max(1, days.size);
}

/** Weighted average of `{ value, weight }` pairs, renormalizing over
 * whichever subset actually has data — used throughout so that a missing
 * subcomponent (e.g. no reliable fibre estimate) doesn't silently drag the
 * parent score down via an implicit zero. */
function weightedAverage(parts: Array<{ value: number | null; weight: number }>): number | null {
  const known = parts.filter((p): p is { value: number; weight: number } => p.value != null);
  const totalWeight = known.reduce((s, p) => s + p.weight, 0);
  if (totalWeight === 0) return null;
  return known.reduce((s, p) => s + p.value * p.weight, 0) / totalWeight;
}

function toComponent(score: number | null, weight: number, label: string, confidence: number): ComponentScore {
  return { score: score == null ? null : clamp(score, 0, 100), weight, label, confidence };
}

export function calculateMacroAndFibreBalance(
  meals: FoodBalanceMealInput[],
  profile?: Pick<FoodBalanceUserProfile, "currentWeightKg" | "goal" | "resistanceTraining">
): { score: number | null; confidence: number } {
  const days = windowDays(meals);
  const avgProtein = average(meals.filter((m) => m.proteinG != null).map((m) => m.proteinG!));
  const avgCarbs = average(meals.filter((m) => m.carbsG != null).map((m) => m.carbsG!));
  const avgFat = average(meals.filter((m) => m.fatG != null).map((m) => m.fatG!));
  const avgFibre = average(meals.filter((m) => m.fibreG != null).map((m) => m.fibreG!));

  const proteinScore = avgProtein != null ? scoreAgainstRange(avgProtein, proteinTargetG(profile)) : null;
  const carbScore = avgCarbs != null ? scoreAgainstRange(avgCarbs, carbTargetG(profile)) : null;
  const fatScore = avgFat != null ? scoreAgainstRange(avgFat, fatTargetG(profile)) : null;
  const fibreScore = avgFibre != null ? scoreAgainstRange(avgFibre, fibreTargetG()) : null;

  const score = weightedAverage([
    { value: proteinScore, weight: MACRO_AND_FIBRE_WEIGHTS.proteinAdequacy },
    { value: carbScore, weight: MACRO_AND_FIBRE_WEIGHTS.carbohydrateBalance },
    { value: fatScore, weight: MACRO_AND_FIBRE_WEIGHTS.fatBalance },
    { value: fibreScore, weight: MACRO_AND_FIBRE_WEIGHTS.fibreAdequacy },
  ]);

  const knownSubcomponents = [proteinScore, carbScore, fatScore, fibreScore].filter((s) => s != null).length;
  const confidence = clamp((knownSubcomponents / 4) * Math.min(1, days / 7), 0, 1);
  return { score, confidence };
}

export function calculateMinimallyProcessedScore(
  meals: FoodBalanceMealInput[]
): { score: number | null; confidence: number } {
  // Unknown processing classifications are excluded from the denominator —
  // they must not be treated as automatically ultra-processed.
  const known = meals.filter((m) => m.processingLevel && m.processingLevel !== "unknown");
  if (known.length === 0) return { score: null, confidence: 0 };

  const totalConfidenceWeight = known.reduce((s, m) => s + (m.processingConfidence ?? 1), 0);
  const ultraProcessedWeight = known
    .filter((m) => m.processingLevel === "ultra_processed")
    .reduce((s, m) => s + (m.processingConfidence ?? 1), 0);

  const ultraProcessedPercentage = totalConfidenceWeight > 0 ? (ultraProcessedWeight / totalConfidenceWeight) * 100 : 0;
  const score = clamp(100 - ULTRA_PROCESSED_PENALTY_MULTIPLIER * ultraProcessedPercentage, 0, 100);
  const confidence = clamp(known.length / meals.length, 0, 1);
  return { score, confidence };
}

export function calculateFruitAndVegetableScore(meals: FoodBalanceMealInput[]): { score: number | null; confidence: number } {
  const days = windowDays(meals);
  const withData = meals.filter((m) => m.fruitServings != null || m.vegetableServings != null);
  if (withData.length === 0) return { score: null, confidence: 0 };

  const totalFruitAndVeg = withData.reduce((s, m) => s + (m.fruitServings ?? 0) + (m.vegetableServings ?? 0), 0);
  const totalVeg = withData.reduce((s, m) => s + (m.vegetableServings ?? 0), 0);

  const avgDailyCombined = totalFruitAndVeg / days;
  const avgDailyVeg = totalVeg / days;

  const combinedScore = clamp((avgDailyCombined / FRUIT_VEGETABLE_TARGETS.combinedDailyServings) * 100, 0, 100);
  const vegetableScore = clamp((avgDailyVeg / FRUIT_VEGETABLE_TARGETS.vegetableDailyServings) * 100, 0, 100);

  const score =
    FRUIT_AND_VEGETABLE_WEIGHTS.combined * combinedScore + FRUIT_AND_VEGETABLE_WEIGHTS.vegetableOnly * vegetableScore;
  const confidence = clamp(withData.length / meals.length, 0, 1);
  return { score, confidence };
}

// Herbs/spices count fractionally toward variety so a heavily spiced meal
// doesn't distort the score — callers should tag these foods distinctly if
// they want fractional counting; this list is a minimal built-in default.
const FRACTIONAL_HERB_SPICE_WEIGHT = 0.25;
const KNOWN_HERBS_AND_SPICES = new Set([
  "coriander", "cilantro", "mint", "basil", "turmeric", "cumin", "ginger", "garlic", "chili", "pepper", "cinnamon",
]);

export function calculateFoodDiversityScore(meals: FoodBalanceMealInput[]): { score: number | null; confidence: number } {
  const withFoods = meals.filter((m) => (m.wholeFoods?.length ?? 0) > 0 || (m.foodGroups?.length ?? 0) > 0);
  if (withFoods.length === 0) return { score: null, confidence: 0 };

  const foodWeights = new Map<string, number>();
  for (const meal of withFoods) {
    for (const food of meal.wholeFoods ?? []) {
      const key = food.trim().toLowerCase();
      const weight = KNOWN_HERBS_AND_SPICES.has(key) ? FRACTIONAL_HERB_SPICE_WEIGHT : 1;
      foodWeights.set(key, Math.max(foodWeights.get(key) ?? 0, weight));
    }
  }
  const uniqueWholeFoodCount = Array.from(foodWeights.values()).reduce((a, b) => a + b, 0);
  const wholeFoodVarietyScore = clamp((uniqueWholeFoodCount / FOOD_DIVERSITY_TARGETS.uniqueWholeFoodTarget) * 100, 0, 100);

  const presentGroups = new Set<string>();
  for (const meal of withFoods) {
    for (const group of meal.foodGroups ?? []) presentGroups.add(group);
  }
  const foodGroupCoverageScore = clamp((presentGroups.size / FOOD_DIVERSITY_TARGETS.totalFoodGroups) * 100, 0, 100);

  const score =
    FOOD_DIVERSITY_WEIGHTS.wholeFoodVariety * wholeFoodVarietyScore +
    FOOD_DIVERSITY_WEIGHTS.foodGroupCoverage * foodGroupCoverageScore;
  const confidence = clamp(withFoods.length / meals.length, 0, 1);
  return { score, confidence };
}

export function calculateHomePreparedScore(meals: FoodBalanceMealInput[]): { score: number | null; confidence: number } {
  // Unknown preparation source is excluded from the denominator rather than
  // counted as restaurant/packaged food.
  const known = meals.filter((m) => m.preparationSource && m.preparationSource !== "unknown");
  if (known.length === 0) return { score: null, confidence: 0 };

  const totalWeight = known.reduce((s, m) => s + (m.preparationConfidence ?? 1), 0);
  const homePreparedWeight = known
    .filter((m) => m.preparationSource === "home_prepared")
    .reduce((s, m) => s + (m.preparationConfidence ?? 1), 0);

  const homePreparedShare = totalWeight > 0 ? homePreparedWeight / totalWeight : 0;
  const score = clamp((homePreparedShare / HOME_PREPARED_TARGET_SHARE) * 100, 0, 100);
  const confidence = clamp(known.length / meals.length, 0, 1);
  return { score, confidence };
}

export interface FoodFoundationResult {
  score: number | null;
  confidence: number;
  components: FoodBalanceComponentScores["foodFoundation"];
}

export function calculateFoodFoundationScore(
  meals: FoodBalanceMealInput[],
  profile?: Pick<FoodBalanceUserProfile, "currentWeightKg" | "goal" | "resistanceTraining">
): FoodFoundationResult {
  const macro = calculateMacroAndFibreBalance(meals, profile);
  const processed = calculateMinimallyProcessedScore(meals);
  const fruitVeg = calculateFruitAndVegetableScore(meals);
  const diversity = calculateFoodDiversityScore(meals);
  const homePrepared = calculateHomePreparedScore(meals);

  const score = weightedAverage([
    { value: macro.score, weight: FOOD_FOUNDATION_WEIGHTS.macroAndFibreBalance },
    { value: processed.score, weight: FOOD_FOUNDATION_WEIGHTS.minimallyProcessedFoodBalance },
    { value: fruitVeg.score, weight: FOOD_FOUNDATION_WEIGHTS.fruitAndVegetableIntake },
    { value: diversity.score, weight: FOOD_FOUNDATION_WEIGHTS.foodDiversity },
    { value: homePrepared.score, weight: FOOD_FOUNDATION_WEIGHTS.homePreparedMealShare },
  ]);

  const components: FoodBalanceComponentScores["foodFoundation"] = {
    macroAndFibreBalance: toComponent(macro.score, FOOD_FOUNDATION_WEIGHTS.macroAndFibreBalance, "Macro and fibre balance", macro.confidence),
    minimallyProcessedFoodBalance: toComponent(
      processed.score,
      FOOD_FOUNDATION_WEIGHTS.minimallyProcessedFoodBalance,
      "Minimally processed food balance",
      processed.confidence
    ),
    fruitAndVegetableIntake: toComponent(
      fruitVeg.score,
      FOOD_FOUNDATION_WEIGHTS.fruitAndVegetableIntake,
      "Fruits and vegetables",
      fruitVeg.confidence
    ),
    foodDiversity: toComponent(diversity.score, FOOD_FOUNDATION_WEIGHTS.foodDiversity, "Food diversity", diversity.confidence),
    homePreparedMealShare: toComponent(
      homePrepared.score,
      FOOD_FOUNDATION_WEIGHTS.homePreparedMealShare,
      "Home-prepared meals",
      homePrepared.confidence
    ),
  };

  const confidence =
    [macro, processed, fruitVeg, diversity, homePrepared].reduce((s, c) => s + c.confidence, 0) / 5;

  return { score, confidence, components };
}
