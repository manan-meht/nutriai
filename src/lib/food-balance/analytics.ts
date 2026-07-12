// Mirrors src/lib/feedback/analytics.ts's stub pattern — no analytics
// backend is wired up anywhere in this repo yet, so this is a console.debug
// placeholder, trivial to swap for a real call later without touching call
// sites. Never pass raw weight, height, calorie intake, individual foods,
// or medical information — only categorical properties (plan/source/etc).
export type FoodBalanceAnalyticsEvent =
  | "food_balance_collecting_state_viewed"
  | "food_balance_score_viewed"
  | "food_balance_breakdown_opened"
  | "food_balance_recommendation_viewed"
  | "food_balance_recommendation_selected"
  | "food_balance_profile_prompt_opened"
  | "food_balance_profile_completed";

export function trackFoodBalanceEvent(event: FoodBalanceAnalyticsEvent, properties?: Record<string, unknown>): void {
  console.debug("[food-balance-analytics]", event, properties);
}
