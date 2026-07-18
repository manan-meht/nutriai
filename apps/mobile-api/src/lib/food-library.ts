// Mirrors the main web app's src/lib/food-balance/food-library.ts —
// duplicated here rather than shared, matching this app's existing
// pattern (see lib/food-balance.ts's own comment on why). Keep in sync
// manually if the web app's library changes.

/** Curated food-example library for personalizing Food Balance
 * Recommendations (see food-balance-personalize.ts) — general wellness/
 * habit-coaching examples only, never a prescribed diet plan.
 *
 * dietTags extend the originally suggested set with per-meat/per-animal-
 * food granularity (contains_chicken/contains_beef/contains_pork/
 * contains_red_meat/contains_shellfish alongside the coarser contains_meat)
 * because "avoid beef but eat chicken" and "avoid pork but eat beef" are
 * both real, common profiles this app now tracks (see
 * @/lib/dietary-profile's FoodCategory split) — a single generic
 * "contains_meat" tag can't represent that distinction. */
export type FoodSuggestionCategory =
  | "protein"
  | "fiber"
  | "fruit_veg"
  | "balanced_carb"
  | "healthy_fat"
  | "home_cooked"
  | "snack_swap";

export type DietTag =
  | "vegetarian"
  | "vegan"
  | "eggitarian"
  | "non_vegetarian"
  | "contains_dairy"
  | "contains_egg"
  | "contains_fish"
  | "contains_shellfish"
  | "contains_meat"
  | "contains_chicken"
  | "contains_red_meat"
  | "contains_beef"
  | "contains_pork"
  | "contains_soy"
  | "contains_nuts"
  | "gluten_free_possible";

export interface FoodSuggestion {
  id: string;
  label: string;
  category: FoodSuggestionCategory;
  /** Descriptive only today — there's no cuisine/region preference field
   * on the Food Profile yet (see personalize.ts's module doc TODO), so
   * this isn't currently used as a hard filter. Kept so filtering can
   * tighten later without re-tagging the whole library. */
  cuisineTags?: string[];
  dietTags?: DietTag[];
  /** Free-text conditions this item should NOT be suggested under, beyond
   * what dietTags already encode — currently unused (no allergy/dislike
   * fields exist yet to check against), reserved for that extension. */
  avoidIfTags?: string[];
  mealTags?: Array<"breakfast" | "lunch" | "dinner" | "snack">;
  /** Matches FoodBalanceUserProfile.goal's NutritionGoal values. */
  goalTags?: string[];
  examples?: string[];
}

export const FOOD_LIBRARY: FoodSuggestion[] = [
  // ── Protein ────────────────────────────────────────────────
  { id: "dal", label: "dal", category: "protein", cuisineTags: ["indian"], dietTags: ["vegetarian", "vegan"], mealTags: ["lunch", "dinner"], goalTags: ["gain_muscle", "body_recomposition", "maintain_weight", "improve_nutrition", "healthy_aging", "reduce_weight", "reduce_body_fat"] },
  { id: "chana_rajma", label: "chana or rajma", category: "protein", cuisineTags: ["indian"], dietTags: ["vegetarian", "vegan"], mealTags: ["lunch", "dinner"], goalTags: ["gain_muscle", "body_recomposition", "maintain_weight", "improve_nutrition", "healthy_aging"] },
  { id: "sprouts", label: "sprouts", category: "protein", cuisineTags: ["indian"], dietTags: ["vegetarian", "vegan"], mealTags: ["breakfast", "snack", "lunch"], goalTags: ["reduce_weight", "reduce_body_fat", "improve_nutrition"] },
  { id: "soy_chunks", label: "soy chunks", category: "protein", cuisineTags: ["indian"], dietTags: ["vegetarian", "vegan", "contains_soy"], mealTags: ["lunch", "dinner"], goalTags: ["gain_muscle", "body_recomposition"] },
  { id: "tofu", label: "tofu", category: "protein", cuisineTags: ["indian", "thai", "western", "asian"], dietTags: ["vegetarian", "vegan", "contains_soy"], mealTags: ["breakfast", "lunch", "dinner"], goalTags: ["gain_muscle", "body_recomposition", "reduce_weight", "reduce_body_fat", "maintain_weight"] },
  { id: "tempeh", label: "tempeh", category: "protein", cuisineTags: ["western", "asian"], dietTags: ["vegetarian", "vegan", "contains_soy"], mealTags: ["lunch", "dinner"], goalTags: ["gain_muscle", "body_recomposition"] },
  { id: "edamame", label: "edamame", category: "protein", cuisineTags: ["asian", "thai"], dietTags: ["vegetarian", "vegan", "contains_soy"], mealTags: ["snack", "lunch"], goalTags: ["reduce_weight", "reduce_body_fat", "improve_nutrition"] },
  { id: "paneer_bhurji", label: "paneer bhurji", category: "protein", cuisineTags: ["indian"], dietTags: ["vegetarian", "contains_dairy"], mealTags: ["breakfast", "lunch", "dinner"], goalTags: ["gain_muscle", "body_recomposition", "maintain_weight"] },
  { id: "greek_yogurt", label: "Greek yogurt with fruit", category: "protein", cuisineTags: ["western", "indian"], dietTags: ["vegetarian", "contains_dairy"], mealTags: ["breakfast", "snack"], goalTags: ["reduce_weight", "reduce_body_fat", "maintain_weight", "healthy_aging", "improve_nutrition"] },
  { id: "cottage_cheese", label: "cottage cheese", category: "protein", cuisineTags: ["western"], dietTags: ["vegetarian", "contains_dairy"], mealTags: ["breakfast", "snack"], goalTags: ["reduce_body_fat", "gain_muscle", "maintain_weight"] },
  { id: "curd", label: "curd", category: "protein", cuisineTags: ["indian"], dietTags: ["vegetarian", "contains_dairy"], mealTags: ["lunch", "dinner"], goalTags: ["maintain_weight", "healthy_aging"] },
  { id: "lentil_soup", label: "lentil soup", category: "protein", cuisineTags: ["western", "indian"], dietTags: ["vegetarian", "vegan"], mealTags: ["lunch", "dinner"], goalTags: ["reduce_weight", "reduce_body_fat", "maintain_weight", "improve_nutrition"] },
  { id: "beans", label: "beans", category: "protein", cuisineTags: ["western", "indian"], dietTags: ["vegetarian", "vegan"], mealTags: ["lunch", "dinner"], goalTags: ["gain_muscle", "maintain_weight", "improve_nutrition"] },
  { id: "eggs", label: "eggs", category: "protein", cuisineTags: ["indian", "western"], dietTags: ["eggitarian", "contains_egg"], mealTags: ["breakfast", "snack"], goalTags: ["gain_muscle", "body_recomposition", "maintain_weight", "healthy_aging"] },
  { id: "egg_bhurji", label: "egg bhurji", category: "protein", cuisineTags: ["indian"], dietTags: ["eggitarian", "contains_egg"], mealTags: ["breakfast", "dinner"], goalTags: ["gain_muscle", "maintain_weight"] },
  { id: "omelette", label: "an omelette", category: "protein", cuisineTags: ["western", "indian"], dietTags: ["eggitarian", "contains_egg"], mealTags: ["breakfast"], goalTags: ["gain_muscle", "maintain_weight"] },
  { id: "boiled_eggs", label: "boiled eggs", category: "protein", cuisineTags: ["western", "indian"], dietTags: ["eggitarian", "contains_egg"], mealTags: ["breakfast", "snack"], goalTags: ["reduce_weight", "reduce_body_fat", "gain_muscle"] },
  { id: "chicken", label: "chicken", category: "protein", cuisineTags: ["indian", "western", "thai", "asian"], dietTags: ["non_vegetarian", "contains_meat", "contains_chicken"], mealTags: ["lunch", "dinner"], goalTags: ["gain_muscle", "body_recomposition", "maintain_weight", "reduce_body_fat"] },
  { id: "chicken_breast", label: "chicken breast", category: "protein", cuisineTags: ["western"], dietTags: ["non_vegetarian", "contains_meat", "contains_chicken"], mealTags: ["lunch", "dinner"], goalTags: ["gain_muscle", "reduce_body_fat"] },
  { id: "fish", label: "fish", category: "protein", cuisineTags: ["indian", "western", "thai", "asian"], dietTags: ["non_vegetarian", "contains_meat", "contains_fish"], mealTags: ["lunch", "dinner"], goalTags: ["gain_muscle", "body_recomposition", "maintain_weight", "healthy_aging"] },
  { id: "tuna", label: "tuna", category: "protein", cuisineTags: ["western"], dietTags: ["non_vegetarian", "contains_meat", "contains_fish"], mealTags: ["lunch", "snack"], goalTags: ["reduce_body_fat", "gain_muscle"] },
  { id: "mutton_curry", label: "mutton or lamb curry", category: "protein", cuisineTags: ["indian", "western"], dietTags: ["non_vegetarian", "contains_meat", "contains_red_meat"], mealTags: ["lunch", "dinner"], goalTags: ["gain_muscle", "maintain_weight"] },
  { id: "beef_dish", label: "beef", category: "protein", cuisineTags: ["western", "asian"], dietTags: ["non_vegetarian", "contains_meat", "contains_beef"], mealTags: ["lunch", "dinner"], goalTags: ["gain_muscle", "maintain_weight"] },
  { id: "pork_dish", label: "pork", category: "protein", cuisineTags: ["western", "asian"], dietTags: ["non_vegetarian", "contains_meat", "contains_pork"], mealTags: ["lunch", "dinner"], goalTags: ["gain_muscle", "maintain_weight"] },
  { id: "shrimp_prawn", label: "shrimp or prawns", category: "protein", cuisineTags: ["indian", "thai", "asian", "western"], dietTags: ["non_vegetarian", "contains_meat", "contains_shellfish"], mealTags: ["lunch", "dinner"], goalTags: ["reduce_body_fat", "maintain_weight"] },

  // ── Fiber ──────────────────────────────────────────────────
  { id: "whole_grain_roti", label: "whole wheat roti", category: "fiber", cuisineTags: ["indian"], dietTags: ["vegetarian", "vegan", "gluten_free_possible"], mealTags: ["lunch", "dinner"] },
  { id: "brown_rice", label: "brown rice", category: "fiber", cuisineTags: ["indian", "asian"], dietTags: ["vegetarian", "vegan", "gluten_free_possible"], mealTags: ["lunch", "dinner"] },
  { id: "oats", label: "oats", category: "fiber", cuisineTags: ["western", "indian"], dietTags: ["vegetarian", "vegan"], mealTags: ["breakfast"] },
  { id: "whole_grains", label: "whole grains", category: "fiber", cuisineTags: ["western", "indian"], dietTags: ["vegetarian", "vegan"], mealTags: ["lunch", "dinner"] },
  { id: "leafy_greens", label: "leafy greens (spinach, methi, kale)", category: "fiber", cuisineTags: ["indian", "western"], dietTags: ["vegetarian", "vegan"], mealTags: ["lunch", "dinner"] },
  { id: "mixed_salad", label: "a side salad", category: "fiber", cuisineTags: ["western", "indian"], dietTags: ["vegetarian", "vegan"], mealTags: ["lunch", "dinner"] },
  { id: "fiber_dal", label: "dal", category: "fiber", cuisineTags: ["indian"], dietTags: ["vegetarian", "vegan"], mealTags: ["lunch", "dinner"] },
  { id: "fiber_chana_rajma", label: "chana or rajma", category: "fiber", cuisineTags: ["indian"], dietTags: ["vegetarian", "vegan"], mealTags: ["lunch", "dinner"] },

  // ── Fruit & veg ────────────────────────────────────────────
  { id: "seasonal_fruit", label: "a piece of seasonal fruit", category: "fruit_veg", cuisineTags: ["indian", "western"], dietTags: ["vegetarian", "vegan"], mealTags: ["breakfast", "snack"] },
  { id: "banana", label: "a banana", category: "fruit_veg", cuisineTags: ["indian", "western"], dietTags: ["vegetarian", "vegan"], mealTags: ["breakfast", "snack"] },
  { id: "apple", label: "an apple", category: "fruit_veg", cuisineTags: ["western", "indian"], dietTags: ["vegetarian", "vegan"], mealTags: ["breakfast", "snack"] },
  { id: "berries", label: "berries", category: "fruit_veg", cuisineTags: ["western"], dietTags: ["vegetarian", "vegan"], mealTags: ["breakfast", "snack"] },
  { id: "sabzi", label: "sabzi", category: "fruit_veg", cuisineTags: ["indian"], dietTags: ["vegetarian", "vegan"], mealTags: ["lunch", "dinner"] },
  { id: "mixed_vegetable_sabzi", label: "a mixed vegetable sabzi", category: "fruit_veg", cuisineTags: ["indian"], dietTags: ["vegetarian", "vegan"], mealTags: ["lunch", "dinner"] },
  { id: "steamed_vegetables", label: "steamed or roasted vegetables", category: "fruit_veg", cuisineTags: ["western", "asian"], dietTags: ["vegetarian", "vegan"], mealTags: ["lunch", "dinner"] },
  { id: "salad", label: "a salad", category: "fruit_veg", cuisineTags: ["western", "indian"], dietTags: ["vegetarian", "vegan"], mealTags: ["lunch", "dinner"] },
  { id: "cucumber_carrot_sticks", label: "cucumber or carrot sticks", category: "fruit_veg", cuisineTags: ["indian", "western"], dietTags: ["vegetarian", "vegan"], mealTags: ["snack"] },
  { id: "vegetables_in_rice_noodles", label: "vegetables mixed into the rice or noodles", category: "fruit_veg", cuisineTags: ["asian", "indian"], dietTags: ["vegetarian", "vegan"], mealTags: ["lunch", "dinner"] },

  // ── Balanced carb ──────────────────────────────────────────
  { id: "roti_with_sabzi", label: "one roti with extra sabzi instead of a second helping of rice", category: "balanced_carb", cuisineTags: ["indian"], dietTags: ["vegetarian", "vegan"], mealTags: ["lunch", "dinner"] },
  { id: "smaller_rice_portion", label: "a slightly smaller rice portion with an extra side of vegetables", category: "balanced_carb", cuisineTags: ["indian", "asian"], dietTags: ["vegetarian", "vegan"], mealTags: ["lunch", "dinner"] },
  { id: "quinoa_swap", label: "quinoa in place of half the usual rice", category: "balanced_carb", cuisineTags: ["western"], dietTags: ["vegetarian", "vegan"], mealTags: ["lunch", "dinner"] },

  // ── Healthy fat ────────────────────────────────────────────
  { id: "avocado", label: "avocado", category: "healthy_fat", cuisineTags: ["western"], dietTags: ["vegetarian", "vegan"], mealTags: ["breakfast", "lunch"] },
  { id: "nuts_small_handful", label: "a small handful of nuts", category: "healthy_fat", cuisineTags: ["indian", "western"], dietTags: ["vegetarian", "vegan", "contains_nuts"], mealTags: ["snack"] },
  { id: "seeds", label: "a spoon of seeds (flax, chia, or pumpkin)", category: "healthy_fat", cuisineTags: ["western", "indian"], dietTags: ["vegetarian", "vegan"], mealTags: ["breakfast", "snack"] },

  // ── Home cooked ────────────────────────────────────────────
  { id: "home_cooked_dal_rice", label: "a simple home-cooked dal and rice", category: "home_cooked", cuisineTags: ["indian"], dietTags: ["vegetarian", "vegan"], mealTags: ["lunch", "dinner"] },
  { id: "home_cooked_stir_fry", label: "a quick home-cooked vegetable stir-fry", category: "home_cooked", cuisineTags: ["asian", "western"], dietTags: ["vegetarian", "vegan"], mealTags: ["lunch", "dinner"] },

  // ── Snack swap ─────────────────────────────────────────────
  { id: "roasted_chana", label: "roasted chana", category: "snack_swap", cuisineTags: ["indian"], dietTags: ["vegetarian", "vegan"], mealTags: ["snack"] },
  { id: "fruit_swap", label: "fruit instead of packaged snacks", category: "snack_swap", cuisineTags: ["indian", "western"], dietTags: ["vegetarian", "vegan"], mealTags: ["snack"] },
  { id: "yogurt_swap", label: "a small bowl of yogurt instead of a packaged snack", category: "snack_swap", cuisineTags: ["indian", "western"], dietTags: ["vegetarian", "contains_dairy"], mealTags: ["snack"] },
];
