// Fallback prefills for a food item the reviewer hasn't seen before (no
// existing food_knowledge_base match) — rather than leaving every flag on
// "unknown" even though the AI already made a call for the meal as a
// whole, these reuse that meal-level classification as a starting point.
// A knowledge-base match (see ReviewForm's matchKnownFood) always wins
// over these; this only fills the gap for a genuinely new dish.

export type Likelihood = "low" | "medium" | "high" | "unknown";
export type DirectionSignal = "negative" | "neutral" | "positive" | "unknown";

/** "high" -> true, "low" -> false, "medium"/"unknown" -> no opinion — a
 * reviewer should decide those explicitly rather than get a 50/50 guess. */
export function likelihoodToBoolean(likelihood: Likelihood | string | null | undefined): boolean | null {
  if (likelihood === "high") return true;
  if (likelihood === "low") return false;
  return null;
}

export function directionToHealthy(signal: DirectionSignal | string | null | undefined): boolean | null {
  if (signal === "positive") return true;
  if (signal === "negative") return false;
  return null;
}

// food-analyzer.ts's per-food `food_category` (see its prompt) is a
// narrow, protein-portion-calculation taxonomy — chicken/fish/beef/pork/
// shellfish/red_meat/egg/paneer/tofu/avocado/seeds_nuts/legume_dal/other —
// not the same taxonomy as food_knowledge_base.category. It only
// distinguishes protein- and fat-relevant items; everything else (rice,
// roti, vegetables, mixed curries) is bucketed under "other", so this can
// only ever confidently suggest protein_anchor/fat_source, never
// vegetable_fiber/carb_base/etc — those still need a human's judgment.
const PROTEIN_FOOD_CATEGORIES = new Set([
  "chicken", "fish", "beef", "pork", "shellfish", "red_meat", "egg", "paneer", "tofu", "legume_dal",
]);
const FAT_FOOD_CATEGORIES = new Set(["avocado", "seeds_nuts"]);

export function aiFoodCategoryToKnowledgeCategory(foodCategory: string | null | undefined): "protein_anchor" | "fat_source" | null {
  if (!foodCategory) return null;
  if (PROTEIN_FOOD_CATEGORIES.has(foodCategory)) return "protein_anchor";
  if (FAT_FOOD_CATEGORIES.has(foodCategory)) return "fat_source";
  return null;
}
