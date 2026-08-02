/** Mirrors food_knowledge_base's category check constraint (see
 * supabase/migrations/0013_meal_review_console.sql). Reused as the
 * per-item tag in the review UI, rather than a separate taxonomy — see
 * deriveMealLevelFields, which rolls these up into the meal-level
 * protein/veg/carb/balance fields. Kept out of actions.ts ("use server")
 * since only async functions can be exported as values from a server
 * actions file — a plain array export there breaks bundling for any
 * client component that imports from the same module. */
export const FOOD_CATEGORIES = [
  "protein_anchor",
  "partial_protein",
  "vegetable_fiber",
  "carb_base",
  "fat_source",
  "enjoyment_food",
  "sugary_drink",
  "mixed_meal",
  "unknown",
] as const;

export type FoodCategory = (typeof FOOD_CATEGORIES)[number];
