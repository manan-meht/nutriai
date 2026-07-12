import { FOOD_BALANCE_CONFIG } from "./constants";
import type { FoodBalanceMealInput } from "./types";

/** Minimum AI confidence for an uncorrected meal to count as eligible —
 * user-corrected/confirmed meals always count regardless of this. */
const MIN_ACCEPTABLE_AI_CONFIDENCE = 0.5;

export function isMealEligible(meal: FoodBalanceMealInput): boolean {
  if (meal.isDeleted) return false;
  if (meal.isDuplicate) return false;
  if (meal.calories == null && meal.proteinG == null) return false;
  if (meal.isUserCorrected || meal.isUserConfirmed) return true;
  return (meal.aiConfidence ?? 0) >= MIN_ACCEPTABLE_AI_CONFIDENCE;
}

export function filterEligibleMeals(meals: FoodBalanceMealInput[]): FoodBalanceMealInput[] {
  return meals.filter(isMealEligible);
}

export function countDistinctLoggingDays(meals: FoodBalanceMealInput[]): number {
  const days = new Set(meals.map((m) => m.loggedAt.slice(0, 10)));
  return days.size;
}

export interface EligibilityResult {
  eligible: boolean;
  eligibleMealCount: number;
  distinctLoggingDays: number;
  requiredMealCount: number;
  requiredLoggingDays: number;
}

/** Meals passed in should already be windowed to whatever period the caller
 * wants eligibility judged over (typically the full historical set, not just
 * the 14-day scoring window — a user who logged heavily last month and has
 * gone quiet this week should hit "refreshing_data", not "collecting_data";
 * see isRefreshingData). */
export function isFoodBalanceScoreEligible(meals: FoodBalanceMealInput[]): EligibilityResult {
  const eligibleMeals = filterEligibleMeals(meals);
  const eligibleMealCount = eligibleMeals.length;
  const distinctLoggingDays = countDistinctLoggingDays(eligibleMeals);
  return {
    eligible:
      eligibleMealCount >= FOOD_BALANCE_CONFIG.minEligibleMeals &&
      distinctLoggingDays >= FOOD_BALANCE_CONFIG.minDistinctLoggingDays,
    eligibleMealCount,
    distinctLoggingDays,
    requiredMealCount: FOOD_BALANCE_CONFIG.minEligibleMeals,
    requiredLoggingDays: FOOD_BALANCE_CONFIG.minDistinctLoggingDays,
  };
}

/** True when the user has enough historical data to have been eligible
 * before, but recent (scoring-window) coverage has dropped too low to trust
 * a fresh calculation — the "Refreshing your Food Balance Score" state. */
export function isRefreshingData(
  allTimeEligibility: EligibilityResult,
  recentMeals: FoodBalanceMealInput[]
): boolean {
  if (!allTimeEligibility.eligible) return false;
  const recentEligibility = isFoodBalanceScoreEligible(recentMeals);
  return !recentEligibility.eligible;
}
