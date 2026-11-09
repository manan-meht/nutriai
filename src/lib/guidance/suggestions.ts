import type { DietaryProfile } from "@/lib/dietary-profile/types";
import { getFood, nutrientPer100g, portionGrams, type CompositionFood } from "@/lib/nutrients/composition";
import type { NutrientKey as CatalogKey } from "@/lib/nutrients/catalog";

import type { DailyTotals } from "./daily-totals";
import type { MealSlot } from "./day-plan";
import type { NutrientKey } from "./meal-impact";

// The next-meal suggestion.
//
// Built from a small library of everyday components (a protein food, a
// base, a vegetable) whose nutrients come from the composition source
// (USDA FoodData Central, src/lib/nutrients), never from a model or a
// made-up figure, and whose household portions use that source's own gram
// weights ("1 cup cooked rice" is FDC's 158 g). Portions are sized to what
// is left today, shared across the meals still to come, and the options are
// ranked on energy fit, protein, fibre and how familiar the foods are to
// this person.
//
// What it respects:
//   - Diet: only animal foods the person has been seen eating and hasn't
//     ruled out. With no dietary profile, vegetarian foods only.
//   - Allergies and avoided foods named in Guidance setup. An allergy it
//     can't map to foods is shown on the card to check, never ignored.
//   - No kitchen: only foods that need no cooking.
//   - Planned meals: a meal already planned for later today is set aside
//     from what's left before this one is sized.
// Clinical constraints are handled upstream: screening routes the
// conditions the policy can't support away from Guidance entirely.
//
// Pure: no database, no clock. The caller passes today's totals, history
// and preferences.

export const SUGGESTION_ENGINE_VERSION = "suggest-2026-11-v1";

export interface SuggestionComponent {
  id: string;
  /** "chicken", "dal". */
  food: string;
  /** "100 g cooked chicken", "½ cup cooked rice". */
  portion: string;
  /** Cooked, edible grams: what the estimate is computed from. */
  grams: number;
  role: Role;
  source: { foodId: string; description: string; dataset: string; version: string };
}

export interface MealSuggestion {
  /** Stable for the same inputs, so the server can recompute and find it. */
  id: string;
  version: string;
  date: string;
  slot: MealSlot;
  /** "Chicken, dal & vegetables". */
  title: string;
  /** "Make room for protein". */
  headline: string;
  /** "A simple lunch to build on breakfast." */
  reason: string;
  components: SuggestionComponent[];
  /** The meal's estimated contribution. Null where the source has no value
   * for a component: never a zero standing in for unknown. */
  estimate: Record<NutrientKey, number | null>;
  /** Every component appears in this person's own logged meals. */
  familiar: boolean;
}

export interface DietAllowances {
  /** Whether each food group may be suggested. */
  dairy: boolean;
  eggs: boolean;
  chicken: boolean;
  fish: boolean;
  redMeat: boolean;
  /** No profile yet: suggestions stay vegetarian, and the card says why. */
  profileKnown: boolean;
}

/** What may be suggested, from the dietary profile. Animal foods need to
 * have been seen in the person's meals and not ruled out: suggesting chicken
 * to someone who has never logged it risks offending a religious or
 * personal rule nobody wrote down. */
export function dietAllowances(profile: DietaryProfile | null | undefined): DietAllowances {
  if (!profile) return { dairy: true, eggs: false, chicken: false, fish: false, redMeat: false, profileKnown: false };
  const vegan = profile.explicit_vegan || profile.inferred_pattern === "plant_based_observed";
  const vegetarian = vegan || profile.explicit_vegetarian;
  return {
    dairy: !vegan && !profile.explicit_avoids_dairy,
    eggs: !vegetarian && profile.observed_eggs && !profile.explicit_avoids_eggs,
    chicken: !vegetarian && profile.observed_chicken && !profile.explicit_avoids_chicken,
    fish: !vegetarian && profile.observed_fish && !profile.explicit_avoids_fish,
    redMeat: !vegetarian && profile.observed_red_meat && !profile.explicit_avoids_red_meat,
    profileKnown: true,
  };
}

// ─── Component library ─────────────────────────────────────────────────────

type Role = "protein" | "dal" | "base" | "veg" | "fruit";
type Allergen = "dairy" | "egg" | "fish" | "soy" | "gluten" | "peanut" | "tree_nut" | "chickpea";

interface ComponentDef {
  id: string;
  food: string;
  /** Composition key (src/lib/nutrients). */
  key: string;
  role: Role;
  slots: MealSlot[];
  needs?: keyof Omit<DietAllowances, "profileKnown">;
  allergens?: Allergen[];
  noCook?: boolean;
  /** Words that identify it in a logged meal or an avoided-foods list. */
  keywords: string[];
  /** [label shown, measure the composition source can weigh]. Where the
   * source's measure word isn't parseable ("1 item" of idli), the grams
   * are its own weight for that measure: 38 g an idli, 55 g a guava. */
  steps: Array<[string, string]>;
}

const MAIN: MealSlot[] = ["lunch", "dinner"];

const LIBRARY: ComponentDef[] = [
  // Protein foods
  { id: "chicken", food: "chicken", key: "chicken_breast_cooked", role: "protein", slots: MAIN, needs: "chicken", keywords: ["chicken"], steps: [["75 g cooked chicken", "75 g"], ["100 g cooked chicken", "100 g"], ["150 g cooked chicken", "150 g"]] },
  { id: "fish", food: "fish", key: "fish_pompano_cooked", role: "protein", slots: MAIN, needs: "fish", allergens: ["fish"], keywords: ["fish", "pomfret", "rohu", "surmai", "machli"], steps: [["75 g cooked fish", "75 g"], ["100 g cooked fish", "100 g"], ["150 g cooked fish", "150 g"]] },
  { id: "eggs", food: "eggs", key: "egg_boiled", role: "protein", slots: ["breakfast", "lunch", "dinner", "snack"], needs: "eggs", allergens: ["egg"], keywords: ["egg", "anda", "omelette", "omelet", "bhurji"], noCook: false, steps: [["1 boiled egg", "1 large"], ["2 boiled eggs", "2 large"], ["3 boiled eggs", "3 large"]] },
  { id: "paneer", food: "paneer", key: "paneer", role: "protein", slots: ["breakfast", "lunch", "dinner"], needs: "dairy", allergens: ["dairy"], keywords: ["paneer"], steps: [["50 g paneer", "50 g"], ["75 g paneer", "75 g"], ["100 g paneer", "100 g"]] },
  { id: "tofu", food: "tofu", key: "tofu_firm", role: "protein", slots: MAIN, allergens: ["soy"], keywords: ["tofu"], steps: [["100 g tofu", "100 g"], ["150 g tofu", "150 g"]] },
  { id: "rajma", food: "rajma", key: "rajma", role: "protein", slots: MAIN, keywords: ["rajma", "kidney bean"], steps: [["½ cup rajma", "0.5 cup"], ["1 cup rajma", "1 cup"]] },
  { id: "chana", food: "chana", key: "chickpeas_cooked", role: "protein", slots: MAIN, allergens: ["chickpea"], keywords: ["chana", "chole", "chickpea"], steps: [["½ cup cooked chana", "0.5 cup"], ["1 cup cooked chana", "1 cup"]] },
  { id: "curd", food: "curd", key: "yogurt_whole", role: "protein", slots: ["breakfast", "snack"], needs: "dairy", allergens: ["dairy"], noCook: true, keywords: ["curd", "dahi", "yogurt", "yoghurt"], steps: [["150 g curd", "150 g"], ["200 g curd", "200 g"]] },
  { id: "sprouts", food: "sprouts", key: "mung_sprouted", role: "protein", slots: ["breakfast", "snack"], noCook: true, keywords: ["sprout", "moong"], steps: [["1 cup sprouts", "1 cup"]] },
  { id: "peanuts", food: "peanuts", key: "peanuts_roasted", role: "protein", slots: ["snack"], allergens: ["peanut"], noCook: true, keywords: ["peanut", "moongphali"], steps: [["30 g roasted peanuts", "30 g"]] },
  // Dal, as a protein food of its own or beside another
  { id: "dal", food: "dal", key: "dal", role: "dal", slots: MAIN, keywords: ["dal", "daal", "lentil"], steps: [["½ cup dal", "0.5 cup"], ["1 cup dal", "1 cup"]] },
  // Bases
  { id: "rice", food: "rice", key: "rice_white_cooked", role: "base", slots: MAIN, keywords: ["rice", "chawal"], steps: [["½ cup cooked rice", "0.5 cup"], ["¾ cup cooked rice", "0.75 cup"], ["1 cup cooked rice", "1 cup"], ["1½ cups cooked rice", "1.5 cup"]] },
  { id: "roti", food: "roti", key: "chapati_whole_wheat", role: "base", slots: ["breakfast", "lunch", "dinner"], allergens: ["gluten"], keywords: ["roti", "chapati", "phulka"], steps: [["1 roti", "1 piece"], ["2 rotis", "2 piece"], ["3 rotis", "3 piece"]] },
  { id: "millet", food: "millet", key: "millet_cooked", role: "base", slots: MAIN, keywords: ["millet", "bajra"], steps: [["½ cup cooked millet", "0.5 cup"], ["1 cup cooked millet", "1 cup"]] },
  { id: "oats", food: "oats", key: "oats_cooked", role: "base", slots: ["breakfast"], keywords: ["oats", "porridge", "dalia"], steps: [["¾ cup cooked oats", "0.75 cup"], ["1 cup cooked oats", "1 cup"]] },
  { id: "idli", food: "idli", key: "idli", role: "base", slots: ["breakfast"], keywords: ["idli"], steps: [["2 idli", "76 g"], ["3 idli", "114 g"]] },
  { id: "upma", food: "upma", key: "upma", role: "base", slots: ["breakfast"], allergens: ["gluten"], keywords: ["upma"], steps: [["1 cup upma", "1 cup"]] },
  { id: "toast", food: "whole-wheat toast", key: "bread_whole_wheat", role: "base", slots: ["breakfast"], allergens: ["gluten"], noCook: true, keywords: ["toast", "bread"], steps: [["1 slice whole-wheat bread", "1 slice"], ["2 slices whole-wheat bread", "2 slice"]] },
  // Vegetables
  { id: "veg", food: "vegetables", key: "mixed_vegetables_cooked", role: "veg", slots: MAIN, keywords: ["sabzi", "sabji", "vegetable", "veg"], steps: [["1 cup cooked vegetables", "1 cup"]] },
  { id: "bhindi", food: "bhindi", key: "okra_cooked", role: "veg", slots: MAIN, keywords: ["bhindi", "okra"], steps: [["1 cup bhindi", "1 cup"]] },
  { id: "gobi", food: "gobi", key: "cauliflower_cooked", role: "veg", slots: MAIN, keywords: ["gobi", "cauliflower"], steps: [["1 cup gobi", "1 cup"]] },
  { id: "palak", food: "palak", key: "spinach_cooked", role: "veg", slots: MAIN, keywords: ["palak", "spinach"], steps: [["½ cup cooked palak", "0.5 cup"]] },
  { id: "salad", food: "cucumber salad", key: "cucumber_raw", role: "veg", slots: MAIN, noCook: true, keywords: ["salad", "cucumber", "kheera"], steps: [["1 cup cucumber slices", "1 cup"]] },
  // Fruit
  { id: "banana", food: "banana", key: "banana_raw", role: "fruit", slots: ["breakfast", "snack"], noCook: true, keywords: ["banana", "kela"], steps: [["1 small banana", "1 small"]] },
  { id: "papaya", food: "papaya", key: "papaya_raw", role: "fruit", slots: ["breakfast", "snack"], noCook: true, keywords: ["papaya"], steps: [["1 cup papaya", "1 cup"]] },
  { id: "guava", food: "guava", key: "guava_raw", role: "fruit", slots: ["breakfast", "snack"], noCook: true, keywords: ["guava", "amrood"], steps: [["1 guava", "55 g"]] },
];

/** Free-text allergies from setup, mapped to the library's allergen tags.
 * Anything not recognised is returned so the card can show it. */
const ALLERGY_WORDS: Array<[RegExp, Allergen[]]> = [
  [/peanut|groundnut|moongphali/, ["peanut"]],
  [/tree ?nut|almond|cashew|walnut|pistachio|\bnuts?\b/, ["tree_nut"]],
  [/milk|dairy|lactose|casein|whey|paneer|curd|dahi/, ["dairy"]],
  [/\beggs?\b/, ["egg"]],
  [/fish|seafood|shellfish|prawn|shrimp/, ["fish"]],
  [/soy|soya|tofu/, ["soy"]],
  [/gluten|wheat|coeliac|celiac/, ["gluten"]],
  [/chickpea|chana|besan|gram/, ["chickpea"]],
];

export function mapAllergies(allergies: string[]): { tags: Set<Allergen>; unrecognised: string[] } {
  const tags = new Set<Allergen>();
  const unrecognised: string[] = [];
  for (const raw of allergies) {
    const a = raw.toLowerCase().trim();
    if (!a || a === "none" || a === "no") continue;
    const hits = ALLERGY_WORDS.filter(([re]) => re.test(a)).flatMap(([, t]) => t);
    if (hits.length === 0) unrecognised.push(raw.trim());
    hits.forEach((t) => tags.add(t));
  }
  return { tags, unrecognised };
}

// ─── Arithmetic ────────────────────────────────────────────────────────────

const GUIDANCE_TO_CATALOG: Record<NutrientKey, CatalogKey> = {
  calories: "energy",
  protein: "protein",
  carbs: "carbs",
  fat: "fat",
  fiber: "fiber",
};
const KEYS: NutrientKey[] = ["calories", "protein", "carbs", "fat", "fiber"];

interface Sized {
  def: ComponentDef;
  food: CompositionFood;
  label: string;
  grams: number;
  values: Record<NutrientKey, number | null>;
}

function sizeSteps(def: ComponentDef): Sized[] {
  const food = getFood(def.key);
  if (!food) return [];
  return def.steps
    .map(([label, measure]) => {
      const grams = portionGrams(food, measure);
      if (grams == null || !(grams > 0)) return null;
      const values = {} as Record<NutrientKey, number | null>;
      for (const k of KEYS) {
        const v = nutrientPer100g(food, GUIDANCE_TO_CATALOG[k]);
        values[k] = v.state === "value" ? (v.amount * grams) / 100 : v.state === "zero" || v.state === "trace" ? 0 : null;
      }
      return { def, food, label, grams: Math.round(grams), values };
    })
    .filter((s): s is Sized => s != null);
}

function sum(parts: Sized[]): Record<NutrientKey, number | null> {
  const out = {} as Record<NutrientKey, number | null>;
  for (const k of KEYS) {
    let total = 0;
    let unknown = false;
    for (const p of parts) {
      const v = p.values[k];
      if (v == null) unknown = true;
      else total += v;
    }
    out[k] = unknown ? null : Math.round(total);
  }
  return out;
}

/** "Chicken, dal & vegetables". */
function titleFor(parts: Sized[]): string {
  const named = parts.filter((p) => p.def.role !== "base" || parts.every((q) => q.def.role === "base" || q.def.role === "fruit"));
  const names = (named.length > 0 ? named : parts).map((p) => p.def.food);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (names.length === 1) return cap(names[0]);
  return cap(`${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`);
}

const SLOT_WEIGHT: Record<MealSlot, number> = { breakfast: 1, lunch: 1.25, snack: 0.4, dinner: 1.25 };
const SLOT_ORDER: MealSlot[] = ["breakfast", "lunch", "snack", "dinner"];

export interface SuggestionInput {
  date: string;
  slot: MealSlot;
  /** Today's totals so far, or null for tomorrow (nothing eaten yet). */
  totals: DailyTotals | null;
  target: { caloriesKcal: number; proteinG: number; fiberG: number };
  /** Slots after this one still to come that day (not logged, skipped or
   * planned), so what's left is shared rather than spent on this meal. */
  laterSlots: MealSlot[];
  /** Estimates of meals already planned for later that day. */
  plannedLater: { calories: number; protein: number };
  /** The slot of the last meal logged today, for the reason line. */
  lastLoggedSlot: MealSlot | null;
  diet: DietAllowances;
  allergies: string[];
  avoidedFoods: string[];
  cookingAccess: "full_kitchen" | "limited" | "none" | "unknown" | null;
  /** Food names from recent logged meals, for familiarity. */
  usualFoods: string[];
}

export type SuggestionResult =
  | { kind: "options"; options: MealSuggestion[]; notes: string[] }
  | { kind: "fallback"; reason: "target_reached" | "no_options"; message: string; notes: string[] };

/** The best few options for one meal, each built around a different main
 * food, so "Show another option" changes the meal, not just a portion. */
export function suggestMeals(input: SuggestionInput, max = 5): SuggestionResult {
  const { tags, unrecognised } = mapAllergies(input.allergies);
  const notes: string[] = [];
  if (!input.diet.profileKnown) notes.push("Vegetarian ideas only, until Tistra has seen more of what's eaten.");
  for (const a of unrecognised) notes.push(`Check this against the allergy noted in setup: "${a}".`);

  const consumedKcal = input.totals?.calories.consumed ?? 0;
  const consumedProtein = input.totals?.protein.consumed ?? 0;
  const leftKcal = Math.max(0, input.target.caloriesKcal - consumedKcal - input.plannedLater.calories);
  const leftProtein = Math.max(0, input.target.proteinG - consumedProtein - input.plannedLater.protein);
  const weights = [input.slot, ...input.laterSlots].reduce((s, slot) => s + SLOT_WEIGHT[slot], 0);
  const share = SLOT_WEIGHT[input.slot] / weights;
  const energy = Math.min(leftKcal, Math.max(input.slot === "snack" ? 120 : 250, leftKcal * share));
  const protein = Math.max(input.slot === "snack" ? 5 : 10, leftProtein * share);

  if (leftKcal < 150) {
    return {
      kind: "fallback",
      reason: "target_reached",
      message: "Today's energy target is about reached, so there's no meal to suggest. Vegetables or salad fit if hunger comes back.",
      notes,
    };
  }

  const avoided = input.avoidedFoods.map((a) => a.toLowerCase().trim()).filter(Boolean);
  const usual = input.usualFoods.map((f) => f.toLowerCase());
  const allowed = (d: ComponentDef) =>
    d.slots.includes(input.slot) &&
    (!d.needs || input.diet[d.needs]) &&
    !(d.allergens ?? []).some((a) => tags.has(a)) &&
    !avoided.some((a) => d.keywords.some((k) => k.includes(a) || a.includes(k))) &&
    (input.cookingAccess !== "none" || d.noCook);
  const familiar = (d: ComponentDef) => usual.some((f) => d.keywords.some((k) => f.includes(k)));

  const pool = LIBRARY.filter(allowed).map((d) => ({ d, steps: sizeSteps(d) })).filter((c) => c.steps.length > 0);
  const byRole = (r: Role) => pool.filter((c) => c.d.role === r);

  // Shapes of a meal, per slot. Each entry is a list of roles; "dal?" means
  // dal may sit beside another protein food.
  const shapes: Role[][] =
    input.slot === "breakfast" ? [["protein", "base"], ["protein", "fruit"], ["protein", "base", "fruit"]]
    : input.slot === "snack" ? [["protein"], ["fruit"], ["protein", "fruit"]]
    : [["protein", "base", "veg"], ["dal", "base", "veg"], ["protein", "dal", "base", "veg"]];

  const candidates: Array<{ score: number; parts: Sized[]; main: string }> = [];
  for (const shape of shapes) {
    const choices = shape.map((r) => byRole(r));
    if (choices.some((c) => c.length === 0)) continue;
    // Every combination of components, then every combination of portions.
    const combos: Array<typeof pool> = [[]];
    for (const options of choices) {
      const next: Array<typeof pool> = [];
      for (const combo of combos) for (const o of options) if (!combo.some((c) => c.d.id === o.d.id)) next.push([...combo, o]);
      combos.splice(0, combos.length, ...next);
    }
    for (const combo of combos) {
      let best: { score: number; parts: Sized[] } | null = null;
      const portions: Sized[][] = [[]];
      for (const c of combo) {
        // Dal beside another protein stays at its smallest portion.
        const steps = c.d.role === "dal" && combo.some((x) => x.d.role === "protein") ? c.steps.slice(0, 1) : c.steps;
        const next: Sized[][] = [];
        for (const p of portions) for (const s of steps) next.push([...p, s]);
        portions.splice(0, portions.length, ...next);
      }
      for (const parts of portions) {
        const est = sum(parts);
        if (est.calories == null || est.protein == null) continue;
        const kcalFit = Math.abs(est.calories - energy) / energy;
        const over = est.calories > energy * 1.15 ? (est.calories - energy * 1.15) / energy : 0;
        const proteinShort = Math.max(0, protein - est.protein) / protein;
        const fibre = est.fiber == null ? 0 : Math.min(1, est.fiber / 8);
        const known = combo.filter((c) => familiar(c.d)).length / combo.length;
        const score = -kcalFit - 3 * over - 1.5 * proteinShort + 0.3 * fibre + 0.4 * known;
        if (!best || score > best.score) best = { score, parts };
      }
      if (best) {
        const main = combo.find((c) => c.d.role === "protein" || c.d.role === "dal") ?? combo[0];
        candidates.push({ ...best, main: main.d.id });
      }
    }
  }

  if (candidates.length === 0) {
    return {
      kind: "fallback",
      reason: "no_options",
      message:
        input.cookingAccess === "none"
          ? "There's no no-cook meal in Tistra's list that fits today's preferences yet."
          : "There's no meal in Tistra's list that fits the diet and allergies noted in setup yet.",
      notes,
    };
  }

  // Best per main food, so each option is a different meal.
  const seen = new Set<string>();
  const picked = candidates
    .sort((a, b) => b.score - a.score)
    .filter((c) => (seen.has(c.main) ? false : (seen.add(c.main), true)))
    .slice(0, max);

  const proteinGap = input.totals ? input.totals.protein.remaining / Math.max(1, input.target.proteinG) : 1;
  const energyGap = input.totals ? input.totals.calories.remaining / Math.max(1, input.target.caloriesKcal) : 1;
  const headline =
    leftKcal < 400 ? "Keep it light" : proteinGap > energyGap + 0.1 ? "Make room for protein" : `A balanced ${input.slot}`;
  const reason =
    input.lastLoggedSlot && input.totals
      ? `A simple ${input.slot} to build on ${input.lastLoggedSlot}.`
      : input.slot === "breakfast"
        ? "A simple breakfast to start the day."
        : `A simple ${input.slot} that fits what's left today.`;

  return {
    kind: "options",
    notes,
    options: picked.map(({ parts }) => {
      const ordered = [...parts].sort((a, b) => ROLE_ORDER.indexOf(a.def.role) - ROLE_ORDER.indexOf(b.def.role));
      return {
        id: `${input.date}:${input.slot}:${ordered.map((p) => `${p.def.id}@${p.grams}`).join("+")}`,
        version: SUGGESTION_ENGINE_VERSION,
        date: input.date,
        slot: input.slot,
        title: titleFor(ordered),
        headline,
        reason,
        components: ordered.map((p) => ({
          id: p.def.id,
          food: p.def.food,
          portion: p.label,
          grams: p.grams,
          role: p.def.role,
          source: { foodId: p.food.id, description: p.food.description, dataset: p.food.sourceName, version: p.food.sourceVersion },
        })),
        estimate: sum(ordered),
        familiar: ordered.every((p) => familiar(p.def)),
      };
    }),
  };
}

const ROLE_ORDER: Role[] = ["protein", "dal", "base", "veg", "fruit"];

/** Which meal comes next, by the person's clock, skipping meals already
 * logged or skipped today. After dinner it's tomorrow's breakfast. */
export function nextSlot(params: {
  hour: number;
  today: string;
  tomorrow: string;
  done: Set<MealSlot>;
  includeSnack: boolean;
}): { date: string; slot: MealSlot } {
  const clock: MealSlot = params.hour < 10 ? "breakfast" : params.hour < 15 ? "lunch" : params.hour < 18 ? "snack" : "dinner";
  const order = SLOT_ORDER.filter((s) => params.includeSnack || s !== "snack");
  const start = order.indexOf(clock === "snack" && !params.includeSnack ? "dinner" : clock);
  for (const slot of order.slice(start)) if (!params.done.has(slot)) return { date: params.today, slot };
  // Late in the evening with dinner done, tomorrow's breakfast is next.
  if (params.hour >= 18 || params.done.has("dinner")) return { date: params.tomorrow, slot: "breakfast" };
  return { date: params.today, slot: clock };
}

export function laterSlots(slot: MealSlot, includeSnack: boolean, done: Set<MealSlot>): MealSlot[] {
  return SLOT_ORDER.slice(SLOT_ORDER.indexOf(slot) + 1).filter((s) => (includeSnack || s !== "snack") && !done.has(s));
}
