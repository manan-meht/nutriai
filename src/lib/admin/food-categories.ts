/** Mirrors food_knowledge_base's category check constraint (see
 * supabase/migrations/0013_meal_review_console.sql, widened by 0052).
 * Reused as the per-item tag in the review UI, rather than a separate
 * taxonomy — see deriveMealLevelFields, which rolls these up into the
 * meal-level protein/veg/carb/balance fields. Kept out of actions.ts
 * ("use server") since only async functions can be exported as values from
 * a server actions file — a plain array export there breaks bundling for
 * any client component that imports from the same module. */
export const FOOD_CATEGORIES = [
  "protein_anchor",
  "partial_protein",
  "vegetable_fiber",
  "fruit",
  "carb_base",
  "fat_source_good",
  "fat_source_poor",
  // Legacy, deliberately still offered: the 18 entries categorised before
  // fat sources were split into good/poor (migration 0052) still carry it,
  // and hiding the value would make those rows un-editable without also
  // silently re-grading them. Labelled as unsorted so it reads as a
  // to-do rather than a real choice.
  "fat_source",
  "treat_food",
  "sugary_drink",
  "mixed_meal",
  "unknown",
] as const;

export type FoodCategory = (typeof FOOD_CATEGORIES)[number];

/** Human-readable labels for the review console dropdowns. Explicit rather
 * than derived from the value, both because several need wording that
 * isn't a mechanical de-underscoring ("Treat food", "Fat source
 * (unsorted)") and because the previous inline `value.replace("_", " ")`
 * only replaced the FIRST underscore — so a two-underscore value like
 * fat_source_good would have rendered as "fat source_good". */
export const FOOD_CATEGORY_LABELS: Record<FoodCategory, string> = {
  protein_anchor: "Protein anchor",
  partial_protein: "Partial protein",
  vegetable_fiber: "Vegetable / fibre",
  fruit: "Fruit",
  carb_base: "Carb base",
  fat_source_good: "Fat source — good",
  fat_source_poor: "Fat source — poor",
  fat_source: "Fat source (unsorted)",
  treat_food: "Treat food",
  sugary_drink: "Sugary drink",
  mixed_meal: "Mixed meal",
  unknown: "Unknown",
};

export function foodCategoryLabel(value: string): string {
  return FOOD_CATEGORY_LABELS[value as FoodCategory] ?? value.replaceAll("_", " ");
}

/** Meal-level micronutrient judgment (migration 0052). Deliberately NOT
 * derived from per-item categories the way protein/veg/carb are — the
 * knowledge base carries no per-food micronutrient attribute yet, so this
 * is the reviewer's own call. */
export const MICRONUTRIENT_STATUSES = ["unknown", "missing", "partial", "present"] as const;
export type MicronutrientStatus = (typeof MICRONUTRIENT_STATUSES)[number];

/** Verdicts a reviewer can record. 'unclear_photo' predates
 * 'unclear_image'/'no_photo' (migration 0052) and is kept because 16
 * reviews already carry it. */
export const REVIEW_STATUS_OPTIONS = [
  "correct",
  "partially_correct",
  "incorrect",
  "unclear_image",
  "unclear_photo",
  "no_photo",
  "not_food",
  "duplicate",
  "escalated",
] as const;

export const REVIEW_STATUS_LABELS: Record<string, string> = {
  correct: "Correct",
  partially_correct: "Partially correct",
  incorrect: "Incorrect",
  unclear_image: "Unclear image",
  unclear_photo: "Unclear photo (legacy)",
  no_photo: "No photo",
  not_food: "Not food",
  duplicate: "Duplicate",
  escalated: "Escalated",
};

export function reviewStatusLabel(value: string): string {
  return REVIEW_STATUS_LABELS[value] ?? value.replaceAll("_", " ");
}
