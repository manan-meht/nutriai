import type { FoodAnalysisResult, FoodItem } from "@/lib/ai/food-analyzer";
import { DietCategory, MealObservationInput } from "./types";

/** Maps a saved meal's classified foods onto dietary-profile categories.
 *
 * food-analyzer's FoodCategory now has real paneer/tofu/beef/pork/
 * shellfish categories (previously "paneer_tofu" and a single "red_meat"
 * covered all of these — see food-analyzer.ts's FoodCategory doc comment
 * for why they were split), so those are trusted directly. Name-keyword
 * matching is kept only as a fallback for items where food_category is
 * missing/"other" (e.g. meals saved before this schema existed, or a rare
 * model omission) — inherently less reliable than a real classification
 * field, which is exactly why callers must still gate on the meal's
 * overall confidence (see update.ts) before trusting any of this. */
const DAIRY_KEYWORDS = ["paneer", "yogurt", "yoghurt", "curd", "dahi", "cheese", "milk", "ghee", "butter", "cream", "lassi"];
const LACTOSE_FREE_DAIRY_KEYWORDS = ["lactose-free", "lactose free", "vegan cheese", "vegan yogurt", "almond milk", "soy milk", "oat milk", "coconut milk yogurt"];
const PORK_KEYWORDS = ["pork", "bacon", "ham", "sausage", "salami", "pepperoni", "prosciutto"];
const SHELLFISH_KEYWORDS = ["shrimp", "prawn", "crab", "lobster", "clam", "oyster", "mussel", "scallop"];
const BEEF_KEYWORDS = ["beef", "steak", "brisket"];
const RED_MEAT_KEYWORDS = ["mutton", "lamb", "goat meat", "keema"];
const OTHER_MEAT_KEYWORDS = ["duck", "turkey", "venison", "rabbit"];

function nameContainsAny(name: string, keywords: string[]): boolean {
  const lower = name.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

function classifyItem(item: FoodItem): DietCategory[] {
  const categories: DietCategory[] = [];
  const name = item.name ?? "";
  const category = item.food_category;
  const hasRealCategory = category != null && category !== "other";

  if (category === "paneer") {
    // Paneer is a regular (lactose-containing) dairy product — the
    // lactose-free case only applies to fallback name matching below
    // (e.g. an explicitly labeled "vegan cheese" with no real category).
    categories.push("dairy", "lactose_dairy");
  } else if (!hasRealCategory && nameContainsAny(name, LACTOSE_FREE_DAIRY_KEYWORDS)) {
    categories.push("dairy", "lactose_free_dairy");
  } else if (!hasRealCategory && nameContainsAny(name, DAIRY_KEYWORDS)) {
    categories.push("dairy", "lactose_dairy");
  }
  // tofu is plant-based — deliberately not added to any dairy/meat
  // category, same as any other plant food.

  if (category === "egg") categories.push("eggs");
  if (category === "chicken") categories.push("chicken");
  if (category === "fish") categories.push("fish");
  if (category === "beef") categories.push("beef");
  if (category === "pork") categories.push("pork");
  if (category === "shellfish") categories.push("shellfish");
  if (category === "red_meat") categories.push("red_meat");

  if (!hasRealCategory) {
    if (nameContainsAny(name, PORK_KEYWORDS)) categories.push("pork");
    else if (nameContainsAny(name, SHELLFISH_KEYWORDS)) categories.push("shellfish");
    else if (nameContainsAny(name, BEEF_KEYWORDS)) categories.push("beef");
    else if (nameContainsAny(name, RED_MEAT_KEYWORDS)) categories.push("red_meat");
    else if (nameContainsAny(name, OTHER_MEAT_KEYWORDS)) categories.push("other_meat");
  }

  return categories;
}

/** Builds the dietary-profile observation input for one saved meal. Only
 * meaningful when combined with the meal's own confidence fields (rule
 * 11) — this function itself does no confidence gating, that happens in
 * update.ts. `isUserCorrection` should be true when this call follows the
 * user confirming/correcting the meal (rule 13), not a fresh AI guess. */
export function buildMealObservation(analysis: FoodAnalysisResult, isUserCorrection = false): MealObservationInput {
  const categories = new Set<DietCategory>();
  for (const item of analysis.foods ?? []) {
    for (const category of classifyItem(item)) categories.add(category);
  }

  return {
    categories: Array.from(categories),
    confidence: analysis.confidence,
    foodIdentityConfidence: analysis.food_identity_confidence,
    isUserCorrection,
  };
}
