import type { NutrientKey } from "./catalog";

// Facts a person has confirmed that change an estimate, kept in three
// separate places because they mean different things:
//
//   - Household defaults ("our milk is fortified", "we use iodised salt").
//     True of food made at home. Never applied to a meal marked as eaten
//     outside, because a restaurant doesn't use the household's milk.
//   - Meal facts: confirmed for one meal only ("this was from a restaurant",
//     "this milk was Amul Gold"). They override household defaults for that
//     meal and nothing else.
//   - Confirmed products: a brand's label values, entered or read from a
//     label photo and confirmed by the person, reused whenever that product
//     is logged again.

export type FactAnswer = "yes" | "no" | "unsure";

export const HOUSEHOLD_FACT_KEYS = ["milk_fortified", "iodised_salt", "supplements_in_routine"] as const;
export type HouseholdFactKey = (typeof HOUSEHOLD_FACT_KEYS)[number];
export type HouseholdFacts = Partial<Record<HouseholdFactKey, FactAnswer>>;

export interface MealFacts {
  /** Confirmed eaten outside the home (restaurant, canteen, someone else's
   * kitchen). null/undefined = not known. */
  eatenOutside?: boolean | null;
  /** Overrides the household default for this meal only. */
  milkFortified?: FactAnswer | null;
  /** Confirmed products for named items in this meal. */
  products?: Array<{ itemName: string; productId: string }>;
}

export interface ConfirmedProduct {
  id: string;
  name: string;
  brand: string | null;
  /** Values are per 100 g, or per serving of servingGrams. */
  basis: "per_100g" | "per_serving";
  servingGrams: number | null;
  /** Canonical units (see catalog.ts toCanonical); absent = not on the label. */
  nutrients: Partial<Record<NutrientKey, number>>;
  source: "label" | "user";
  /** Lowercase names that identify the product in a meal analysis. */
  matchNames: string[];
}

/** Per-100 g values for a confirmed product, or null if the basis can't be
 * converted (per serving with no serving weight). */
export function productPer100g(product: ConfirmedProduct): Partial<Record<NutrientKey, number>> | null {
  if (product.basis === "per_100g") return product.nutrients;
  if (!product.servingGrams || product.servingGrams <= 0) return null;
  const factor = 100 / product.servingGrams;
  return Object.fromEntries(Object.entries(product.nutrients).map(([k, v]) => [k, (v as number) * factor]));
}

/** Whether household defaults apply to a meal: not when it's known to have
 * been eaten outside. */
export function householdDefaultsApply(meal: MealFacts | undefined): boolean {
  return meal?.eatenOutside !== true;
}
