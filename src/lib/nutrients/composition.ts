import type { NutrientKey } from "./catalog";
import type { CompositionFoodRecord, CompositionSourceFile, FoodState } from "./composition-types";
import { COMPOSITION_SOURCES } from "./sources";

// Food-composition lookup: find a food by id, match a food name from a meal
// analysis to a food, read a nutrient per 100 g, and turn a household
// measure into grams.
//
// Everything here is deterministic and traceable. The matcher only matches
// names listed as aliases in the source files; it never guesses from
// spelling. A name it doesn't know is "none", and a name that mentions
// several different foods ("rice with dal") is "multiple", so the caller
// can mark the item unknown instead of crediting it all to one food.

export type { CompositionValue, FoodState } from "./composition-types";

export interface CompositionFood extends CompositionFoodRecord {
  sourceId: string;
  sourceName: string;
  sourceVersion: string;
}

/** A nutrient's value in one food. Unknown is not zero. */
export type KnownAmount =
  | { state: "value"; amount: number }
  | { state: "zero" }
  | { state: "trace" }
  | { state: "unknown"; reason?: string };

export interface CompositionIndex {
  foods: CompositionFood[];
  byId: Map<string, CompositionFood>;
  /** Normalized alias -> food, earlier sources first. */
  aliases: Map<string, { food: CompositionFood; approximate: boolean }>;
  maxAliasWords: number;
  /** Source id -> version, for every source in the index. */
  versions: Record<string, string>;
}

export function buildIndex(files: CompositionSourceFile[]): CompositionIndex {
  const foods: CompositionFood[] = [];
  const byId = new Map<string, CompositionFood>();
  const aliases = new Map<string, { food: CompositionFood; approximate: boolean }>();
  const versions: Record<string, string> = {};
  let maxAliasWords = 1;
  for (const file of files) {
    versions[file.source.id] = file.version;
    for (const record of file.foods) {
      const food: CompositionFood = { ...record, sourceId: file.source.id, sourceName: file.source.name, sourceVersion: file.version };
      foods.push(food);
      // The first source to define an id or key keeps it: sources are
      // listed in order of preference.
      if (!byId.has(food.id)) byId.set(food.id, food);
      const scopedKey = `${food.sourceId}:${food.key}`;
      if (!byId.has(scopedKey)) byId.set(scopedKey, food);
      if (!byId.has(food.key)) byId.set(food.key, food);
      for (const raw of food.aliases) {
        const approximate = raw.startsWith("~");
        const alias = normalizeName(raw.replace(/^~/, ""));
        if (!alias || aliases.has(alias)) continue;
        aliases.set(alias, { food, approximate });
        maxAliasWords = Math.max(maxAliasWords, alias.split(" ").length);
      }
    }
  }
  return { foods, byId, aliases, maxAliasWords, versions };
}

let defaultIndex: CompositionIndex | null = null;
export function compositionIndex(): CompositionIndex {
  return (defaultIndex ??= buildIndex(COMPOSITION_SOURCES));
}

export function allFoods(index = compositionIndex()): CompositionFood[] {
  return index.foods;
}

/** By global id ("fdc:168930"), source-scoped key ("usda-fdc:rice_white_cooked")
 * or bare key ("rice_white_cooked", resolved to the preferred source). */
export function getFood(idOrKey: string, index = compositionIndex()): CompositionFood | undefined {
  return index.byId.get(idOrKey);
}

/** The value of one nutrient per 100 g. */
export function nutrientPer100g(food: CompositionFood, key: NutrientKey): KnownAmount {
  const value = food.per100g[key];
  if (value === "trace") return { state: "trace" };
  if (typeof value === "number") return value === 0 ? { state: "zero" } : { state: "value", amount: value };
  const excluded = food.excluded?.[key];
  return excluded ? { state: "unknown", reason: excluded } : { state: "unknown", reason: "not_in_source" };
}

// ─── Name matching ────────────────────────────────────────────────────────

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NUMBER_WORDS = new Set(["a", "an", "one", "two", "three", "four", "five", "six", "half", "quarter"]);

const RAW_WORDS = new Set(["raw", "uncooked", "fresh"]);
const COOKED_WORDS = new Set(["cooked", "boiled", "steamed", "fried", "roasted", "grilled", "baked", "sauteed", "stir"]);

export type MatchResult =
  | { kind: "matched"; food: CompositionFood; alias: string; approximate: boolean; stateMismatch: boolean }
  /** The name mentions several different foods, e.g. "rice with dal". */
  | { kind: "multiple"; foods: CompositionFood[] }
  | { kind: "none" };

function singular(word: string): string[] {
  const out = [word];
  if (word.endsWith("ies") && word.length > 4) out.push(`${word.slice(0, -3)}y`);
  if (word.endsWith("es") && word.length > 3) out.push(word.slice(0, -2));
  if (word.endsWith("s") && word.length > 2) out.push(word.slice(0, -1));
  return out;
}

function lookup(index: CompositionIndex, words: string[]): { alias: string; food: CompositionFood; approximate: boolean } | null {
  const phrase = words.join(" ");
  const exact = index.aliases.get(phrase);
  if (exact) return { alias: phrase, ...exact };
  // Plural of the last word: "rotis", "eggs", "chapatis".
  const last = words[words.length - 1];
  for (const s of singular(last).slice(1)) {
    const alt = [...words.slice(0, -1), s].join(" ");
    const hit = index.aliases.get(alt);
    if (hit) return { alias: alt, ...hit };
  }
  return null;
}

/** The sibling of a food in another state, e.g. lentils_cooked for
 * lentils_raw, from the same source. */
function sibling(food: CompositionFood, state: FoodState, index: CompositionIndex): CompositionFood | undefined {
  const base = food.key.replace(/_(raw|cooked|dry)$/, "");
  const candidates = state === "raw" ? [`${base}_raw`, `${base}_dry`] : [`${base}_cooked`];
  for (const key of candidates) {
    const found = index.byId.get(`${food.sourceId}:${key}`);
    if (found && found.state === state) return found;
  }
  return undefined;
}

/**
 * Matches a food name from a meal analysis to one composition food.
 *
 * The longest alias found in the name wins ("chicken biryani" over
 * "chicken"). If the name contains aliases of two or more different foods
 * that don't overlap ("rice with dal"), the result is "multiple". `state`,
 * or a word like "raw" or "boiled" in the name, picks the raw or cooked
 * sibling where the source has one; otherwise the match is flagged
 * stateMismatch.
 */
export function matchFood(name: string, opts: { state?: "raw" | "cooked" } = {}, index = compositionIndex()): MatchResult {
  const words = normalizeName(name)
    .split(" ")
    .filter((w) => w && !/^\d+(\.\d+)?[a-z]*$/.test(w) && !NUMBER_WORDS.has(w));
  if (words.length === 0) return { kind: "none" };

  type Hit = { start: number; end: number; alias: string; food: CompositionFood; approximate: boolean };
  const hits: Hit[] = [];
  const taken = new Array(words.length).fill(false);
  for (let n = Math.min(index.maxAliasWords, words.length); n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      if (taken.slice(i, i + n).some(Boolean)) continue;
      const hit = lookup(index, words.slice(i, i + n));
      if (hit) {
        hits.push({ start: i, end: i + n, ...hit });
        for (let j = i; j < i + n; j++) taken[j] = true;
      }
    }
  }
  if (hits.length === 0) return { kind: "none" };
  const distinct = [...new Map(hits.map((h) => [h.food.id, h.food])).values()];
  if (distinct.length > 1) return { kind: "multiple", foods: distinct };

  const best = hits.sort((a, b) => b.end - b.start - (a.end - a.start))[0];
  const wanted =
    opts.state ?? (words.some((w) => RAW_WORDS.has(w)) ? "raw" : words.some((w) => COOKED_WORDS.has(w)) ? "cooked" : undefined);
  let food = best.food;
  let stateMismatch = false;
  if (wanted && food.state !== "prepared" && food.state !== wanted) {
    const alt = sibling(food, wanted, index);
    if (alt) food = alt;
    else stateMismatch = true;
  }
  return { kind: "matched", food, alias: best.alias, approximate: best.approximate, stateMismatch };
}

// ─── Household measures ───────────────────────────────────────────────────

const FRACTIONS: Record<string, number> = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3 };
const WORD_NUMBERS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, half: 0.5, quarter: 0.25 };

const UNIT_SYNONYMS: Record<string, string> = {
  cup: "cup",
  cups: "cup",
  tbsp: "tbsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tbs: "tbsp",
  tsp: "tsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  piece: "piece",
  pieces: "piece",
  pc: "piece",
  pcs: "piece",
  slice: "slice",
  slices: "slice",
  large: "large",
  medium: "medium",
  small: "small",
  whole: "whole",
};

const NON_STANDARD_MEASURES = new Set([
  "katori",
  "katoris",
  "bowl",
  "bowls",
  "plate",
  "plates",
  "glass",
  "glasses",
  "serving",
  "servings",
  "handful",
  "handfuls",
  "spoon",
  "spoons",
  "ladle",
  "ladles",
  "portion",
  "portions",
  "scoop",
  "scoops",
  "mug",
  "mugs",
]);

/** Words that count items when the food has a "per item" measure. */
const ITEM_UNITS = ["piece", "medium", "large", "whole", "small", "slice"];

const ML_PER_CUP = 236.588;

function parseAmount(text: string): { amount: number; rest: string } | null {
  const t = text.trim().toLowerCase();
  const mixed = t.match(/^(\d+)\s*([½¼¾⅓⅔])/);
  if (mixed) return { amount: Number(mixed[1]) + FRACTIONS[mixed[2]], rest: t.slice(mixed[0].length) };
  const frac = t.match(/^(\d+)\s*\/\s*(\d+)/);
  if (frac && Number(frac[2]) > 0) return { amount: Number(frac[1]) / Number(frac[2]), rest: t.slice(frac[0].length) };
  const range = t.match(/^(\d+(?:\.\d+)?)\s*(?:-|to|–)\s*(\d+(?:\.\d+)?)/);
  if (range) return { amount: (Number(range[1]) + Number(range[2])) / 2, rest: t.slice(range[0].length) };
  const num = t.match(/^(\d+(?:\.\d+)?)/);
  if (num) return { amount: Number(num[1]), rest: t.slice(num[0].length) };
  const glyph = t.match(/^([½¼¾⅓⅔])/);
  if (glyph) return { amount: FRACTIONS[glyph[1]], rest: t.slice(1) };
  const word = t.match(/^([a-z]+)\b/);
  if (word && word[1] in WORD_NUMBERS) return { amount: WORD_NUMBERS[word[1]], rest: t.slice(word[0].length) };
  return null;
}

function portionUnit(label: string): { amount: number; unit: string } | null {
  const parsed = parseAmount(label);
  if (!parsed) return null;
  const word = parsed.rest.trim().split(/[\s,]+/)[0] ?? "";
  const unit = UNIT_SYNONYMS[word] ?? (word === "fl" ? "fl oz" : word);
  return { amount: parsed.amount, unit };
}

/**
 * Grams for a household measure ("2 rotis", "1 cup", "½ cup", "150 g",
 * "200 ml"), using only the gram weights the composition source gives for
 * this food. Returns null when the measure can't be converted from source
 * data, e.g. "1 katori" (no standard weight) or "1 bowl".
 */
export function portionGrams(food: CompositionFood, quantity: string): number | null {
  const parsed = parseAmount(quantity);
  if (!parsed || !(parsed.amount > 0)) return null;
  const rest = normalizeName(parsed.rest);
  const word = rest.split(" ")[0] ?? "";

  if (word === "g" || word === "gm" || word === "gms" || word === "gram" || word === "grams") return parsed.amount;
  if (word === "kg") return parsed.amount * 1000;

  const portions = (food.portions ?? []).map((p) => ({ ...p, unit: portionUnit(p.label) })).filter((p) => p.unit && p.unit.amount > 0);
  const perUnit = (unit: string) => {
    const p = portions.find((x) => x.unit!.unit === unit);
    return p ? p.grams / p.unit!.amount : null;
  };

  if (word === "ml" || word === "millilitre" || word === "milliliter" || word === "milliliters" || word === "millilitres") {
    // Density from the source's own cup weight; no cup weight, no conversion.
    const cup = perUnit("cup");
    return cup == null ? null : (parsed.amount * cup) / ML_PER_CUP;
  }

  // Containers with no standard size: a katori, bowl or glass varies by
  // household, so there's no source weight to use.
  if (NON_STANDARD_MEASURES.has(word)) return null;

  const unit = UNIT_SYNONYMS[word];
  if (unit) {
    const grams = perUnit(unit);
    if (grams != null) return parsed.amount * grams;
    if (!ITEM_UNITS.includes(unit)) return null;
  }
  // "2 rotis", "3 eggs": count items with the food's per-item measure.
  for (const u of ITEM_UNITS) {
    const grams = perUnit(u);
    if (grams != null) return parsed.amount * grams;
  }
  return null;
}
