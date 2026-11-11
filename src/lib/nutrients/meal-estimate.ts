import { ALL_NUTRIENT_KEYS, CATALOG_VERSION, type NutrientKey } from "./catalog";
import {
  compositionIndex,
  getFood,
  matchFood,
  normalizeName,
  nutrientPer100g,
  portionGrams,
  type CompositionFood,
  type CompositionIndex,
} from "./composition";
import { householdDefaultsApply, productPer100g, type ConfirmedProduct, type HouseholdFacts, type MealFacts } from "./facts";
import { findRecipe, RECIPES_VERSION } from "./recipes";

// One meal's nutrient estimate, from the foods a meal analysis identified:
//
//   analysed foods and portions -> grams -> composition match -> amounts
//
// Nothing here invents a nutrient value. Every amount is grams times a
// per-100 g value from a named composition source (or a confirmed product
// label), and every estimate records which source, which version, how the
// grams were arrived at, and what limits it.
//
// The states are kept apart all the way through:
//   value   - a known positive amount
//   zero    - known to be zero (every contributor measured 0)
//   trace   - present below the source's reporting limit
//   unknown - nothing known: never shown or summed as 0
//   partial - a floor: some of the meal is known, some isn't, so the true
//             amount is at least this much
//
// A meal with an unweighed or unmatched item is partial for every nutrient
// that item could contribute to. That carries through into day totals
// (see assessment.ts), so an incomplete day is never read as a low one.

export const CALCULATION_VERSION = "micro-calc-v1";

export type NutrientState = "value" | "zero" | "trace" | "unknown" | "partial";

export interface NutrientEstimate {
  state: NutrientState;
  /** null when unknown. For partial, a lower bound. */
  amount: number | null;
  /** Share of the weighed grams with a known value for this nutrient, 0..1. */
  coverage: number;
}

export type ConfidenceReason =
  | "portion_estimated_from_photo"
  | "portion_from_household_measure"
  | "portion_unknown"
  | "food_identity_uncertain"
  | "dish_matched_to_main_ingredient"
  | "ingredients_inferred_by_analysis"
  | "standard_recipe_unreviewed"
  | "raw_or_cooked_unclear"
  | "not_in_composition_data"
  | "several_foods_in_one_item"
  | "milk_fortification_unknown"
  | "household_default_applied"
  | "source_missing_values"
  | "us_values_excluded"
  | "confirmed_product_label";

export type GramsBasis =
  | "analysis_grams"
  | "analysis_edible_weight"
  | "analysis_egg_count"
  | "analysis_cooked_weight"
  | "household_measure"
  | "ingredients"
  | "unknown";

export interface ComponentEstimate {
  name: string;
  grams: number | null;
  food: Pick<CompositionFood, "id" | "key" | "sourceId" | "sourceVersion" | "dataset" | "description" | "state"> | null;
  product: Pick<ConfirmedProduct, "id" | "name" | "brand" | "source"> | null;
  approximate: boolean;
  stateMismatch: boolean;
  /** Known amounts in canonical units. */
  amounts: Partial<Record<NutrientKey, number>>;
  /** Nutrients with a value of trace. */
  trace: NutrientKey[];
  /** Nutrients this component has no value for. */
  unknown: NutrientKey[];
  /** Nutrients whose amount here is only a lower bound. */
  floors: NutrientKey[];
}

export interface ItemEstimate {
  name: string;
  grams: number | null;
  gramsBasis: GramsBasis;
  /** observed: confirmed product label. matched: a composition food.
   * inferred: built from ingredients (the analysis's or a standard recipe).
   * unmatched: nothing to calculate from. */
  origin: "observed" | "matched" | "inferred" | "unmatched";
  recipe: { source: "analysis" | "standard_recipe"; id?: string; reviewed: boolean } | null;
  components: ComponentEstimate[];
  reasons: ConfidenceReason[];
  nutrients: Record<NutrientKey, NutrientEstimate>;
}

export interface MealEstimate {
  calculationVersion: string;
  catalogVersion: string;
  recipesVersion: string;
  compositionVersions: Record<string, string>;
  /** complete: every item weighed and matched, no floors among the
   * vitamins and minerals other than iodine. unknown: nothing known. */
  status: "complete" | "partial" | "unknown";
  items: ItemEstimate[];
  nutrients: Record<NutrientKey, NutrientEstimate>;
  reasons: ConfidenceReason[];
}

/** What a meal analysis gives us per food. All optional except the name:
 * the fields depend on the analyzer version that produced the meal. */
export interface AnalyzedFoodInput {
  name: string;
  quantity?: string | null;
  visible_quantity?: string | null;
  estimated_cooked_weight_grams?: string | null;
  estimated_edible_weight_grams_min?: number | null;
  estimated_edible_weight_grams_max?: number | null;
  egg_count_min?: number | null;
  egg_count_max?: number | null;
  is_ambiguous?: boolean | null;
  /** Added by the analyzer when micronutrient analysis is on. */
  edible_grams?: number | null;
  preparation_state?: "raw" | "cooked" | null;
  ingredients?: Array<{ name: string; grams: number; state?: "raw" | "cooked" | null }> | null;
}

export interface MealEstimateInput {
  foods: AnalyzedFoodInput[];
  identityConfidence?: "high" | "medium" | "low" | null;
  household?: HouseholdFacts;
  meal?: MealFacts;
  products?: ConfirmedProduct[];
}

/** Dish words left over after a match mean the name is a dish, not the
 * plain food ("egg curry" matched to egg). */
const DISH_WORDS = new Set([
  "curry",
  "masala",
  "gravy",
  "sabzi",
  "sabji",
  "subzi",
  "tadka",
  "korma",
  "kadai",
  "kadhai",
  "makhani",
  "salad",
  "sandwich",
  "wrap",
  "roll",
  "soup",
  "stew",
  "biryani",
  "pulao",
  "fry",
  "bhaji",
  "bharta",
  "kofta",
  "pakora",
  "paratha",
  "tikka",
  "burger",
  "pizza",
]);

const FORTIFIABLE_KEYS: NutrientKey[] = ["vitamin_d", "vitamin_a", "retinol"];

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Midpoint of "45-75g", "about 150 g", "1.2 kg". */
export function parseGramsText(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.toLowerCase().replace(/,/g, "");
  // A number with no weight unit ("2-3 pieces") isn't a weight.
  const range = t.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(kg|g|gm|gms|grams?)\b/);
  const single = t.match(/(\d+(?:\.\d+)?)\s*(kg|g|gm|gms|grams?)\b/);
  let value: number;
  let unit: string;
  if (range) {
    value = (Number(range[1]) + Number(range[2])) / 2;
    unit = range[3];
  } else if (single) {
    value = Number(single[1]);
    unit = single[2];
  } else return null;
  const grams = unit === "kg" ? value * 1000 : value;
  return grams > 0 && grams < 5000 ? grams : null;
}

function mid(min: number | null | undefined, max: number | null | undefined): number | null {
  if (typeof min !== "number" || typeof max !== "number" || !(min > 0) || !(max > 0)) return null;
  return (min + max) / 2;
}

function gramsFor(food: AnalyzedFoodInput, matched: CompositionFood | null): { grams: number | null; basis: GramsBasis } {
  if (typeof food.edible_grams === "number" && food.edible_grams > 0) return { grams: food.edible_grams, basis: "analysis_grams" };
  const edible = mid(food.estimated_edible_weight_grams_min, food.estimated_edible_weight_grams_max);
  if (edible) return { grams: edible, basis: "analysis_edible_weight" };
  const eggs = mid(food.egg_count_min, food.egg_count_max);
  if (eggs && matched) {
    const g = portionGrams(matched, `${eggs} large`);
    if (g) return { grams: g, basis: "analysis_egg_count" };
  }
  const cooked = parseGramsText(food.estimated_cooked_weight_grams);
  if (cooked) return { grams: cooked, basis: "analysis_cooked_weight" };
  if (matched) {
    for (const q of [food.quantity, food.visible_quantity]) {
      const g = q ? portionGrams(matched, q) : null;
      if (g) return { grams: g, basis: "household_measure" };
    }
  }
  return { grams: null, basis: "unknown" };
}

function emptyNutrients(): Record<NutrientKey, NutrientEstimate> {
  return Object.fromEntries(ALL_NUTRIENT_KEYS.map((k) => [k, { state: "unknown", amount: null, coverage: 0 }])) as Record<
    NutrientKey,
    NutrientEstimate
  >;
}

function foodRef(food: CompositionFood): ComponentEstimate["food"] {
  return { id: food.id, key: food.key, sourceId: food.sourceId, sourceVersion: food.sourceVersion, dataset: food.dataset, description: food.description, state: food.state };
}

function componentFromFood(
  name: string,
  grams: number | null,
  food: CompositionFood,
  opts: { approximate?: boolean; stateMismatch?: boolean; floors?: NutrientKey[] }
): { component: ComponentEstimate; excluded: boolean; missing: boolean } {
  const amounts: Partial<Record<NutrientKey, number>> = {};
  const trace: NutrientKey[] = [];
  const unknown: NutrientKey[] = [];
  let excluded = false;
  let missing = false;
  for (const key of ALL_NUTRIENT_KEYS) {
    const v = nutrientPer100g(food, key);
    if (v.state === "value") {
      if (grams != null) amounts[key] = round3((v.amount * grams) / 100);
    } else if (v.state === "zero") {
      if (grams != null) amounts[key] = 0;
    } else if (v.state === "trace") {
      trace.push(key);
    } else {
      unknown.push(key);
      if (v.reason && v.reason !== "not_in_source") excluded = true;
      else if (key !== "iodine") missing = true;
    }
  }
  return {
    component: {
      name,
      grams: grams == null ? null : round3(grams),
      food: foodRef(food),
      product: null,
      approximate: !!opts.approximate,
      stateMismatch: !!opts.stateMismatch,
      amounts,
      trace,
      unknown,
      floors: (opts.floors ?? []).filter((k) => amounts[k] != null || trace.includes(k)),
    },
    excluded,
    missing,
  };
}

function componentFromProduct(name: string, grams: number | null, product: ConfirmedProduct): ComponentEstimate | null {
  const per100 = productPer100g(product);
  if (!per100) return null;
  const amounts: Partial<Record<NutrientKey, number>> = {};
  const unknown: NutrientKey[] = [];
  for (const key of ALL_NUTRIENT_KEYS) {
    const v = per100[key];
    if (typeof v === "number" && grams != null) amounts[key] = round3((v * grams) / 100);
    else if (typeof v !== "number") unknown.push(key);
  }
  return {
    name,
    grams: grams == null ? null : round3(grams),
    food: null,
    product: { id: product.id, name: product.name, brand: product.brand, source: product.source },
    approximate: false,
    stateMismatch: false,
    amounts,
    trace: [],
    unknown,
    floors: [],
  };
}

function unmatchedComponent(name: string, grams: number | null): ComponentEstimate {
  return {
    name,
    grams: grams == null ? null : round3(grams),
    food: null,
    product: null,
    approximate: false,
    stateMismatch: false,
    amounts: {},
    trace: [],
    unknown: [...ALL_NUTRIENT_KEYS],
    floors: [],
  };
}

/** Sums components into nutrient estimates, keeping unknown and partial
 * apart from zero. */
export function sumComponents(components: ComponentEstimate[]): Record<NutrientKey, NutrientEstimate> {
  const out = emptyNutrients();
  const weighed = components.filter((c) => c.grams != null);
  const totalGrams = weighed.reduce((s, c) => s + (c.grams as number), 0);
  const anyUnweighed = components.some((c) => c.grams == null);
  for (const key of ALL_NUTRIENT_KEYS) {
    let amount = 0;
    let knownGrams = 0;
    let anyKnown = false;
    let anyTrace = false;
    let floor = anyUnweighed;
    for (const c of weighed) {
      const known = c.amounts[key] != null || c.trace.includes(key);
      if (known) {
        anyKnown = true;
        knownGrams += c.grams as number;
        amount += c.amounts[key] ?? 0;
        if (c.trace.includes(key)) anyTrace = true;
        if (c.floors.includes(key)) floor = true;
      }
    }
    if (!anyKnown) continue;
    const coverage = totalGrams > 0 ? knownGrams / totalGrams : 0;
    if (coverage < 1) floor = true;
    const state: NutrientState = floor ? "partial" : amount > 0 ? "value" : anyTrace ? "trace" : "zero";
    out[key] = { state, amount: round3(amount), coverage: Math.round(coverage * 1000) / 1000 };
  }
  return out;
}

function findProduct(name: string, products: ConfirmedProduct[] | undefined, meal: MealFacts | undefined): ConfirmedProduct | null {
  if (!products?.length) return null;
  const n = normalizeName(name);
  const confirmed = meal?.products?.find((p) => normalizeName(p.itemName) === n);
  if (confirmed) return products.find((p) => p.id === confirmed.productId) ?? null;
  return products.find((p) => p.matchNames.some((m) => n.includes(normalizeName(m)))) ?? null;
}

function hasLeftoverDishWord(name: string, alias: string): boolean {
  const aliasWords = new Set(alias.split(" "));
  return normalizeName(name)
    .split(" ")
    .some((w) => DISH_WORDS.has(w) && !aliasWords.has(w));
}

/** Milk fortification answer for this meal: the meal's own fact first, then
 * the household default where it applies. */
function milkFortified(input: MealEstimateInput): { answer: "yes" | "no" | null; fromHousehold: boolean } {
  const own = input.meal?.milkFortified;
  if (own === "yes" || own === "no") return { answer: own, fromHousehold: false };
  if (householdDefaultsApply(input.meal)) {
    const h = input.household?.milk_fortified;
    if (h === "yes" || h === "no") return { answer: h, fromHousehold: true };
  }
  return { answer: null, fromHousehold: false };
}

/** Swaps a fortifiable food for its fortified variant when that's
 * confirmed, or marks its fortifiable nutrients as floors when it isn't
 * known. */
function applyFortification(
  food: CompositionFood,
  input: MealEstimateInput,
  index: CompositionIndex,
  reasons: Set<ConfidenceReason>
): { food: CompositionFood; floors: NutrientKey[] } {
  const variant = food.variants?.fortified;
  if (!variant) return { food, floors: [] };
  const { answer, fromHousehold } = milkFortified(input);
  if (fromHousehold) reasons.add("household_default_applied");
  if (answer === "yes") {
    const fortified = getFood(`${food.sourceId}:${variant}`, index);
    if (fortified) return { food: fortified, floors: [] };
  }
  if (answer === "no") return { food, floors: [] };
  reasons.add("milk_fortification_unknown");
  return { food, floors: FORTIFIABLE_KEYS };
}

function estimateItem(food: AnalyzedFoodInput, input: MealEstimateInput, index: CompositionIndex): ItemEstimate {
  const reasons = new Set<ConfidenceReason>();
  if (food.is_ambiguous || input.identityConfidence === "low") reasons.add("food_identity_uncertain");
  const components: ComponentEstimate[] = [];
  let origin: ItemEstimate["origin"] = "unmatched";
  let recipe: ItemEstimate["recipe"] = null;
  let grams: number | null = null;
  let basis: GramsBasis = "unknown";
  const state = food.preparation_state ?? undefined;
  const noteGrams = (b: GramsBasis) => {
    if (b === "household_measure") reasons.add("portion_from_household_measure");
    else if (b === "unknown") reasons.add("portion_unknown");
    else reasons.add("portion_estimated_from_photo");
  };
  const addFood = (name: string, g: number | null, matchedFood: CompositionFood, flags: { approximate?: boolean; stateMismatch?: boolean }) => {
    const fortified = applyFortification(matchedFood, input, index, reasons);
    const { component, excluded, missing } = componentFromFood(name, g, fortified.food, { ...flags, floors: fortified.floors });
    if (excluded) reasons.add("us_values_excluded");
    if (missing) reasons.add("source_missing_values");
    if (flags.approximate) reasons.add("dish_matched_to_main_ingredient");
    if (flags.stateMismatch) reasons.add("raw_or_cooked_unclear");
    components.push(component);
  };

  const product = findProduct(food.name, input.products, input.meal);
  const ingredients = (food.ingredients ?? []).filter((i) => i && typeof i.name === "string" && typeof i.grams === "number" && i.grams > 0);
  const standard = findRecipe(food.name);

  if (product) {
    ({ grams, basis } = gramsFor(food, null));
    if (grams == null && product.servingGrams) {
      grams = product.servingGrams;
      basis = "household_measure";
    }
    const c = componentFromProduct(food.name, grams, product);
    if (c) {
      components.push(c);
      origin = "observed";
      reasons.add("confirmed_product_label");
    } else {
      components.push(unmatchedComponent(food.name, grams));
    }
    noteGrams(basis);
  } else if (ingredients.length > 0) {
    origin = "inferred";
    recipe = { source: "analysis", reviewed: false };
    reasons.add("ingredients_inferred_by_analysis");
    reasons.add("portion_estimated_from_photo");
    basis = "ingredients";
    grams = ingredients.reduce((s, i) => s + i.grams, 0);
    for (const ing of ingredients) {
      const m = matchFood(ing.name, { state: ing.state ?? undefined }, index);
      if (m.kind === "matched") addFood(ing.name, ing.grams, m.food, { approximate: m.approximate || hasLeftoverDishWord(ing.name, m.alias), stateMismatch: m.stateMismatch });
      else {
        reasons.add(m.kind === "multiple" ? "several_foods_in_one_item" : "not_in_composition_data");
        components.push(unmatchedComponent(ing.name, ing.grams));
      }
    }
  } else if (standard) {
    origin = "inferred";
    recipe = { source: "standard_recipe", id: standard.id, reviewed: false };
    reasons.add("standard_recipe_unreviewed");
    ({ grams, basis } = gramsFor(food, null));
    noteGrams(basis);
    for (const ing of standard.ingredients) {
      const f = getFood(ing.food, index);
      const g = grams == null ? null : grams * ing.fraction;
      if (f) addFood(f.description, g, f, {});
      else components.push(unmatchedComponent(ing.food, g));
    }
  } else {
    const m = matchFood(food.name, { state }, index);
    if (m.kind === "matched") {
      origin = "matched";
      ({ grams, basis } = gramsFor(food, m.food));
      noteGrams(basis);
      addFood(food.name, grams, m.food, { approximate: m.approximate || hasLeftoverDishWord(food.name, m.alias), stateMismatch: m.stateMismatch });
    } else {
      reasons.add(m.kind === "multiple" ? "several_foods_in_one_item" : "not_in_composition_data");
      ({ grams, basis } = gramsFor(food, null));
      noteGrams(basis);
      components.push(unmatchedComponent(food.name, grams));
    }
  }

  return {
    name: food.name,
    grams: grams == null ? null : round3(grams),
    gramsBasis: basis,
    origin,
    recipe,
    components,
    reasons: [...reasons],
    nutrients: sumComponents(components),
  };
}

const STATUS_KEYS: NutrientKey[] = ["calcium", "iron", "magnesium", "potassium", "zinc", "folate", "vitamin_a", "vitamin_b12", "vitamin_c", "vitamin_d"];

export function estimateMeal(input: MealEstimateInput, index: CompositionIndex = compositionIndex()): MealEstimate {
  const items = (input.foods ?? []).filter((f) => f && typeof f.name === "string" && f.name.trim()).map((f) => estimateItem(f, input, index));
  const nutrients = sumComponents(items.flatMap((i) => i.components));
  const reasons = [...new Set(items.flatMap((i) => i.reasons))];
  const anyKnown = STATUS_KEYS.some((k) => nutrients[k].state !== "unknown");
  const allComplete = items.length > 0 && STATUS_KEYS.every((k) => nutrients[k].state !== "unknown" && nutrients[k].state !== "partial");
  return {
    calculationVersion: CALCULATION_VERSION,
    catalogVersion: CATALOG_VERSION,
    recipesVersion: RECIPES_VERSION,
    compositionVersions: index.versions,
    status: !anyKnown ? "unknown" : allComplete ? "complete" : "partial",
    items,
    nutrients,
    reasons,
  };
}

/** A stable fingerprint of everything an estimate depends on, so that
 * re-ingesting the same meal with the same facts is a no-op. FNV-1a over a
 * key-sorted JSON encoding; not cryptographic, only for change detection. */
export function estimateInputHash(input: MealEstimateInput, index: CompositionIndex = compositionIndex()): string {
  const stable = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(stable)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v as Record<string, unknown>)
              .sort()
              .map((k) => [k, stable((v as Record<string, unknown>)[k])])
          )
        : v;
  const text = JSON.stringify(
    stable({ input, calc: CALCULATION_VERSION, catalog: CATALOG_VERSION, recipes: RECIPES_VERSION, sources: index.versions })
  );
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${CALCULATION_VERSION}:${h.toString(16).padStart(8, "0")}`;
}
