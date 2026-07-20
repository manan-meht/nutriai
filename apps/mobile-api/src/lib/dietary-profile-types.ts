// Mirror of the main web app's src/lib/dietary-profile/types.ts
// (DietaryProfile/DEFAULT_DIETARY_PROFILE only — this app never *observes*
// a profile from meal content itself, that only happens via the WhatsApp
// bot in the main app, so classify-meal.ts/sync.ts aren't needed here).
// It does now support the user *explicitly* editing preferences (see
// lib/food-preferences.ts, mirroring src/lib/dietary-profile/preferences.ts
// and update.ts's deriveInferredPatternFromProfile) for the mobile "Food
// preferences" editor. Duplicated rather than shared, matching this app's
// existing pattern (see lib/food-balance.ts's own comment on why) — keep
// in sync manually if the web app's DietaryProfile shape changes.
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
  liked_suggestion_ids: string[];
  disliked_suggestion_ids: string[];
  unavailable_suggestion_ids: string[];
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
