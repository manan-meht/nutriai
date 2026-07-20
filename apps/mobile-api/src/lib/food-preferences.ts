// Mirrors the main web app's src/lib/dietary-profile/preferences.ts
// (applyExplicitPreferences/FoodPreferenceSelections) and update.ts's
// deriveInferredPatternFromProfile — duplicated here rather than shared,
// matching this app's existing pattern (see lib/food-balance.ts's own
// comment on why). Keep in sync manually if the web app's preferences
// logic changes.
import type { DietaryProfile } from "./dietary-profile-types";

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

/** The "Food preferences" editor's option set — one boolean per option the
 * user can toggle. See the web app's preferences.ts for the full
 * rationale on each field's behavior (explicit choices always override
 * AI inference; a positive "I eat X" sets observed_X directly; a
 * negative "I avoid X" sets explicit_avoids_X as a hard block). */
export interface FoodPreferenceSelections {
  prefersPlantBasedSuggestions?: boolean;
  eatsVegetarian?: boolean;
  eatsEggs?: boolean;
  eatsChicken?: boolean;
  eatsFishOrSeafood?: boolean;
  eatsRedMeat?: boolean;
  avoidsDairy?: boolean;
  avoidsLactose?: boolean;
  avoidsPork?: boolean;
}

/** Applies a user's explicit "Food preferences" choices to their profile.
 * Only touches fields the caller actually included (undefined = "not
 * changed this time"), so a partial save from the editor never resets
 * unrelated preferences. */
export function applyExplicitPreferences(profile: DietaryProfile, selections: FoodPreferenceSelections): DietaryProfile {
  const next: DietaryProfile = { ...profile };

  if (selections.prefersPlantBasedSuggestions !== undefined) {
    next.prefers_plant_based_suggestions = selections.prefersPlantBasedSuggestions;
    if (selections.prefersPlantBasedSuggestions) next.explicit_vegan = true;
  }
  if (selections.eatsVegetarian !== undefined) {
    next.explicit_vegetarian = selections.eatsVegetarian;
    if (selections.eatsVegetarian) next.explicit_vegan = false;
  }
  if (selections.eatsEggs !== undefined) {
    next.explicit_avoids_eggs = !selections.eatsEggs;
    if (selections.eatsEggs) {
      next.observed_eggs = true;
      next.explicit_vegan = false;
    }
  }
  if (selections.eatsChicken !== undefined) {
    next.explicit_avoids_chicken = !selections.eatsChicken;
    if (selections.eatsChicken) {
      next.observed_chicken = true;
      next.explicit_vegan = false;
      next.explicit_vegetarian = false;
    }
  }
  if (selections.eatsFishOrSeafood !== undefined) {
    next.explicit_avoids_fish = !selections.eatsFishOrSeafood;
    if (selections.eatsFishOrSeafood) {
      next.observed_fish = true;
      next.explicit_vegan = false;
      next.explicit_vegetarian = false;
    }
  }
  if (selections.eatsRedMeat !== undefined) {
    next.explicit_avoids_red_meat = !selections.eatsRedMeat;
    if (selections.eatsRedMeat) {
      next.observed_red_meat = true;
      next.explicit_vegan = false;
      next.explicit_vegetarian = false;
    }
  }
  if (selections.avoidsDairy !== undefined) {
    next.explicit_avoids_dairy = selections.avoidsDairy;
  }
  if (selections.avoidsLactose !== undefined) {
    next.explicit_avoids_lactose = selections.avoidsLactose;
  }
  if (selections.avoidsPork !== undefined) {
    next.explicit_avoids_pork = selections.avoidsPork;
  }

  next.inferred_pattern = deriveInferredPatternFromProfile(next);
  next.last_updated_at = new Date().toISOString();
  return next;
}
