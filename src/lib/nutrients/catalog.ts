// The nutrients Tistra estimates, each with one stable key and one canonical
// unit. Every composition source, reference table, meal estimate and screen
// uses these keys and units, so a value never needs converting after it has
// been stored.
//
// Forms matter. Some nutrients come in forms that are not interchangeable,
// and the upper limits (ULs) apply to particular forms only:
//
//   - Vitamin A is counted as retinol activity equivalents (µg RAE). The
//     UL applies to preformed vitamin A (retinol) only, so retinol is
//     tracked as its own key. Vitamin A in IU is never converted, because
//     the factor depends on the form (retinol vs beta-carotene), which IU
//     alone doesn't say.
//   - Folate is counted as dietary folate equivalents (µg DFE): food folate
//     + 1.7 x folic acid. The UL applies to synthetic folic acid only, so
//     folic acid is tracked as its own key. "Total folate" in µg is not DFE
//     and is never treated as such.
//   - Vitamin D is counted in µg. 1 µg = 40 IU.
//
// Iodine is listed but almost always unknown: it depends on the salt used,
// which a photo can't show, and on products whose labels Tistra hasn't
// read. It stays unknown unless product information supports a value.

export const CATALOG_VERSION = "nutrient-catalog-v1";

export const MACRO_KEYS = ["energy", "protein", "carbs", "fat", "fiber"] as const;
export const MICRO_KEYS = [
  "calcium",
  "iron",
  "magnesium",
  "potassium",
  "zinc",
  "folate",
  "vitamin_a",
  "vitamin_b12",
  "vitamin_c",
  "vitamin_d",
  "iodine",
] as const;
/** Forms tracked only so the upper limits that apply to them can be checked. */
export const FORM_KEYS = ["retinol", "folic_acid"] as const;

export type MacroKey = (typeof MACRO_KEYS)[number];
export type MicroKey = (typeof MICRO_KEYS)[number];
export type FormKey = (typeof FORM_KEYS)[number];
export type NutrientKey = MacroKey | MicroKey | FormKey;

export const ALL_NUTRIENT_KEYS: readonly NutrientKey[] = [...MACRO_KEYS, ...MICRO_KEYS, ...FORM_KEYS];

export type CanonicalUnit = "kcal" | "g" | "mg" | "µg";

export interface NutrientDefinition {
  key: NutrientKey;
  label: string;
  unit: CanonicalUnit;
  /** How the unit is written on screen, e.g. "µg DFE". */
  unitLabel: string;
  kind: "macro" | "micro" | "form";
  /** What the value counts, where the unit alone doesn't say. */
  basis?: string;
}

export const NUTRIENTS: Record<NutrientKey, NutrientDefinition> = {
  energy: { key: "energy", label: "Energy", unit: "kcal", unitLabel: "kcal", kind: "macro" },
  protein: { key: "protein", label: "Protein", unit: "g", unitLabel: "g", kind: "macro" },
  carbs: { key: "carbs", label: "Carbs", unit: "g", unitLabel: "g", kind: "macro", basis: "carbohydrate by difference" },
  fat: { key: "fat", label: "Fat", unit: "g", unitLabel: "g", kind: "macro" },
  fiber: { key: "fiber", label: "Fibre", unit: "g", unitLabel: "g", kind: "macro", basis: "total dietary fibre" },
  calcium: { key: "calcium", label: "Calcium", unit: "mg", unitLabel: "mg", kind: "micro" },
  iron: { key: "iron", label: "Iron", unit: "mg", unitLabel: "mg", kind: "micro" },
  magnesium: { key: "magnesium", label: "Magnesium", unit: "mg", unitLabel: "mg", kind: "micro" },
  potassium: { key: "potassium", label: "Potassium", unit: "mg", unitLabel: "mg", kind: "micro" },
  zinc: { key: "zinc", label: "Zinc", unit: "mg", unitLabel: "mg", kind: "micro" },
  folate: { key: "folate", label: "Folate", unit: "µg", unitLabel: "µg DFE", kind: "micro", basis: "dietary folate equivalents" },
  vitamin_a: { key: "vitamin_a", label: "Vitamin A", unit: "µg", unitLabel: "µg RAE", kind: "micro", basis: "retinol activity equivalents" },
  vitamin_b12: { key: "vitamin_b12", label: "Vitamin B12", unit: "µg", unitLabel: "µg", kind: "micro" },
  vitamin_c: { key: "vitamin_c", label: "Vitamin C", unit: "mg", unitLabel: "mg", kind: "micro" },
  vitamin_d: { key: "vitamin_d", label: "Vitamin D", unit: "µg", unitLabel: "µg", kind: "micro", basis: "D2 + D3" },
  iodine: { key: "iodine", label: "Iodine", unit: "µg", unitLabel: "µg", kind: "micro" },
  retinol: { key: "retinol", label: "Preformed vitamin A (retinol)", unit: "µg", unitLabel: "µg", kind: "form" },
  folic_acid: { key: "folic_acid", label: "Folic acid", unit: "µg", unitLabel: "µg", kind: "form" },
};

export function isNutrientKey(value: unknown): value is NutrientKey {
  return typeof value === "string" && (ALL_NUTRIENT_KEYS as readonly string[]).includes(value);
}

/** 1 µg of vitamin D = 40 IU. */
export function vitaminDMicrogramsFromIU(iu: number): number {
  return iu / 40;
}

/** NASEM: 1 µg DFE = 1 µg food folate = 0.6 µg folic acid taken with food,
 * so folic acid counts 1.7 times (1 / 0.6, rounded as NASEM does). Folic
 * acid taken on an empty stomach counts 2 times; we use the with-food
 * factor, which never overstates intake relative to it. */
export const FOLIC_ACID_DFE_FACTOR = 1.7;

export function folateDFE(foodFolateUg: number, folicAcidUg: number): number {
  return foodFolateUg + FOLIC_ACID_DFE_FACTOR * folicAcidUg;
}

/** Units a person or a product label might state a value in. */
export type InputUnit = "kcal" | "kJ" | "g" | "mg" | "µg" | "ug" | "mcg" | "IU" | "µg DFE" | "µg RAE";

export type Conversion = { ok: true; key: NutrientKey; amount: number } | { ok: false; reason: string };

/**
 * Converts a stated amount into the canonical unit for its nutrient, or
 * says why it can't. Used for product labels and supplements, where values
 * arrive in whatever unit the label uses.
 *
 * Deliberately refuses conversions that would need information the input
 * doesn't carry: vitamin A in IU (form unknown), and a folate amount that
 * doesn't say whether it is DFE or folic acid.
 */
export function toCanonical(key: NutrientKey, amount: number, unit: InputUnit, opts: { folateForm?: "dfe" | "folic_acid" | "food_folate" } = {}): Conversion {
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, reason: "not a valid amount" };
  const u = unit === "ug" || unit === "mcg" ? "µg" : unit;
  const target = NUTRIENTS[key].unit;

  if (key === "vitamin_a" || key === "retinol") {
    if (u === "IU") return { ok: false, reason: "vitamin A in IU can't be converted without knowing its form" };
    if (u === "µg RAE" || u === "µg") return { ok: true, key, amount };
    if (u === "mg") return { ok: true, key, amount: amount * 1000 };
    return { ok: false, reason: `unit ${unit} doesn't apply to vitamin A` };
  }
  if (key === "vitamin_d") {
    if (u === "IU") return { ok: true, key, amount: vitaminDMicrogramsFromIU(amount) };
    if (u === "µg") return { ok: true, key, amount };
    if (u === "mg") return { ok: true, key, amount: amount * 1000 };
    return { ok: false, reason: `unit ${unit} doesn't apply to vitamin D` };
  }
  if (key === "folate" || key === "folic_acid") {
    const micrograms = u === "mg" ? amount * 1000 : u === "µg" || u === "µg DFE" ? amount : null;
    if (micrograms == null) return { ok: false, reason: `unit ${unit} doesn't apply to folate` };
    if (key === "folic_acid") return { ok: true, key, amount: micrograms };
    const form = u === "µg DFE" ? "dfe" : opts.folateForm;
    if (form === "dfe") return { ok: true, key, amount: micrograms };
    if (form === "food_folate") return { ok: true, key, amount: micrograms };
    if (form === "folic_acid") return { ok: true, key, amount: FOLIC_ACID_DFE_FACTOR * micrograms };
    return { ok: false, reason: "folate amount doesn't say whether it is DFE, food folate or folic acid" };
  }
  if (key === "energy") {
    if (u === "kcal") return { ok: true, key, amount };
    if (u === "kJ") return { ok: true, key, amount: Math.round((amount / 4.184) * 1e6) / 1e6 };
    return { ok: false, reason: `unit ${unit} doesn't apply to energy` };
  }
  if (u === "IU" || u === "µg DFE" || u === "µg RAE" || u === "kcal" || u === "kJ") {
    return { ok: false, reason: `unit ${unit} doesn't apply to ${NUTRIENTS[key].label}` };
  }
  // Scale by powers of 1000 between g, mg and µg.
  const exponent = { g: 0, mg: 1, µg: 2 } as const;
  const from = exponent[u as "g" | "mg" | "µg"];
  const to = exponent[target as "g" | "mg" | "µg"];
  const converted = amount * Math.pow(1000, to - from);
  return { ok: true, key, amount: Math.round(converted * 1e6) / 1e6 };
}
