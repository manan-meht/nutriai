import type { FoodBalanceRecommendation } from "@nutriai/health-scoring";
import type { DietaryProfile } from "@/lib/dietary-profile";
import { FOOD_LIBRARY, FoodSuggestion, FoodSuggestionCategory } from "./food-library";
import { isRecommendationSafe } from "./safety";

/** Personalizes Food Balance Recommendations using the Food Profile
 * (@/lib/dietary-profile) — turns "Add one protein source" into
 * "Try Greek yogurt with fruit at breakfast, or paneer, tofu, eggs,
 * chicken, or dal depending on what you usually eat," scoped to what's
 * actually safe and relevant for this person. Still general wellness
 * coaching, never a disease-specific or prescribed diet plan — nothing
 * here reads or reasons about medical conditions.
 *
 * SCHEMA GAPS (per the task's "propose a minimal schema extension, don't
 * invent fields" instruction) — these personalization dimensions were
 * requested but have no backing field on the Food Profile yet, so they're
 * TODOs, not implemented:
 *   - Allergies/intolerances beyond lactose (e.g. nuts, shellfish, soy) —
 *     nuts/shellfish items are currently allowed by default since there's
 *     no allergy field to check against. Needs an `allergies: string[]`-
 *     style field before nut/shellfish suggestions can be safely gated.
 *   - Explicitly disliked foods — no `disliked_foods` field exists; a
 *     disliked-food list can't be filtered out today.
 *   - Cuisine/region preference — FOOD_LIBRARY's cuisineTags exist for
 *     this but aren't used as a hard filter yet, since there's no
 *     "country"/"region"/"cuisine preference" field on adults_contacts/
 *     gym_clients or DietaryProfile to filter by.
 *   - Meal timing habits, cooking access, home-cooked-vs-eating-out
 *     tendency — no such fields exist; the "home_cooked" category exists
 *     in the library for when they do.
 * None of these gaps block the hard safety rules that DO have backing
 * fields (vegan/vegetarian, dairy/lactose, eggs, chicken, fish, red meat/
 * beef/pork, shellfish-if-observed) — those are fully enforced below. */

function isAllowed(food: FoodSuggestion, profile: DietaryProfile): boolean {
  // "I don't like this food" feedback (see the feedback-loop server
  // actions) is a hard exclusion, same as any other safety rule — showing
  // a disliked suggestion again isn't unsafe, but it defeats the point of
  // asking for feedback at all.
  if (profile.disliked_suggestion_ids?.includes(food.id)) return false;

  const tags = food.dietTags ?? [];

  if (profile.explicit_vegan) {
    if (tags.some((t) => t === "contains_dairy" || t === "contains_egg" || t === "contains_fish" || t === "contains_meat")) return false;
  }
  if (profile.explicit_vegetarian) {
    if (tags.some((t) => t === "contains_fish" || t === "contains_meat")) return false;
  }

  if (tags.includes("contains_dairy")) {
    const dairyObserved = profile.observed_dairy || profile.observed_lactose_dairy || profile.observed_lactose_free_dairy;
    if (!dairyObserved || profile.explicit_avoids_dairy) return false;
  }
  if (tags.includes("contains_egg") && (!profile.observed_eggs || profile.explicit_avoids_eggs)) return false;
  if (tags.includes("contains_fish") && (!profile.observed_fish || profile.explicit_avoids_fish)) return false;
  if (tags.includes("contains_chicken") && (!profile.observed_chicken || profile.explicit_avoids_chicken)) return false;
  if (tags.includes("contains_beef") && (!profile.observed_beef || profile.explicit_avoids_beef)) return false;
  if (tags.includes("contains_pork") && (!profile.observed_pork || profile.explicit_avoids_pork)) return false;
  if (tags.includes("contains_red_meat") && (!profile.observed_red_meat || profile.explicit_avoids_red_meat)) return false;
  // No explicit_avoids_shellfish field exists yet (see module doc TODOs on
  // allergies/dislikes) — gated on observation alone, which defaults to
  // false, so shellfish is simply never suggested until it's been seen.
  if (tags.includes("contains_shellfish") && !profile.observed_shellfish) return false;

  return true;
}

/** Ranks allowed foods for a category, favoring ones tagged for the
 * current goal/meal — a soft preference, not a hard filter, since goal/
 * meal tags are sparse in the library and over-filtering would leave too
 * few examples for less common combinations. */
function rankedAllowedFoods(
  category: FoodSuggestionCategory,
  profile: DietaryProfile,
  opts: { meal?: "breakfast" | "lunch" | "dinner" | "snack"; goal?: string } = {}
): FoodSuggestion[] {
  const candidates = FOOD_LIBRARY.filter((f) => f.category === category && isAllowed(f, profile));

  return candidates
    .map((food) => {
      let score = 0;
      if (opts.meal && food.mealTags?.includes(opts.meal)) score += 2;
      if (opts.goal && food.goalTags?.includes(opts.goal)) score += 1;
      if (profile.liked_suggestion_ids?.includes(food.id)) score += 2;
      // "Not available where I live" — deprioritized, not excluded (per
      // the spec: "lower priority... prefer more common alternatives"),
      // since it's about availability, not safety or preference.
      if (profile.unavailable_suggestion_ids?.includes(food.id)) score -= 3;
      return { food, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((s) => s.food);
}

/** Picks up to `count` allowed FoodSuggestion items for a category — the
 * underlying data behind pickFoodExampleLabels below, exposed separately
 * so callers that need the ids (for exampleFoodIds / feedback targeting)
 * don't have to re-derive them from labels. Empty when nothing in the
 * library is confidently allowed yet (see pickFoodExampleLabels for the
 * broader-wording fallback that covers that case). */
export function pickFoodExamples(
  category: FoodSuggestionCategory,
  profile: DietaryProfile,
  opts: { meal?: "breakfast" | "lunch" | "dinner" | "snack"; goal?: string; count?: number } = {}
): FoodSuggestion[] {
  return rankedAllowedFoods(category, profile, opts).slice(0, opts.count ?? 5);
}

/** Picks up to `count` food example labels for a category, falling back
 * to a broadly-worded suggestion (per the spec's "when in doubt, use
 * broader wording" rule) if nothing in the library is confidently allowed
 * yet — a brand-new profile with nothing observed still gets safe plant-
 * based examples (dal/tofu/chana are always allowed), so this fallback is
 * mainly a defensive floor, not the common case. */
export function pickFoodExampleLabels(
  category: FoodSuggestionCategory,
  profile: DietaryProfile,
  opts: { meal?: "breakfast" | "lunch" | "dinner" | "snack"; goal?: string; count?: number } = {}
): string[] {
  const picked = pickFoodExamples(category, profile, opts);
  if (picked.length > 0) return picked.map((f) => f.label);
  return ["a protein food that fits your preferences, such as dal, tofu, eggs, yogurt, paneer, fish, or chicken"];
}

function formatExamples(labels: string[]): string {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")}, or ${labels[labels.length - 1]}`;
}

interface PersonalizeOptions {
  goal?: string;
}

/** Maps a recommendation's id (from packages/health-scoring's TEMPLATES)
 * to the food-library category and meal it's about — only ids this
 * module knows how to personalize get rewritten; anything else passes
 * through unchanged (e.g. consistency/energy recommendations, which
 * aren't about "which foods" at all). */
const RECOMMENDATION_PERSONALIZATION: Partial<Record<string, { category: FoodSuggestionCategory; meal?: "breakfast" | "lunch" | "dinner" | "snack" }>> = {
  proteinAdequacy: { category: "protein", meal: "breakfast" },
  proteinDistribution: { category: "protein" },
  fruitAndVegetableIntake: { category: "fruit_veg" },
  macroAndFibreBalance: { category: "fiber" },
  fibreAndMealVolume: { category: "fiber" },
  fibreAdequacy: { category: "fiber" },
  carbohydrateSupport: { category: "balanced_carb" },
  minimallyProcessedFoodBalance: { category: "snack_swap" },
  homePreparedMealShare: { category: "home_cooked" },
};

/** Rewrites one Food Balance Recommendation's title/description into a
 * personalized version using the Food Profile, and adds `action`/
 * `whyThisHelps` (see packages/health-scoring's FoodBalanceRecommendation
 * — additive optional fields). Recommendations this module doesn't know
 * how to personalize (see RECOMMENDATION_PERSONALIZATION) are returned
 * unchanged. Falls back to the original generic copy if `profile` is
 * undefined (e.g. Food Profile hasn't loaded), rather than ever showing a
 * broken or empty recommendation. */
export function personalizeFoodBalanceRecommendation(
  rec: FoodBalanceRecommendation,
  profile: DietaryProfile | undefined,
  opts: PersonalizeOptions = {}
): FoodBalanceRecommendation {
  const mapping = RECOMMENDATION_PERSONALIZATION[rec.id];
  if (!mapping || !profile) return rec;

  const personalized = buildPersonalizedRecommendation(rec, mapping, profile, opts);
  // Defense in depth (see safety.ts's module doc) — templates are hand-
  // authored, not LLM free-text, so this should never actually trip; if a
  // future template edit did introduce banned phrasing, fall back to the
  // original generic (already-safe) copy rather than showing it.
  return isRecommendationSafe(personalized) ? personalized : rec;
}

function buildPersonalizedRecommendation(
  rec: FoodBalanceRecommendation,
  mapping: { category: FoodSuggestionCategory; meal?: "breakfast" | "lunch" | "dinner" | "snack" },
  profile: DietaryProfile,
  opts: PersonalizeOptions
): FoodBalanceRecommendation {
  const pickedFoods = pickFoodExamples(mapping.category, profile, { meal: mapping.meal, goal: opts.goal });
  const examples = pickedFoods.length > 0 ? pickedFoods.map((f) => f.label) : pickFoodExampleLabels(mapping.category, profile, { meal: mapping.meal, goal: opts.goal });
  const exampleText = formatExamples(examples);
  const exampleFoodIds = pickedFoods.map((f) => f.id);

  const result = buildPersonalizedRecommendationFields(rec, mapping, examples, exampleText);
  return exampleFoodIds.length > 0 ? { ...result, exampleFoodIds } : result;
}

function buildPersonalizedRecommendationFields(
  rec: FoodBalanceRecommendation,
  mapping: { category: FoodSuggestionCategory; meal?: "breakfast" | "lunch" | "dinner" | "snack" },
  examples: string[],
  exampleText: string
): FoodBalanceRecommendation {
  switch (mapping.category) {
    case "protein": {
      const mealPhrase = mapping.meal === "breakfast" ? "Breakfast has been lighter on protein this week." : "Protein has been a little low this week.";
      // Only says "your Food Profile includes dairy" (or eggs/chicken/
      // fish) when the actual top example is one of those — otherwise
      // this stays a plain "based on meals you've logged" framing, so a
      // vegan/plant-based profile never gets a sentence implying it has
      // dairy just because the copy is templated. See the product note
      // this was built from: specificity should come from real profile
      // signal, not appear "randomly specific."
      const topFood = FOOD_LIBRARY.find((f) => f.label === examples[0]);
      const profileNote = topFood?.dietTags?.includes("contains_dairy")
        ? "Since your Food Profile includes dairy, "
        : topFood?.dietTags?.includes("contains_egg")
        ? "Since your Food Profile includes eggs, "
        : topFood?.dietTags?.includes("contains_chicken") || topFood?.dietTags?.includes("contains_fish")
        ? "Based on what you usually eat, "
        : "Based on meals you've logged, ";
      return {
        ...rec,
        title: mapping.meal === "breakfast" ? "Add protein to breakfast" : "Spread protein across more meals",
        description: `${mealPhrase} ${profileNote}try ${exampleText}${mapping.meal ? ` at ${mapping.meal}` : ""} this week.`,
        action: `Pick one meal and add one of these: ${exampleText}.`,
        whyThisHelps: "Protein can make meals more filling and helps support your goal.",
      };
    }
    case "fruit_veg":
      return {
        ...rec,
        title: "Add a vegetable or fruit serving",
        description: `Recent meals show room to grow in fruit and vegetables. Try adding ${exampleText} to one meal this week.`,
        action: `Add ${examples[0]} to your next lunch or dinner.`,
        whyThisHelps: "More fruit and vegetables adds fibre and variety without changing the rest of your plate.",
      };
    case "fiber":
      return {
        ...rec,
        title: "Add a fibre-rich food",
        description: `Fibre has room to grow in recent meals. Try adding ${exampleText} to one meal this week.`,
        action: `Add ${examples[0]} to your next meal.`,
        whyThisHelps: "Fibre supports digestion and helps meals feel more satisfying.",
      };
    case "balanced_carb":
      return {
        ...rec,
        title: "Balance out carb-heavy meals",
        description: `Recent meals lean toward rice, roti, or noodles with less alongside them. Keep the carbs, but try ${exampleText}.`,
        action: `On your next carb-heavy meal, try ${examples[0]}.`,
        whyThisHelps: "Pairing carbs with protein and vegetables makes meals more balanced without cutting anything out.",
      };
    case "home_cooked":
      return {
        ...rec,
        title: "Try one more home-cooked meal",
        description: `Recent meals lean toward restaurant or packaged sources. Try ${exampleText} in place of one takeout meal this week.`,
        action: `Swap one upcoming takeout meal for ${examples[0]}.`,
        whyThisHelps: "Home-cooked meals make it easier to control what's actually in them.",
      };
    case "snack_swap":
      return {
        ...rec,
        title: "Try a less processed snack",
        description: `A portion of recent meals were estimated as more processed. Try ${exampleText} for one snack this week.`,
        action: `Next time you reach for a packaged snack, try ${examples[0]} instead.`,
        whyThisHelps: "Small, minimally processed swaps add up without requiring a whole new routine.",
      };
    default:
      return rec;
  }
}

/** Applies personalization to a full recommendation list — the usual
 * entry point for API routes (see src/app/api/adults/contacts/[id] and
 * src/app/api/gym/clients/[id]). */
export function personalizeFoodBalanceRecommendations(
  recommendations: FoodBalanceRecommendation[],
  profile: DietaryProfile | undefined,
  opts: PersonalizeOptions = {}
): FoodBalanceRecommendation[] {
  return recommendations.map((rec) => personalizeFoodBalanceRecommendation(rec, profile, opts));
}
