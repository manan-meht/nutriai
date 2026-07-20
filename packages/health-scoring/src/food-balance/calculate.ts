import { FOOD_BALANCE_CONFIG, FOOD_BALANCE_SCORING_VERSION, FOOD_FOUNDATION_TO_TOTAL_WEIGHT, GOAL_ALIGNMENT_TO_TOTAL_WEIGHT, clamp } from "./constants";
import { calculateFoodBalanceConfidence, calculateMealCoverageConfidence, calculatePortionEstimationConfidence } from "./confidence";
import { isFoodBalanceScoreEligible, isRefreshingData, filterEligibleMeals } from "./eligibility";
import { calculateFoodFoundationScore } from "./food-foundation";
import { calculateGoalAlignmentScore } from "./goal-alignment";
import { getFoodBalanceRecommendations } from "./recommendations";
import type {
  FoodBalanceComponentScores,
  FoodBalanceMealInput,
  FoodBalanceScoreResult,
  FoodBalanceUserProfile,
} from "./types";

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 86_400_000;
}

function withinWindow(meal: FoodBalanceMealInput, now: Date, days: number): boolean {
  return daysBetween(now, new Date(meal.loggedAt)) <= days;
}

/** Splits the scoring window into the recent 7 days (60% of the evidence)
 * and the older 8-14 days (40%) per the spec's mild recency weighting, and
 * blends the Food Foundation / Goal Alignment scores computed on each
 * subset. This is applied at the score level rather than re-deriving every
 * underlying nutrient average twice, which keeps the component-scoring
 * functions simple while still ensuring one recent unusual day can't swing
 * the blended score too far (it's capped at 60% influence). */
function recencyWeightedScore(
  computeForMeals: (meals: FoodBalanceMealInput[]) => number | null,
  recentMeals: FoodBalanceMealInput[],
  olderMeals: FoodBalanceMealInput[]
): number | null {
  const recentScore = recentMeals.length > 0 ? computeForMeals(recentMeals) : null;
  const olderScore = olderMeals.length > 0 ? computeForMeals(olderMeals) : null;

  if (recentScore != null && olderScore != null) {
    return FOOD_BALANCE_CONFIG.recentWindowWeight * recentScore + FOOD_BALANCE_CONFIG.olderWindowWeight * olderScore;
  }
  return recentScore ?? olderScore;
}

export interface CalculateFoodBalanceScoreInput {
  /** All of the user's meals — not pre-filtered to the scoring window; this
   * function does the windowing and eligibility checks itself so status
   * (collecting_data vs refreshing_data vs a real score) is correct. */
  allMeals: FoodBalanceMealInput[];
  profile?: FoodBalanceUserProfile;
  /** The previously displayed (already-smoothed) score, if one exists —
   * required for exponential smoothing; omit for a first-ever calculation. */
  previousDisplayedScore?: number | null;
  previousPeriodRawScore?: number | null;
  now?: Date;
}

function buildEmptyComponentScores(): FoodBalanceComponentScores {
  const empty = { score: null, weight: 0, label: "", confidence: 0 };
  return {
    foodFoundation: {
      macroAndFibreBalance: { ...empty, label: "Macro and fibre balance" },
      minimallyProcessedFoodBalance: { ...empty, label: "Minimally processed food balance" },
      fruitAndVegetableIntake: { ...empty, label: "Fruits and vegetables" },
      foodDiversity: { ...empty, label: "Food diversity" },
      homePreparedMealShare: { ...empty, label: "Home-prepared meals" },
    },
    goalAlignment: {},
  };
}

export function calculateFoodBalanceScore(input: CalculateFoodBalanceScoreInput): FoodBalanceScoreResult {
  const now = input.now ?? new Date();
  const allTimeEligibility = isFoodBalanceScoreEligible(input.allMeals);

  const windowMeals = input.allMeals.filter((m) => withinWindow(m, now, FOOD_BALANCE_CONFIG.scoringWindowDays));
  const eligibleWindowMeals = filterEligibleMeals(windowMeals);

  const dataCoverage = {
    eligibleMealCount: allTimeEligibility.eligibleMealCount,
    requiredMealCount: allTimeEligibility.requiredMealCount,
    distinctLoggingDays: allTimeEligibility.distinctLoggingDays,
    requiredLoggingDays: allTimeEligibility.requiredLoggingDays,
    recentEligibleMealCount: eligibleWindowMeals.length,
  };

  if (!allTimeEligibility.eligible) {
    return {
      score: null,
      rawScore: null,
      status: "collecting_data",
      scoringVersion: FOOD_BALANCE_SCORING_VERSION,
      foodFoundationScore: null,
      goalAlignmentScore: null,
      componentScores: null,
      recommendations: [],
      confidence: 0,
      dataCoverage,
      missingGoalAlignmentInputs: [],
      calculatedAt: null,
    };
  }

  if (isRefreshingData(allTimeEligibility, windowMeals)) {
    return {
      score: null,
      rawScore: null,
      status: "refreshing_data",
      scoringVersion: FOOD_BALANCE_SCORING_VERSION,
      foodFoundationScore: null,
      goalAlignmentScore: null,
      componentScores: null,
      recommendations: [],
      confidence: 0,
      dataCoverage,
      missingGoalAlignmentInputs: [],
      calculatedAt: null,
    };
  }

  const recentMeals = eligibleWindowMeals.filter((m) => withinWindow(m, now, FOOD_BALANCE_CONFIG.recentWindowDays));
  const olderMeals = eligibleWindowMeals.filter((m) => !withinWindow(m, now, FOOD_BALANCE_CONFIG.recentWindowDays));

  const foodFoundationFull = calculateFoodFoundationScore(eligibleWindowMeals, input.profile);
  const foodFoundationScore = recencyWeightedScore(
    (meals) => calculateFoodFoundationScore(meals, input.profile).score,
    recentMeals,
    olderMeals
  );

  const mealCoverageConfidence = calculateMealCoverageConfidence(eligibleWindowMeals);
  const portionEstimationConfidence = calculatePortionEstimationConfidence(eligibleWindowMeals);

  const goals = input.profile?.goals ?? ["improve_nutrition"];
  const goalAlignmentFull =
    input.profile && goals.some((g) => g !== "improve_nutrition")
      ? calculateGoalAlignmentScore(eligibleWindowMeals, input.profile, mealCoverageConfidence, portionEstimationConfidence)
      : null;

  const goalAlignmentScore =
    goalAlignmentFull && input.profile
      ? recencyWeightedScore(
          (meals) => calculateGoalAlignmentScore(meals, input.profile!, mealCoverageConfidence, portionEstimationConfidence).score,
          recentMeals,
          olderMeals
        )
      : null;

  const componentScores: FoodBalanceComponentScores = {
    foodFoundation: foodFoundationFull.components,
    goalAlignment: goalAlignmentFull?.components ?? {},
  };

  let rawScore: number;
  let status: FoodBalanceScoreResult["status"];

  if (goalAlignmentFull == null || goalAlignmentScore == null) {
    rawScore = foodFoundationScore ?? 0;
    status = "foundation_only";
  } else {
    rawScore = FOOD_FOUNDATION_TO_TOTAL_WEIGHT * (foodFoundationScore ?? 0) + GOAL_ALIGNMENT_TO_TOTAL_WEIGHT * goalAlignmentScore;
    const missingCount = goalAlignmentFull?.missingInputs.length ?? 0;
    status = missingCount === 0 ? "fully_personalized" : "partially_personalized";
  }

  rawScore = clamp(rawScore, 0, 100);

  const displayedScore =
    input.previousDisplayedScore == null
      ? rawScore
      : FOOD_BALANCE_CONFIG.smoothingPreviousWeight * input.previousDisplayedScore +
        FOOD_BALANCE_CONFIG.smoothingNewWeight * rawScore;

  const confidenceResult = calculateFoodBalanceConfidence(eligibleWindowMeals, input.profile);
  const recommendations = getFoodBalanceRecommendations(componentScores);

  return {
    score: Math.round(clamp(displayedScore, 0, 100)),
    rawScore,
    status,
    scoringVersion: FOOD_BALANCE_SCORING_VERSION,
    foodFoundationScore: foodFoundationScore != null ? Math.round(foodFoundationScore) : null,
    goalAlignmentScore: goalAlignmentScore != null ? Math.round(goalAlignmentScore) : null,
    componentScores,
    recommendations,
    confidence: confidenceResult.value,
    dataCoverage,
    missingGoalAlignmentInputs: goalAlignmentFull?.missingInputs ?? [],
    calculatedAt: now.toISOString(),
  };
}

export { buildEmptyComponentScores };
