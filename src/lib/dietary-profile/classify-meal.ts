import type { FoodAnalysisResult, FoodItem } from "@/lib/ai/food-analyzer";
import { DietCategory, MealObservationInput } from "./types";

/** Maps a saved meal's classified foods onto dietary-profile categories.
 *
 * KNOWN LIMITATION: food-analyzer's FoodCategory enum predates this
 * feature and doesn't split dairy from plant foods (paneer_tofu covers
 * both paneer and tofu) or split red meat into beef/pork/shellfish. Until
 * the AI prompt/schema is extended with real dairy/pork/shellfish
 * categories (a separate, larger change — see food-analyzer.ts's
 * SYSTEM_PROMPT), this falls back to matching the item's own name against
 * keyword lists. That's inherently less reliable than a real
 * classification field, which is exactly why callers must still gate on
 * the meal's overall confidence (see update.ts) before trusting it. */
const DAIRY_KEYWORDS = ["paneer", "yogurt", "yoghurt", "curd", "dahi", "cheese", "milk", "ghee", "butter", "cream", "lassi"];
const LACTOSE_FREE_DAIRY_KEYWORDS = ["lactose-free", "lactose free", "vegan cheese", "vegan yogurt", "almond milk", "soy milk", "oat milk", "coconut milk yogurt"];
const TOFU_KEYWORDS = ["tofu"];
const PORK_KEYWORDS = ["pork", "bacon", "ham", "sausage", "salami", "pepperoni", "prosciutto"];
const SHELLFISH_KEYWORDS = ["shrimp", "prawn", "crab", "lobster", "clam", "oyster", "mussel", "scallop"];
const RED_MEAT_KEYWORDS = ["beef", "mutton", "lamb", "goat meat", "steak", "keema"];
const OTHER_MEAT_KEYWORDS = ["duck", "turkey", "venison", "rabbit"];

function nameContainsAny(name: string, keywords: string[]): boolean {
  const lower = name.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

function classifyItem(item: FoodItem): DietCategory[] {
  const categories: DietCategory[] = [];
  const name = item.name ?? "";

  if (nameContainsAny(name, LACTOSE_FREE_DAIRY_KEYWORDS)) {
    categories.push("dairy", "lactose_free_dairy");
  } else if (nameContainsAny(name, DAIRY_KEYWORDS) || (item.food_category === "paneer_tofu" && !nameContainsAny(name, TOFU_KEYWORDS))) {
    categories.push("dairy", "lactose_dairy");
  }

  if (item.food_category === "egg") categories.push("eggs");
  if (item.food_category === "chicken") categories.push("chicken");
  if (item.food_category === "fish") categories.push("fish");

  if (nameContainsAny(name, PORK_KEYWORDS)) categories.push("pork");
  else if (nameContainsAny(name, SHELLFISH_KEYWORDS)) categories.push("shellfish");
  else if (nameContainsAny(name, RED_MEAT_KEYWORDS)) categories.push("red_meat");
  else if (nameContainsAny(name, OTHER_MEAT_KEYWORDS)) categories.push("other_meat");
  else if (item.food_category === "red_meat") categories.push("red_meat");

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
