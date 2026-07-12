import { clamp, GOAL_ALIGNMENT_WEIGHTS, MEANINGFUL_PROTEIN_SERVING_G } from "./constants";
import { calculateEnergyAlignmentScore, calculateEnergyTargetRange, hasSufficientEnergyConfidence } from "./energy";
import { scoreAgainstRange } from "./food-foundation";
import { fibreTargetG, proteinTargetG, carbTargetG } from "./targets";
import type { ComponentScore, FoodBalanceComponentScores, FoodBalanceMealInput, FoodBalanceUserProfile, NutritionGoal } from "./types";

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function toComponent(score: number | null, weight: number, label: string, confidence: number): ComponentScore {
  return { score: score == null ? null : clamp(score, 0, 100), weight, label, confidence };
}

function weightedAverage(parts: Array<{ value: number | null; weight: number }>): number | null {
  const known = parts.filter((p): p is { value: number; weight: number } => p.value != null);
  const totalWeight = known.reduce((s, p) => s + p.weight, 0);
  if (totalWeight === 0) return null;
  return known.reduce((s, p) => s + p.value * p.weight, 0) / totalWeight;
}

/** Whether the day-to-day calorie/protein pattern is reasonably stable
 * across the window — a coefficient-of-variation-style measure that doesn't
 * penalize one-off higher or lower days heavily. */
function calculateIntakeConsistencyScore(meals: FoodBalanceMealInput[]): { score: number | null; confidence: number } {
  const byDay = new Map<string, number>();
  for (const meal of meals) {
    if (meal.calories == null) continue;
    const day = meal.loggedAt.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + meal.calories);
  }
  const dailyTotals = Array.from(byDay.values());
  if (dailyTotals.length < 3) return { score: null, confidence: 0 };

  const mean = dailyTotals.reduce((a, b) => a + b, 0) / dailyTotals.length;
  if (mean === 0) return { score: null, confidence: 0 };
  const variance = dailyTotals.reduce((s, v) => s + (v - mean) ** 2, 0) / dailyTotals.length;
  const stdDev = Math.sqrt(variance);
  const coefficientOfVariation = stdDev / mean;

  // A gentle mapping: ~15% day-to-day variation or less scores near 100;
  // consistency degrades gradually past that rather than a hard cliff, so
  // one celebratory day doesn't tank the score.
  const score = clamp(100 - 200 * Math.max(0, coefficientOfVariation - 0.15), 0, 100);
  const confidence = clamp(dailyTotals.length / 10, 0, 1);
  return { score, confidence };
}

function calculateProteinDistributionScore(meals: FoodBalanceMealInput[]): { score: number | null; confidence: number } {
  const mainMeals = meals.filter((m) => m.mealType && m.mealType !== "snack" && m.proteinG != null);
  if (mainMeals.length === 0) return { score: null, confidence: 0 };
  const meaningfulProteinMeals = mainMeals.filter((m) => (m.proteinG ?? 0) >= MEANINGFUL_PROTEIN_SERVING_G).length;
  const score = clamp((meaningfulProteinMeals / mainMeals.length) * 100, 0, 100);
  const confidence = clamp(mainMeals.length / meals.length, 0, 1);
  return { score, confidence };
}

/** Carbohydrate adequacy as a stand-in for "carbohydrate support" — training
 * timing isn't tracked by the product today, so this uses general
 * carbohydrate-target adequacy rather than pretending to know workout days
 * (per the spec's explicit guidance for this case). */
function calculateCarbohydrateSupportScore(meals: FoodBalanceMealInput[], profile?: Pick<FoodBalanceUserProfile, "currentWeightKg">): { score: number | null; confidence: number } {
  const avgCarbs = average(meals.filter((m) => m.carbsG != null).map((m) => m.carbsG!));
  if (avgCarbs == null) return { score: null, confidence: 0 };
  const score = scoreAgainstRange(avgCarbs, carbTargetG(profile));
  const withData = meals.filter((m) => m.carbsG != null).length;
  return { score, confidence: clamp(withData / meals.length, 0, 1) };
}

function calculateFibreAndMealVolumeScore(meals: FoodBalanceMealInput[]): { score: number | null; confidence: number } {
  const avgFibre = average(meals.filter((m) => m.fibreG != null).map((m) => m.fibreG!));
  if (avgFibre == null) return { score: null, confidence: 0 };
  const fibreScore = scoreAgainstRange(avgFibre, fibreTargetG());
  const withData = meals.filter((m) => m.fibreG != null).length;
  return { score: fibreScore, confidence: clamp(withData / meals.length, 0, 1) };
}

function calculateProteinAdequacyScore(
  meals: FoodBalanceMealInput[],
  profile?: Pick<FoodBalanceUserProfile, "currentWeightKg" | "goal" | "resistanceTraining">
): { score: number | null; confidence: number } {
  const avgProtein = average(meals.filter((m) => m.proteinG != null).map((m) => m.proteinG!));
  if (avgProtein == null) return { score: null, confidence: 0 };
  const score = scoreAgainstRange(avgProtein, proteinTargetG(profile));
  const withData = meals.filter((m) => m.proteinG != null).length;
  return { score, confidence: clamp(withData / meals.length, 0, 1) };
}

export interface GoalAlignmentResult {
  score: number | null;
  confidence: number;
  components: FoodBalanceComponentScores["goalAlignment"];
  missingInputs: string[];
  needsResistanceTrainingNote: boolean;
}

export function calculateGoalAlignmentScore(
  meals: FoodBalanceMealInput[],
  profile: FoodBalanceUserProfile,
  mealCoverageConfidence: number,
  portionEstimationConfidence: number
): GoalAlignmentResult {
  const missingInputs: string[] = [];
  const weights = GOAL_ALIGNMENT_WEIGHTS[profile.goal];

  if (!weights) {
    // improve_nutrition: Food Foundation carries the full score (see
    // calculate.ts) — Goal Alignment is intentionally absent, not zero.
    return { score: null, confidence: 0, components: {}, missingInputs: [], needsResistanceTrainingNote: false };
  }

  const proteinAdequacy = "proteinAdequacy" in weights ? calculateProteinAdequacyScore(meals, profile) : null;
  const intakeConsistency = "intakeConsistency" in weights ? calculateIntakeConsistencyScore(meals) : null;
  const fibreAndMealVolume = "fibreAndMealVolume" in weights ? calculateFibreAndMealVolumeScore(meals) : null;
  const fibreAdequacy = "fibreAdequacy" in weights ? calculateFibreAndMealVolumeScore(meals) : null;
  const carbohydrateSupport = "carbohydrateSupport" in weights ? calculateCarbohydrateSupportScore(meals, profile) : null;
  const proteinDistribution = "proteinDistribution" in weights ? calculateProteinDistributionScore(meals) : null;

  let energyScore: number | null = null;
  let energyConfidence = 0;
  if ("energyAlignment" in weights) {
    const energyRange = calculateEnergyTargetRange(profile, profile.goal);
    const sufficientConfidence = hasSufficientEnergyConfidence(profile, mealCoverageConfidence, portionEstimationConfidence);
    if (!energyRange || !sufficientConfidence) {
      missingInputs.push("energy");
    } else {
      const dailyCalories = meals.filter((m) => m.calories != null).map((m) => m.calories!);
      const days = new Set(meals.map((m) => m.loggedAt.slice(0, 10))).size || 1;
      const avgDailyCalories = dailyCalories.reduce((a, b) => a + b, 0) / days;
      energyScore = calculateEnergyAlignmentScore(avgDailyCalories, energyRange);
      energyConfidence = Math.min(mealCoverageConfidence, portionEstimationConfidence);
    }
  }

  const parts: Array<{ key: string; value: number | null; weight: number; confidence: number; label: string }> = [];
  // Omitted entirely (not pushed with a null score) when confidence is
  // insufficient — the Goal Alignment weights are renormalized over the
  // remaining components rather than the energy slot silently scoring 0.
  if ("energyAlignment" in weights && energyScore != null) {
    parts.push({ key: "energyAlignment", value: energyScore, weight: weights.energyAlignment, confidence: energyConfidence, label: "Energy alignment" });
  }
  if (proteinAdequacy) parts.push({ key: "proteinAdequacy", value: proteinAdequacy.score, weight: (weights as any).proteinAdequacy, confidence: proteinAdequacy.confidence, label: "Protein adequacy" });
  if (fibreAndMealVolume) parts.push({ key: "fibreAndMealVolume", value: fibreAndMealVolume.score, weight: (weights as any).fibreAndMealVolume, confidence: fibreAndMealVolume.confidence, label: "Fibre and meal volume" });
  if (fibreAdequacy) parts.push({ key: "fibreAdequacy", value: fibreAdequacy.score, weight: (weights as any).fibreAdequacy, confidence: fibreAdequacy.confidence, label: "Fibre adequacy" });
  if (intakeConsistency) parts.push({ key: "intakeConsistency", value: intakeConsistency.score, weight: (weights as any).intakeConsistency, confidence: intakeConsistency.confidence, label: "Intake consistency" });
  if (carbohydrateSupport) parts.push({ key: "carbohydrateSupport", value: carbohydrateSupport.score, weight: (weights as any).carbohydrateSupport, confidence: carbohydrateSupport.confidence, label: "Carbohydrate support" });
  if (proteinDistribution) parts.push({ key: "proteinDistribution", value: proteinDistribution.score, weight: (weights as any).proteinDistribution, confidence: proteinDistribution.confidence, label: "Protein distribution" });

  const score = weightedAverage(parts.map((p) => ({ value: p.value, weight: p.weight })));

  const components: FoodBalanceComponentScores["goalAlignment"] = {};
  for (const part of parts) {
    (components as any)[part.key] = toComponent(part.value, part.weight, part.label, part.confidence);
    if (part.value == null && part.key !== "energyAlignment") missingInputs.push(part.key);
  }

  const knownParts = parts.filter((p) => p.value != null);
  const confidence = knownParts.length > 0 ? knownParts.reduce((s, p) => s + p.confidence, 0) / knownParts.length : 0;

  const needsResistanceTrainingNote =
    profile.goal === "gain_muscle" && profile.resistanceTraining !== "regularly" && profile.resistanceTraining !== "sometimes";

  return { score, confidence, components, missingInputs, needsResistanceTrainingNote };
}

export function goalRequiresCalorieComponent(goal: NutritionGoal): boolean {
  return goal !== "improve_nutrition";
}
