/** Condition-agnostic dietary pattern profile — tracks which food
 * categories have actually been *observed* in a person's logged meals (or
 * *explicitly* chosen by them), never an assumed identity. See
 * update.ts's module doc for the confidence rules that gate observations,
 * and recommend.ts for how this drives food-balance suggestion copy. */
export type InferredPattern =
  | "plant_based_observed"
  | "vegetarian_observed"
  | "eggetarian_observed"
  | "pescatarian_observed"
  | "chicken_observed"
  | "mixed_diet_observed"
  | "unknown";

export interface DietaryProfile {
  observed_dairy: boolean;
  observed_lactose_dairy: boolean;
  observed_lactose_free_dairy: boolean;
  observed_eggs: boolean;
  observed_chicken: boolean;
  observed_fish: boolean;
  observed_shellfish: boolean;
  observed_red_meat: boolean;
  /** Tracked separately from observed_red_meat — many people who eat red
   * meat generally still don't eat beef specifically, often for religious
   * reasons (rule 9 still applies: this only records what's been observed
   * or explicitly said, never why). */
  observed_beef: boolean;
  observed_pork: boolean;
  observed_other_meat: boolean;
  inferred_pattern: InferredPattern;
  explicit_vegetarian: boolean;
  explicit_vegan: boolean;
  explicit_avoids_dairy: boolean;
  explicit_avoids_lactose: boolean;
  explicit_avoids_eggs: boolean;
  explicit_avoids_chicken: boolean;
  explicit_avoids_fish: boolean;
  explicit_avoids_red_meat: boolean;
  explicit_avoids_beef: boolean;
  explicit_avoids_pork: boolean;
  prefers_plant_based_suggestions: boolean;
  /** Recommendation-feedback fields (Food Balance Recommendations feature)
   * — reusing this same per-person profile rather than a parallel
   * "recommendation preferences" object, since these are still explicit
   * user signals about food, same category as the explicit_avoids_ fields
   * and prefers_plant_based_suggestions above. IDs reference FOOD_LIBRARY
   * item ids (see src/lib/food-balance/food-library.ts). */
  liked_suggestion_ids: string[];
  /** "I don't like this food" feedback — excluded from future suggestions
   * (see src/lib/food-balance/personalize.ts's isAllowed). Distinct from
   * explicit_avoids_* (which are whole-category safety rules); this is a
   * single-item preference, e.g. disliking Greek yogurt specifically
   * doesn't mean avoiding all dairy. */
  disliked_suggestion_ids: string[];
  /** "Not available where I live" feedback — deprioritized (not excluded
   * outright) in future ranking, see personalize.ts. */
  unavailable_suggestion_ids: string[];
  /** ISO timestamp, null until the profile has ever been updated. */
  last_updated_at: string | null;
}

export const DEFAULT_DIETARY_PROFILE: DietaryProfile = {
  observed_dairy: false,
  observed_lactose_dairy: false,
  observed_lactose_free_dairy: false,
  observed_eggs: false,
  observed_chicken: false,
  observed_fish: false,
  observed_shellfish: false,
  observed_red_meat: false,
  observed_beef: false,
  observed_pork: false,
  observed_other_meat: false,
  inferred_pattern: "unknown",
  explicit_vegetarian: false,
  explicit_vegan: false,
  explicit_avoids_dairy: false,
  explicit_avoids_lactose: false,
  explicit_avoids_eggs: false,
  explicit_avoids_chicken: false,
  explicit_avoids_fish: false,
  explicit_avoids_red_meat: false,
  explicit_avoids_beef: false,
  explicit_avoids_pork: false,
  prefers_plant_based_suggestions: false,
  liked_suggestion_ids: [],
  disliked_suggestion_ids: [],
  unavailable_suggestion_ids: [],
  last_updated_at: null,
};

/** The subset of a meal's classification this module needs — deliberately
 * narrow (not the full FoodAnalysisResult) so this stays testable without
 * importing the AI layer. Callers map their real analysis into this shape. */
export interface MealObservationInput {
  /** Food categories present in this meal, as already classified —
   * "dairy"/"lactose_dairy"/"lactose_free_dairy" are distinct from
   * food-analyzer's FoodCategory enum (which has no dairy category at all
   * yet) since dietary-profile tracking needs a finer split than portion
   * calculation does. */
  categories: DietCategory[];
  /** Overall meal identification confidence — mirrors
   * FoodAnalysisResult.confidence. */
  confidence: "high" | "medium" | "low";
  /** Mirrors FoodAnalysisResult.food_identity_confidence — specifically
   * about whether the food's identity (not just portion) is correct. */
  foodIdentityConfidence?: "high" | "medium" | "low";
  /** True when this observation comes from a user's own correction/
   * confirmation rather than a raw AI guess — always outranks AI
   * confidence per rule 13. */
  isUserCorrection?: boolean;
}

export type DietCategory =
  | "dairy"
  | "lactose_dairy"
  | "lactose_free_dairy"
  | "eggs"
  | "chicken"
  | "fish"
  | "shellfish"
  | "red_meat"
  | "beef"
  | "pork"
  | "other_meat";

/** Categories sensitive enough (rule 12) that a single high-confidence AI
 * observation isn't enough on its own to flip them — see update.ts. Beef
 * is included here even though it's already a fairly unambiguous visual
 * identification, because the cost of a false positive (recommending beef
 * to someone who doesn't eat it) is high enough to warrant the same
 * extra-confirmation bar as pork/shellfish. */
export const SENSITIVE_CATEGORIES: ReadonlySet<DietCategory> = new Set([
  "pork",
  "red_meat",
  "beef",
  "shellfish",
  "other_meat",
]);
