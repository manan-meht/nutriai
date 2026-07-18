import { DietaryProfile, DietCategory, MealObservationInput, SENSITIVE_CATEGORIES } from "./types";

/** Below this, a meal's classification is too uncertain to teach the
 * dietary profile anything (rule 11) — matches the confidence vocabulary
 * used elsewhere (e.g. food-analyzer's confidence/food_identity_confidence),
 * not a new threshold system. */
function isHighConfidence(input: MealObservationInput): boolean {
  if (input.confidence !== "high") return false;
  // food_identity_confidence is only sometimes set (see FoodAnalysisResult
  // — absent means "no identity ambiguity was flagged", which is fine);
  // an explicit "low"/"medium" there means the item's identity itself is
  // uncertain even if the overall meal confidence is high, so it must not
  // update the profile either.
  if (input.foodIdentityConfidence && input.foodIdentityConfidence !== "high") return false;
  return true;
}

const CATEGORY_TO_FIELD: Record<DietCategory, keyof DietaryProfile> = {
  dairy: "observed_dairy",
  lactose_dairy: "observed_lactose_dairy",
  lactose_free_dairy: "observed_lactose_free_dairy",
  eggs: "observed_eggs",
  chicken: "observed_chicken",
  fish: "observed_fish",
  shellfish: "observed_shellfish",
  red_meat: "observed_red_meat",
  beef: "observed_beef",
  pork: "observed_pork",
  other_meat: "observed_other_meat",
};

/** Re-derives inferred_pattern from the observed_* flags alone — never
 * from the explicit_* preference fields (those affect recommendations
 * directly, see recommend.ts, but aren't "what's been observed"). Ordered
 * from most to least restrictive so e.g. someone with both dairy and fish
 * observed lands on pescatarian_observed, not vegetarian_observed. */
export function deriveInferredPatternFromProfile(profile: DietaryProfile): DietaryProfile["inferred_pattern"] {
  const otherMeatObserved = profile.observed_red_meat || profile.observed_beef || profile.observed_pork || profile.observed_shellfish || profile.observed_other_meat;
  const anyDairyObserved = profile.observed_dairy || profile.observed_lactose_dairy || profile.observed_lactose_free_dairy;

  if (otherMeatObserved && profile.observed_fish) return "mixed_diet_observed";
  if (otherMeatObserved) return "mixed_diet_observed";
  if (profile.observed_chicken && profile.observed_fish) return "mixed_diet_observed";
  if (profile.observed_chicken) return "chicken_observed";
  if (profile.observed_fish) return "pescatarian_observed";
  if (profile.observed_eggs) return "eggetarian_observed";
  if (anyDairyObserved) return "vegetarian_observed";
  return "plant_based_observed";
}

/** Applies one meal's observed categories to a dietary profile. Pure and
 * side-effect free — callers persist the result. Never flips a category
 * back to false (an animal food seen once stays "observed" even if a
 * later meal happens to be plant-based — this profile answers "has this
 * ever been part of their diet", not "what did they eat most recently").
 *
 * Sensitive categories (pork, red meat, shellfish, other meat — rule 12)
 * require either a user correction/confirmation, or having already been
 * provisionally observed once before at high confidence — the caller
 * passes that prior count in since only it has access to meal history;
 * this keeps the function pure rather than silently inventing new
 * persisted state beyond the spec's field list. */
export function updateDietaryProfile(
  profile: DietaryProfile,
  observation: MealObservationInput,
  priorHighConfidenceObservationCounts: Partial<Record<DietCategory, number>> = {}
): DietaryProfile {
  // Rule 11: low/ambiguous classifications never touch the profile.
  if (!observation.isUserCorrection && !isHighConfidence(observation)) {
    return profile;
  }

  const next: DietaryProfile = { ...profile };
  let changed = false;

  for (const category of observation.categories) {
    const field = CATEGORY_TO_FIELD[category];
    if (next[field] === true) continue; // already observed, nothing to do

    if (SENSITIVE_CATEGORIES.has(category) && !observation.isUserCorrection) {
      const priorCount = priorHighConfidenceObservationCounts[category] ?? 0;
      if (priorCount < 1) continue; // needs a second high-confidence sighting, or explicit confirmation
    }

    (next[field] as boolean) = true;
    changed = true;
  }

  if (!changed) return profile;

  next.inferred_pattern = deriveInferredPatternFromProfile(next);
  next.last_updated_at = new Date().toISOString();
  return next;
}
