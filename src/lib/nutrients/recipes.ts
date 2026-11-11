import { normalizeName } from "./composition";

// Standard recipes for common mixed dishes that the composition data has no
// single entry for. Used only when the meal analysis didn't break the dish
// into ingredients itself.
//
// These are INFERRED, not measured. They're Tistra's estimate of a typical
// home preparation, written by engineering and NOT reviewed by a nutrition
// professional. Every estimate that uses one is marked "standard recipe,
// unreviewed", so the screens can say so. Fractions are shares of the
// finished dish's weight and sum to 1. Each ingredient names a food in the
// composition data.
//
// Deliberately small. A dish that isn't here and wasn't broken down by the
// analysis stays unknown, which is better than a recipe nobody checked
// being stretched over dishes it doesn't describe.

export const RECIPES_VERSION = "standard-recipes-v1-unreviewed";

export interface StandardRecipe {
  id: string;
  label: string;
  aliases: string[];
  ingredients: Array<{ food: string; fraction: number }>;
  reviewed: false;
}

export const STANDARD_RECIPES: StandardRecipe[] = [
  {
    id: "dal_rice",
    label: "Dal with rice",
    aliases: ["dal rice", "dal chawal", "rice with dal", "dal with rice", "rice and dal", "dal and rice"],
    ingredients: [
      { food: "rice_white_cooked", fraction: 0.55 },
      { food: "dal", fraction: 0.45 },
    ],
    reviewed: false,
  },
  {
    id: "rajma_rice",
    label: "Rajma with rice",
    aliases: ["rajma chawal", "rajma rice", "rice with rajma", "rajma with rice"],
    ingredients: [
      { food: "rice_white_cooked", fraction: 0.55 },
      { food: "rajma", fraction: 0.45 },
    ],
    reviewed: false,
  },
  {
    id: "chole_rice",
    label: "Chole with rice",
    aliases: ["chole chawal", "chole rice", "chana rice"],
    ingredients: [
      { food: "rice_white_cooked", fraction: 0.55 },
      { food: "chole", fraction: 0.45 },
    ],
    reviewed: false,
  },
  {
    id: "curd_rice",
    label: "Curd rice",
    aliases: ["curd rice", "dahi chawal", "thayir sadam", "mosaru anna"],
    ingredients: [
      { food: "rice_white_cooked", fraction: 0.6 },
      { food: "yogurt_whole", fraction: 0.4 },
    ],
    reviewed: false,
  },
  {
    id: "khichdi",
    label: "Khichdi",
    aliases: ["khichdi", "khichri", "kichdi", "moong dal khichdi", "dal khichdi"],
    ingredients: [
      { food: "rice_white_cooked", fraction: 0.55 },
      { food: "mung_cooked", fraction: 0.4 },
      { food: "ghee", fraction: 0.02 },
      { food: "onion_raw", fraction: 0.03 },
    ],
    reviewed: false,
  },
  {
    id: "egg_curry",
    label: "Egg curry",
    aliases: ["egg curry", "anda curry", "egg masala"],
    ingredients: [
      { food: "egg_boiled", fraction: 0.45 },
      { food: "onion_raw", fraction: 0.2 },
      { food: "tomato_raw", fraction: 0.3 },
      { food: "oil_sunflower", fraction: 0.05 },
    ],
    reviewed: false,
  },
  {
    id: "kadhi",
    label: "Kadhi",
    aliases: ["kadhi", "kadhi pakora", "punjabi kadhi", "gujarati kadhi"],
    ingredients: [
      { food: "yogurt_whole", fraction: 0.85 },
      { food: "besan", fraction: 0.1 },
      { food: "oil_sunflower", fraction: 0.05 },
    ],
    reviewed: false,
  },
  {
    id: "aloo_matar",
    label: "Aloo matar",
    aliases: ["aloo matar", "aloo mutter", "matar aloo"],
    ingredients: [
      { food: "potato_boiled", fraction: 0.5 },
      { food: "peas_green_cooked", fraction: 0.3 },
      { food: "tomato_raw", fraction: 0.15 },
      { food: "oil_sunflower", fraction: 0.05 },
    ],
    reviewed: false,
  },
  {
    id: "matar_paneer",
    label: "Matar paneer",
    aliases: ["matar paneer", "mutter paneer", "paneer matar"],
    ingredients: [
      { food: "paneer", fraction: 0.35 },
      { food: "peas_green_cooked", fraction: 0.3 },
      { food: "tomato_raw", fraction: 0.25 },
      { food: "oil_sunflower", fraction: 0.05 },
      { food: "onion_raw", fraction: 0.05 },
    ],
    reviewed: false,
  },
  {
    id: "vegetable_sandwich",
    label: "Vegetable sandwich",
    aliases: ["veg sandwich", "vegetable sandwich"],
    ingredients: [
      { food: "bread_white", fraction: 0.6 },
      { food: "cucumber_raw", fraction: 0.15 },
      { food: "tomato_raw", fraction: 0.15 },
      { food: "butter", fraction: 0.1 },
    ],
    reviewed: false,
  },
];

const BY_ALIAS = new Map<string, StandardRecipe>();
for (const recipe of STANDARD_RECIPES) {
  for (const alias of recipe.aliases) BY_ALIAS.set(normalizeName(alias), recipe);
}

/** The standard recipe for a dish name, matched on the whole name only. */
export function findRecipe(name: string): StandardRecipe | null {
  const n = normalizeName(name)
    .split(" ")
    .filter((w) => w && !/^\d/.test(w))
    .join(" ");
  return BY_ALIAS.get(n) ?? null;
}
