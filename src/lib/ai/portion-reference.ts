// Reference tables the meal analyzer uses to turn what the model SAW into
// calories, so that the model's own gram and calorie guesses are checked
// by code rather than trusted.
//
// Two failure modes motivated these (seen on coach-client photos, Nov 2026):
//   1. Countable pieces were weighed by the model as a "serving": 3 small
//      paneer cubes came back as 90-130g, 2 momos as 60-80g. The model
//      counts well; it weighs badly. So it reports the count and the size of
//      one piece, and code multiplies.
//   2. Every existing guardrail was about protein. Calories for anything
//      outside the protein categories (momos, noodles, sweets, soups, sabzi)
//      were the model's raw guess with no check at all. A coarse
//      calories-per-gram band per kind of dish now bounds them.
//
// Like CATEGORY_DENSITY in food-analyzer.ts, these are deliberately broad
// sanity bounds drawn from typical published values (IFCT/USDA-style
// figures for cooked, as-eaten food), not lab-grade composition data.

import type { FoodAnalysisResult, FoodItem } from "./food-analyzer";

export type PieceSize = "small" | "medium" | "large";
type GramRange = readonly [number, number];

interface PieceSpec {
  label: string;
  small: GramRange;
  medium: GramRange;
  large: GramRange;
}

/** Weight of ONE piece, in grams as eaten (edible weight for meat). */
export const PIECE_WEIGHTS = {
  paneer_cube: { label: "paneer cube", small: [8, 14], medium: [15, 25], large: [30, 45] },
  tofu_cube: { label: "tofu cube", small: [8, 14], medium: [15, 25], large: [30, 45] },
  chicken_piece: { label: "boneless chicken piece, edible meat", small: [10, 20], medium: [20, 35], large: [40, 60] },
  momo_dumpling: { label: "momo, dumpling, dim sum or gyoza, whole", small: [15, 22], medium: [25, 35], large: [40, 55] },
  indian_sweet_piece: { label: "burfi, katli, peda or ladoo piece", small: [12, 18], medium: [20, 30], large: [35, 50] },
  chocolate_square: { label: "square of a chocolate bar", small: [4, 6], medium: [7, 10], large: [12, 18] },
  cheese_slice: { label: "cheese slice, wedge or cube", small: [12, 18], medium: [18, 25], large: [28, 40] },
  biscuit_cookie: { label: "biscuit, cookie or cracker", small: [5, 8], medium: [9, 13], large: [15, 25] },
  roti: { label: "roti, chapati or phulka", small: [25, 32], medium: [35, 45], large: [50, 70] },
  idli: { label: "idli", small: [30, 40], medium: [40, 55], large: [60, 80] },
  samosa_kachori: { label: "samosa or kachori", small: [35, 50], medium: [60, 80], large: [90, 120] },
  pakora_fritter: { label: "pakora, bhaji or fritter", small: [8, 15], medium: [15, 25], large: [25, 40] },
  cutlet_tikki_kebab: { label: "cutlet, tikki, patty or seekh kebab", small: [30, 45], medium: [50, 70], large: [75, 100] },
} as const satisfies Record<string, PieceSpec>;

export type PieceType = keyof typeof PIECE_WEIGHTS;

interface DishClassSpec {
  examples: string;
  /** Plausible calories per gram as eaten, [lowest, highest]. */
  kcalPerGram: GramRange;
  /** Most protein per gram a dish of this kind plausibly carries. */
  maxProteinPerGram: number;
  /** A dish that merely CONTAINS a protein food (chicken momos, egg fried
   * rice, chicken soup). If the model still tags it with a protein
   * food_category, the pure-ingredient density must not be applied to the
   * whole dish: 4 chicken momos are not 80g of chicken. */
  composite: boolean;
}

export const DISH_CLASSES = {
  clear_soup: { examples: "clear soup, broth, rasam", kcalPerGram: [0.1, 0.5], maxProteinPerGram: 0.06, composite: true },
  thick_soup: { examples: "manchow, sweet corn, cream or lentil soup", kcalPerGram: [0.3, 1.0], maxProteinPerGram: 0.05, composite: true },
  vegetable_sabzi: { examples: "dry or stir-fried vegetables, sabzi, poriyal", kcalPerGram: [0.4, 1.4], maxProteinPerGram: 0.05, composite: false },
  curry_gravy: { examples: "a curry or gravy dish as a whole, kadhi, korma", kcalPerGram: [0.5, 2.4], maxProteinPerGram: 0.12, composite: false },
  plain_rice: { examples: "plain boiled white or brown rice", kcalPerGram: [1.1, 1.5], maxProteinPerGram: 0.04, composite: false },
  rice_dish: { examples: "biryani, pulao, fried rice, khichdi, chicken rice", kcalPerGram: [1.2, 2.4], maxProteinPerGram: 0.1, composite: true },
  noodles_pasta: { examples: "hakka or stir-fried noodles, noodles in soup, pasta in sauce", kcalPerGram: [1.1, 2.2], maxProteinPerGram: 0.1, composite: true },
  steamed_dumpling: { examples: "steamed momos, dim sum, gyoza, modak", kcalPerGram: [1.3, 2.2], maxProteinPerGram: 0.11, composite: true },
  bread_roti: { examples: "roti, chapati, naan, paratha, bread, bun, sandwich", kcalPerGram: [2.0, 3.6], maxProteinPerGram: 0.12, composite: true },
  south_indian_batter: { examples: "idli, dosa, uttapam, appam, dhokla", kcalPerGram: [1.2, 2.6], maxProteinPerGram: 0.08, composite: true },
  deep_fried_snack: { examples: "samosa, pakora, vada, kachori, fried momos, spring rolls", kcalPerGram: [2.4, 3.6], maxProteinPerGram: 0.12, composite: true },
  crisps_namkeen: { examples: "chips, bhujia, namkeen mixture, crispy fried noodles", kcalPerGram: [4.5, 5.8], maxProteinPerGram: 0.2, composite: true },
  indian_sweet: { examples: "burfi, ladoo, peda, kaju katli, gulab jamun, jalebi, halwa", kcalPerGram: [2.5, 5.0], maxProteinPerGram: 0.12, composite: false },
  chocolate: { examples: "milk or dark chocolate", kcalPerGram: [5.0, 6.1], maxProteinPerGram: 0.1, composite: false },
  baked_dessert: { examples: "cake, pastry, brownie, cookies, muffin", kcalPerGram: [3.0, 5.0], maxProteinPerGram: 0.08, composite: false },
  creamy_dessert: { examples: "ice cream, kheer, pudding, custard, mousse", kcalPerGram: [1.0, 2.6], maxProteinPerGram: 0.07, composite: false },
  cheese: { examples: "cheddar, processed cheese slice, mozzarella", kcalPerGram: [2.5, 4.2], maxProteinPerGram: 0.3, composite: false },
  fresh_fruit: { examples: "any fresh fruit except avocado", kcalPerGram: [0.25, 1.0], maxProteinPerGram: 0.02, composite: false },
  raw_vegetables: { examples: "cucumber, carrot, salad leaves, tomato, without dressing", kcalPerGram: [0.1, 0.5], maxProteinPerGram: 0.03, composite: false },
  sweetened_drink: { examples: "juice, soda, sweetened tea or coffee, bubble tea, dessert soup (not protein shakes)", kcalPerGram: [0.3, 1.2], maxProteinPerGram: 0.04, composite: false },
  milk_yogurt: { examples: "milk, curd or dahi, lassi, yogurt", kcalPerGram: [0.4, 1.2], maxProteinPerGram: 0.1, composite: false },
} as const satisfies Record<string, DishClassSpec>;

export type DishClass = keyof typeof DISH_CLASSES;

const PIECE_SIZES: readonly PieceSize[] = ["small", "medium", "large"];

function isPieceType(v: unknown): v is PieceType {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(PIECE_WEIGHTS, v);
}

function isDishClass(v: unknown): v is DishClass {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(DISH_CLASSES, v);
}

export function dishClassOf(item: Pick<FoodItem, "dish_class">): DishClassSpec | null {
  return isDishClass(item.dish_class) ? DISH_CLASSES[item.dish_class] : null;
}

/** The item is a dish that contains a protein food, rather than the
 * protein food itself. */
export function isCompositeDish(item: Pick<FoodItem, "dish_class">): boolean {
  return dishClassOf(item)?.composite === true;
}

/** Count x weight of one piece, or null when the model didn't give a
 * usable count, piece type and piece size. */
export function pieceWeightRange(
  item: Pick<FoodItem, "count_visible_pieces" | "piece_type" | "piece_size">
): [number, number] | null {
  const count = item.count_visible_pieces;
  if (typeof count !== "number" || !Number.isFinite(count) || count <= 0 || count > 50) return null;
  if (!isPieceType(item.piece_type)) return null;
  const size = PIECE_SIZES.includes(item.piece_size as PieceSize) ? (item.piece_size as PieceSize) : null;
  if (!size) return null;
  const [min, max] = PIECE_WEIGHTS[item.piece_type][size];
  return [Math.round(count * min), Math.round(count * max)];
}

/** "150-200g", "300-400ml", "about 40 g" -> [min, max] grams. Millilitres
 * are taken as grams: everything measured in ml here (soups, drinks, dal)
 * is close enough to water for a sanity bound. A number with no unit
 * ("2-3 pieces") is not a weight. */
export function parseWeightRange(text: string | null | undefined): [number, number] | null {
  if (!text) return null;
  const t = text.toLowerCase().replace(/,/g, "");
  const unit = "(kg|g|gm|gms|grams?|ml)\\b";
  const range = t.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:g|ml)?\\s*(?:-|–|to)\\s*(\\d+(?:\\.\\d+)?)\\s*${unit}`));
  const single = t.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${unit}`));
  let min: number;
  let max: number;
  let u: string;
  if (range) {
    min = Number(range[1]);
    max = Number(range[2]);
    u = range[3];
  } else if (single) {
    min = max = Number(single[1]);
    u = single[2];
  } else return null;
  if (u === "kg") {
    min *= 1000;
    max *= 1000;
  }
  if (!(min > 0) || max < min || max >= 5000) return null;
  return [min, max];
}

/** The model's own weight for the item as eaten. A dish is weighed whole
 * (the cooked-weight string), since its edible-weight fields, if any,
 * describe only the protein in it. */
function modelWeightRange(item: FoodItem): [number, number] | null {
  const whole = parseWeightRange(item.estimated_cooked_weight_grams);
  const edible =
    typeof item.estimated_edible_weight_grams_min === "number" &&
    typeof item.estimated_edible_weight_grams_max === "number" &&
    item.estimated_edible_weight_grams_min > 0 &&
    item.estimated_edible_weight_grams_max >= item.estimated_edible_weight_grams_min
      ? ([item.estimated_edible_weight_grams_min, item.estimated_edible_weight_grams_max] as [number, number])
      : null;
  return whole ?? edible;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const formatGramRange = ([min, max]: [number, number]) => (min === max ? `${min}g` : `${min}-${max}g`);

/** For an item whose calories are the model's own (no protein-category
 * density applies): keep the model's sense of how calorie-dense the dish
 * is, but
 *   - bound that density to what this kind of dish can plausibly be, and
 *   - apply it to the counted weight when there is one, rather than to the
 *     model's guessed weight.
 * Protein, carbs, fat and fibre are scaled with calories so the item stays
 * self-consistent, and protein is capped for the kind of dish. Items with
 * no dish class and no counted pieces, no usable weight, or zero calories
 * are returned unchanged. */
export function applyDishCalorieBounds(item: FoodItem, countedWeight: [number, number] | null): FoodItem {
  if (!(item.calories_max > 0)) return item;
  const cls = dishClassOf(item);
  if (!cls && !countedWeight) return item;

  const modelWeight = modelWeightRange(item);
  const weight = countedWeight ?? modelWeight;
  if (!weight) return item;

  let densityMin: number;
  let densityMax: number;
  if (modelWeight) {
    densityMin = item.calories_min / modelWeight[0];
    densityMax = item.calories_max / modelWeight[1];
  } else if (cls) {
    [densityMin, densityMax] = cls.kcalPerGram;
  } else {
    return item;
  }
  if (cls) {
    densityMin = clamp(densityMin, cls.kcalPerGram[0], cls.kcalPerGram[1]);
    densityMax = clamp(densityMax, cls.kcalPerGram[0], cls.kcalPerGram[1]);
  }

  let caloriesMin = Math.round(weight[0] * densityMin);
  let caloriesMax = Math.round(weight[1] * densityMax);
  if (caloriesMin > caloriesMax) [caloriesMin, caloriesMax] = [caloriesMax, caloriesMin];

  const scaleMin = item.calories_min > 0 ? caloriesMin / item.calories_min : 1;
  const scaleMax = caloriesMax / item.calories_max;
  // A field the model left out stays left out, rather than becoming 0 and
  // dragging the meal's re-summed totals down.
  const scaled = (v: number, f: number) => (typeof v === "number" ? Math.round(v * f) : v);

  let proteinMin = scaled(item.protein_min, scaleMin);
  let proteinMax = scaled(item.protein_max, scaleMax);
  if (cls) proteinMax = Math.min(proteinMax, Math.round(weight[1] * cls.maxProteinPerGram));
  proteinMin = Math.min(proteinMin, proteinMax);

  const next: FoodItem = {
    ...item,
    calories_min: caloriesMin,
    calories_max: caloriesMax,
    protein_min: proteinMin,
    protein_max: proteinMax,
    carbs_min: scaled(item.carbs_min, scaleMin),
    carbs_max: scaled(item.carbs_max, scaleMax),
    fat_min: scaled(item.fat_min, scaleMin),
    fat_max: scaled(item.fat_max, scaleMax),
    fiber_min: scaled(item.fiber_min, scaleMin),
    fiber_max: scaled(item.fiber_max, scaleMax),
  };
  if (countedWeight) next.estimated_cooked_weight_grams = formatGramRange(countedWeight);

  const unchanged =
    next.calories_min === item.calories_min &&
    next.calories_max === item.calories_max &&
    next.protein_min === item.protein_min &&
    next.protein_max === item.protein_max &&
    next.estimated_cooked_weight_grams === item.estimated_cooked_weight_grams;
  return unchanged ? item : next;
}

// --- A person's own portion corrections, fed back to their next photo ----

type FoodWeightOnly = Pick<FoodItem, "name" | "estimated_cooked_weight_grams">;

/** One meal_portion_corrections row, with just the foods of its before and
 * after JSON selected. */
export interface PortionCorrectionRow {
  user_correction_text: string | null;
  original_foods: FoodWeightOnly[] | null;
  final_foods: FoodWeightOnly[] | null;
}

const oneLine = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

/** Turns a person's recent corrections (newest first) into short prompt
 * lines, keeping only those that changed an item's weight: an identity fix
 * ("this is burfi") or a question says nothing about their portions. */
export function portionHistoryLines(rows: PortionCorrectionRow[], limit = 5): string[] {
  const lines: string[] = [];
  for (const row of rows) {
    if (lines.length >= limit) break;
    const said = oneLine(row.user_correction_text ?? "", 100).replace(/"/g, "'");
    if (!said || !Array.isArray(row.final_foods) || !Array.isArray(row.original_foods)) continue;
    const before = new Map<string, string>();
    for (const f of row.original_foods) {
      if (f?.name && f.estimated_cooked_weight_grams) before.set(f.name.toLowerCase().trim(), f.estimated_cooked_weight_grams);
    }
    const changes: string[] = [];
    for (const f of row.final_foods) {
      const was = f?.name ? before.get(f.name.toLowerCase().trim()) : undefined;
      const now = f?.estimated_cooked_weight_grams;
      if (was && now && was !== now) changes.push(`${oneLine(f.name, 60)} ${oneLine(was, 20)} -> ${oneLine(now, 20)}`);
    }
    if (changes.length) lines.push(`They said "${said}": ${changes.slice(0, 3).join("; ")}`);
  }
  return lines;
}

/** Issue types meal_portion_corrections accepts (see its CHECK constraint
 * in 0018_meal_portion_corrections.sql). */
export type CorrectionIssueType =
  | "portion_overestimate"
  | "portion_underestimate"
  | "wrong_food"
  | "wrong_meal_type"
  | "wrong_calories"
  | "wrong_protein";

type CorrectionSide = Pick<FoodAnalysisResult, "meal_type" | "total_calories_min" | "total_calories_max" | "total_protein_min" | "total_protein_max"> & {
  foods: Array<Pick<FoodItem, "name" | "calories_min" | "calories_max">>;
};

/** What kind of mistake a user's correction fixed, or null when it didn't
 * move the estimate in any way worth learning from.
 *
 * Calories count, not just protein: "I only ate half the noodles" moves
 * calories a lot and protein hardly at all, and used to be recorded as
 * wrong_meal_type (when the re-analysis also relabelled the meal) or not
 * recorded at all, which hid calorie overestimates from the data meant to
 * catch them. The direction follows calories when they moved, since that's
 * what a portion correction changes most; protein otherwise. */
export function classifyCorrection(previous: CorrectionSide, corrected: CorrectionSide): CorrectionIssueType | null {
  const mid = (min: number, max: number) => (min + max) / 2;
  const proteinDelta = mid(corrected.total_protein_min, corrected.total_protein_max) - mid(previous.total_protein_min, previous.total_protein_max);
  const prevProtein = mid(previous.total_protein_min, previous.total_protein_max);
  const proteinChanged = Math.abs(proteinDelta) >= Math.max(5, prevProtein * 0.2);
  const prevCalories = mid(previous.total_calories_min, previous.total_calories_max);
  const calorieDelta = mid(corrected.total_calories_min, corrected.total_calories_max) - prevCalories;
  // One item can be badly off while the meal total moves only a little:
  // "the avocado is 1/4" cut that item by ~45% but a full breakfast by 14%.
  const itemCaloriesBefore = new Map(previous.foods.map((f) => [f.name.toLowerCase(), mid(f.calories_min, f.calories_max)]));
  const anItemChanged = corrected.foods.some((f) => {
    const before = itemCaloriesBefore.get(f.name.toLowerCase());
    if (before == null) return false;
    return Math.abs(mid(f.calories_min, f.calories_max) - before) >= Math.max(40, before * 0.25);
  });
  const caloriesChanged = Math.abs(calorieDelta) >= Math.max(50, prevCalories * 0.15) || (anItemChanged && calorieDelta !== 0);
  const portionChanged = proteinChanged || caloriesChanged;
  const names = (s: CorrectionSide) => s.foods.map((f) => f.name.toLowerCase()).join(",");
  const foodChanged = names(previous) !== names(corrected);
  const mealTypeChanged = previous.meal_type !== corrected.meal_type;

  if (!portionChanged && !foodChanged && !mealTypeChanged) return null;
  if (foodChanged && !portionChanged) return "wrong_food";
  if (!portionChanged) return "wrong_meal_type";
  const delta = caloriesChanged ? calorieDelta : proteinDelta;
  if (delta < 0) return "portion_overestimate";
  if (delta > 0) return "portion_underestimate";
  return "wrong_calories";
}

// --- Prompt text, generated from the tables so the two can't drift -------

export const PIECE_TYPE_ENUM = (Object.keys(PIECE_WEIGHTS) as PieceType[]).join("|");
export const DISH_CLASS_ENUM = (Object.keys(DISH_CLASSES) as DishClass[]).join("|");

export const PIECE_WEIGHT_PROMPT_LINES = (Object.entries(PIECE_WEIGHTS) as Array<[PieceType, PieceSpec]>)
  .map(([key, s]) => `  - ${key} (${s.label}): ${s.small[0]}-${s.small[1]}g / ${s.medium[0]}-${s.medium[1]}g / ${s.large[0]}-${s.large[1]}g`)
  .join("\n");

export const DISH_CLASS_PROMPT_LINES = (Object.entries(DISH_CLASSES) as Array<[DishClass, DishClassSpec]>)
  .map(([key, s]) => `  - ${key}: ${s.examples}`)
  .join("\n");
