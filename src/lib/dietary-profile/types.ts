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
  explicit_avoids_pork: boolean;
  prefers_plant_based_suggestions: boolean;
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
  explicit_avoids_pork: false,
  prefers_plant_based_suggestions: false,
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
  | "pork"
  | "other_meat";

/** Categories sensitive enough (rule 12) that a single high-confidence AI
 * observation isn't enough on its own to flip them — see update.ts. */
export const SENSITIVE_CATEGORIES: ReadonlySet<DietCategory> = new Set([
  "pork",
  "red_meat",
  "shellfish",
  "other_meat",
]);
