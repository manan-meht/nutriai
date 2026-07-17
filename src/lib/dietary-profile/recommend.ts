import { DietaryProfile } from "./types";

/** Allowed recommendation themes — general wellness/food-balance only,
 * never disease-management (see medical-handoff.ts for the boundary this
 * enforces). Mirrors the app's existing plain-language insight tone
 * (src/lib/insights.ts) rather than clinical phrasing. */
export type RecommendationTheme =
  | "protein"
  | "vegetables"
  | "fruit"
  | "fiber"
  | "carb_balance"
  | "consistency"
  | "variety"
  | "reduce_ultra_processed";

/** A category counts as "allowed" for recommendation copy only when it's
 * been observed (or explicitly self-reported — preferences.ts sets
 * observed_* directly for that case) AND isn't explicitly avoided, AND
 * doesn't conflict with an explicit vegan/vegetarian choice. Explicit
 * vegan/vegetarian always wins over any observed_* flag (rules 7/10 in
 * the spec, tests 6-7) — e.g. someone who was vegetarian for years but
 * ate chicken once as a teenager shouldn't have that resurface just
 * because it was logged before they set the preference. */
function isAllowed(profile: DietaryProfile, observed: boolean, explicitlyAvoided: boolean, blockedByVeganOrVegetarian: boolean): boolean {
  if (profile.explicit_vegan && blockedByVeganOrVegetarian) return false;
  if (profile.explicit_vegetarian && blockedByVeganOrVegetarian) return false;
  if (explicitlyAvoided) return false;
  return observed;
}

interface ProteinPermissions {
  dairy: boolean;
  eggs: boolean;
  chicken: boolean;
  fish: boolean;
}

function getProteinPermissions(profile: DietaryProfile): ProteinPermissions {
  const anyDairyObserved = profile.observed_dairy || profile.observed_lactose_dairy || profile.observed_lactose_free_dairy;
  return {
    dairy: isAllowed(profile, anyDairyObserved, profile.explicit_avoids_dairy, true),
    eggs: isAllowed(profile, profile.observed_eggs, profile.explicit_avoids_eggs, true),
    chicken: isAllowed(profile, profile.observed_chicken, profile.explicit_avoids_chicken, true) && !profile.explicit_vegetarian,
    fish: isAllowed(profile, profile.observed_fish, profile.explicit_avoids_fish, true) && !profile.explicit_vegetarian,
  };
}

const PLANT_PROTEINS = ["dal", "beans", "tofu", "sprouts", "soy chunks", "chana", "lentils"];

/** Food list scaled to what this person actually eats — plant-based
 * first, richer options layered in only once observed or explicitly
 * chosen (see module doc above). Mirrors the exact examples in the spec:
 * plant-only, dairy-observed, chicken-observed, and fish-observed
 * variants. Exported separately from buildProteinSuggestion so other
 * copy (e.g. src/lib/insights.ts's weekly protein bullet) can use the
 * same pattern-aware food list without the fixed "protein has been low
 * this week" framing. */
export function getProteinFoodSuggestions(profile: DietaryProfile): string[] {
  const perms = getProteinPermissions(profile);
  const foods: string[] = [];

  if (perms.chicken) {
    foods.push("chicken", "eggs", "dal", "tofu", "paneer", "Greek yogurt");
  } else if (perms.fish) {
    foods.push("fish", "eggs", "dal", "tofu", "paneer", "beans");
  } else if (perms.dairy) {
    foods.push("dal", "paneer", "Greek yogurt", "tofu", "sprouts", "chana");
  } else {
    foods.push(...PLANT_PROTEINS);
  }

  // eggs-only (eggetarian, no dairy/chicken/fish observed) is the one
  // combination none of the four spec examples cover directly — folded in
  // here rather than treated as its own branch above, since it's just
  // "the plant list plus eggs."
  if (perms.eggs && !perms.chicken && !perms.fish && !perms.dairy) {
    foods.splice(1, 0, "eggs");
  }

  return foods;
}

export function buildProteinSuggestion(profile: DietaryProfile): string {
  return `Protein has been low this week. Try adding ${formatFoodList(getProteinFoodSuggestions(profile))} to one meal.`;
}

function formatFoodList(foods: string[]): string {
  if (foods.length === 1) return foods[0];
  return `${foods.slice(0, -1).join(", ")}, or ${foods[foods.length - 1]}`;
}

/** Carb-heavy-meal nudge — never diet-pattern-specific, since rice/roti/
 * noodles vs. protein+veg balance applies the same regardless of what
 * protein source someone eats. */
export function buildCarbBalanceSuggestion(): string {
  return "Your recent meals were mostly rice, roti, or noodles with fewer vegetables. Keep the carbs, but add one protein source and one vegetable side.";
}

export function buildVegetableSuggestion(): string {
  return "Try adding one extra serving of vegetables to lunch or dinner today.";
}

export function buildFruitSuggestion(): string {
  return "Adding a piece of fruit to breakfast or as a snack can help round out today's meals.";
}

export function buildFiberSuggestion(profile: DietaryProfile): string {
  const perms = getProteinPermissions(profile);
  const fiberFoods = perms.dairy || perms.chicken || perms.fish
    ? ["legumes", "whole grains", "extra vegetables"]
    : ["dal", "beans", "whole grains", "vegetables"];
  return `A fibre-rich food like ${formatFoodList(fiberFoods)} at one meal can help round out today's balance.`;
}
