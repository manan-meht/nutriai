import { DietaryProfile } from "./types";
import { deriveInferredPatternFromProfile } from "./update";

/** The "Food preferences" editor's option set — one boolean per option the
 * user can toggle. Explicit choices always override AI inference (rules
 * 10/13). A positive "I eat X" is stronger evidence than an AI guess, so
 * it sets observed_X directly (reusing the existing observed_* fields
 * rather than adding parallel explicit_eats_* ones — "do not duplicate
 * fields") and unlocks that category's recommendations immediately,
 * without waiting for a meal to be logged. A negative "I avoid X" sets
 * explicit_avoids_X, which recommend.ts treats as a hard block regardless
 * of anything observed. */
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
