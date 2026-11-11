import type { NutrientKey } from "./catalog";

// The shape every food-composition source file has, whatever it came from
// (USDA FoodData Central, IFCT 2017, a confirmed product label). Generated
// by the scripts in scripts/nutrients/, never written by hand.

/** A value per 100 g of edible portion. "trace" where the source says a
 * nutrient is present below its reporting limit. A nutrient the source has
 * no value for is simply absent from per100g: absent means unknown, never 0. */
export type CompositionValue = number | "trace";

export type FoodState = "raw" | "cooked" | "prepared";

export interface CompositionFoodRecord {
  /** Stable within the source, e.g. "rice_white_cooked". */
  key: string;
  /** Globally unique, e.g. "fdc:168930" or "ifct:A015". */
  id: string;
  /** The source's own identifier, kept for traceability. */
  fdcId?: number;
  sourceCode?: string;
  /** Which dataset within the source, e.g. "sr_legacy", "fndds". */
  dataset: string;
  description: string;
  state: FoodState;
  group: string;
  /** Lowercase names a meal analysis might use. A leading "~" marks a dish
   * name matched to its main ingredient only (e.g. "~aloo gobi" to boiled
   * cauliflower): the match is kept but flagged as approximate. */
  aliases: string[];
  per100g: Partial<Record<NutrientKey, CompositionValue>>;
  /** Values computed from other values in the source, e.g. vitamin D µg
   * from IU. */
  derived?: string[];
  /** Values deliberately dropped, with why: e.g. "us_enrichment" for iron
   * and folate added to US grain that Indian grain usually lacks. */
  excluded?: Partial<Record<NutrientKey, string>>;
  /** Alternatives chosen by a confirmed fact, e.g. { fortified: "milk_whole_fortified" }. */
  variants?: Record<string, string>;
  /** Household measures with their gram weights, from the source. */
  portions?: Array<{ label: string; grams: number }>;
}

export interface CompositionSourceFile {
  source: {
    id: string;
    name: string;
    licence: string;
    url: string;
    datasets: Array<{ id: string; release: string; label: string }>;
  };
  /** Changes whenever the generated data changes. Stored with every meal
   * estimate, so an estimate can be traced to the data it used. */
  version: string;
  builtBy: string;
  foods: CompositionFoodRecord[];
}
