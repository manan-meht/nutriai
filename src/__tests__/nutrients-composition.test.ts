// The nutrient catalog, the bundled USDA FoodData Central subset, and the
// food-name matcher every micronutrient estimate starts from. The rules
// under test are the ones a composition layer most easily breaks: a value
// the source doesn't have stays unknown (never 0), a real 0 stays 0, units
// and forms are converted only where the conversion is documented, and a
// name naming two foods is not credited to one.

import { readFileSync } from "fs";
import path from "path";

import {
  ALL_NUTRIENT_KEYS,
  folateDFE,
  MICRO_KEYS,
  NUTRIENTS,
  toCanonical,
  vitaminDMicrogramsFromIU,
} from "@/lib/nutrients/catalog";
import {
  buildIndex,
  getFood,
  matchFood,
  normalizeName,
  nutrientPer100g,
  portionGrams,
  type CompositionFood,
} from "@/lib/nutrients/composition";
import type { CompositionSourceFile } from "@/lib/nutrients/composition-types";
import { COMPOSITION_SOURCES } from "@/lib/nutrients/sources";

const food = (key: string): CompositionFood => {
  const f = getFood(key);
  if (!f) throw new Error(`no food ${key}`);
  return f;
};

describe("catalog", () => {
  it("has one canonical unit per nutrient, with forms tracked separately", () => {
    expect(NUTRIENTS.folate.unitLabel).toBe("µg DFE");
    expect(NUTRIENTS.vitamin_a.unitLabel).toBe("µg RAE");
    expect(NUTRIENTS.vitamin_d.unit).toBe("µg");
    expect(NUTRIENTS.retinol.kind).toBe("form");
    expect(NUTRIENTS.folic_acid.kind).toBe("form");
    expect(MICRO_KEYS).toEqual(
      expect.arrayContaining(["calcium", "iron", "magnesium", "potassium", "zinc", "folate", "vitamin_a", "vitamin_b12", "vitamin_c", "vitamin_d"])
    );
  });

  it("converts vitamin D IU to µg and folic acid to DFE", () => {
    expect(vitaminDMicrogramsFromIU(400)).toBe(10);
    expect(folateDFE(100, 100)).toBe(270);
    expect(toCanonical("vitamin_d", 1000, "IU")).toEqual({ ok: true, key: "vitamin_d", amount: 25 });
    expect(toCanonical("folate", 400, "µg", { folateForm: "folic_acid" })).toEqual({ ok: true, key: "folate", amount: 680 });
    expect(toCanonical("folate", 400, "µg DFE")).toEqual({ ok: true, key: "folate", amount: 400 });
  });

  it("refuses conversions that need information the input doesn't carry", () => {
    expect(toCanonical("vitamin_a", 5000, "IU")).toMatchObject({ ok: false });
    expect(toCanonical("folate", 400, "µg")).toMatchObject({ ok: false });
    expect(toCanonical("calcium", 10, "IU")).toMatchObject({ ok: false });
  });

  it("scales g, mg and µg exactly", () => {
    expect(toCanonical("calcium", 0.1, "g")).toEqual({ ok: true, key: "calcium", amount: 100 });
    expect(toCanonical("vitamin_b12", 0.0025, "mg")).toEqual({ ok: true, key: "vitamin_b12", amount: 2.5 });
    expect(toCanonical("zinc", 1500, "mcg")).toEqual({ ok: true, key: "zinc", amount: 1.5 });
    expect(toCanonical("energy", 418.4, "kJ")).toEqual({ ok: true, key: "energy", amount: 100 });
  });
});

describe("USDA FoodData Central subset", () => {
  const file = COMPOSITION_SOURCES[0];

  it("is public-domain USDA data with its releases recorded", () => {
    expect(file.source.id).toBe("usda-fdc");
    expect(file.source.licence).toMatch(/CC0/);
    expect(file.source.datasets.map((d) => d.release)).toEqual(["2018-04", "2024-10-31"]);
    expect(file.version).toMatch(/^usda-fdc-subset-/);
  });

  it("stays small enough to ship in the Worker", () => {
    const bytes = readFileSync(path.join(process.cwd(), "data/food-composition/usda-fdc-subset.json")).length;
    expect(bytes).toBeLessThan(300_000);
    expect(file.foods.length).toBeGreaterThanOrEqual(150);
  });

  it("only uses keys from the catalog, and never stores a missing value as a number", () => {
    for (const f of file.foods) {
      for (const [k, v] of Object.entries(f.per100g)) {
        expect(ALL_NUTRIENT_KEYS).toContain(k);
        expect(v === "trace" || (typeof v === "number" && v >= 0)).toBe(true);
      }
      for (const k of Object.keys(f.excluded ?? {})) expect(f.per100g).not.toHaveProperty(k);
    }
  });

  it("keeps a nutrient the source didn't measure as unknown, and a measured 0 as zero", () => {
    // SR Legacy has no iodine for cooked white rice; it has vitamin C = 0.
    expect(nutrientPer100g(food("rice_white_cooked"), "iodine")).toEqual({ state: "unknown", reason: "not_in_source" });
    expect(nutrientPer100g(food("rice_white_cooked"), "vitamin_c")).toEqual({ state: "zero" });
    expect(nutrientPer100g(food("milk_whole"), "calcium")).toEqual({ state: "value", amount: 113 });
  });

  it("drops US enrichment and fortification rather than crediting it to Indian food", () => {
    // USDA's biryani recipe uses enriched rice; its iron and folate are left unknown.
    expect(nutrientPer100g(food("biryani_chicken"), "iron")).toEqual({ state: "unknown", reason: "us_enrichment" });
    expect(nutrientPer100g(food("tea_with_milk"), "vitamin_d")).toEqual({ state: "unknown", reason: "us_fortified_milk" });
    // Unfortified milk is the default; the fortified variant is linked for a confirmed fact.
    expect(food("milk_whole").variants).toEqual({ fortified: "milk_whole_fortified" });
    const plain = nutrientPer100g(food("milk_whole"), "vitamin_d");
    const fortified = nutrientPer100g(food("milk_whole_fortified"), "vitamin_d");
    expect(plain.state === "value" && fortified.state === "value" && fortified.amount > plain.amount).toBe(true);
  });

  it("has no iodine values to speak of: it stays unknown", () => {
    expect(file.foods.filter((f) => f.per100g.iodine != null).length).toBe(0);
  });
});

describe("matchFood", () => {
  const matched = (name: string, opts?: { state?: "raw" | "cooked" }) => {
    const m = matchFood(name, opts);
    return m.kind === "matched" ? m.food.key : m.kind;
  };

  it("matches English and Indian names to the same food", () => {
    for (const n of ["roti", "Chapati", "2 phulkas", "rotis"]) expect(matched(n)).toBe("chapati_whole_wheat");
    for (const n of ["dal", "Daal", "dal tadka", "Toor Dal"]) expect(matched(n)).toBe("dal");
    for (const n of ["curd", "dahi", "plain yogurt"]) expect(matched(n)).toBe("yogurt_whole");
    for (const n of ["bhindi", "okra", "Lady finger"]) expect(matched(n)).toBe("okra_cooked");
    expect(matched("paneer")).toBe("paneer");
  });

  it("prefers the longest name: chicken biryani is not plain chicken", () => {
    expect(matched("Chicken biryani")).toBe("biryani_chicken");
    expect(matched("chicken")).toBe("chicken_breast_cooked");
  });

  it("respects raw and cooked", () => {
    expect(matched("spinach")).toBe("spinach_cooked");
    expect(matched("raw spinach")).toBe("spinach_raw");
    expect(matched("spinach", { state: "raw" })).toBe("spinach_raw");
    expect(matched("lentils", { state: "raw" })).toBe("lentils_raw");
    expect(matched("chickpeas", { state: "raw" })).toBe("chickpeas_raw");
  });

  it("flags a raw/cooked mismatch it can't resolve", () => {
    const m = matchFood("raw paneer");
    expect(m.kind).toBe("matched");
    // Paneer is a prepared food: no state switch, no mismatch.
    expect(m.kind === "matched" && m.stateMismatch).toBe(false);
    const banana = matchFood("boiled banana");
    expect(banana.kind === "matched" && banana.stateMismatch).toBe(true);
  });

  it("flags dishes matched only to their main ingredient", () => {
    const m = matchFood("aloo gobi");
    expect(m).toMatchObject({ kind: "matched", approximate: true });
    expect(m.kind === "matched" && m.food.key).toBe("cauliflower_cooked");
    expect(matchFood("cauliflower")).toMatchObject({ kind: "matched", approximate: false });
  });

  it("doesn't credit a name that mentions two foods to either one", () => {
    expect(matched("rice with dal")).toBe("multiple");
    expect(matched("egg fried rice")).toBe("multiple");
  });

  it("returns none for names it doesn't know, rather than guessing", () => {
    expect(matched("mystery casserole")).toBe("none");
    expect(matched("")).toBe("none");
  });

  it("normalizes punctuation and accents", () => {
    expect(normalizeName("Bull’s-Eye  (Egg)")).toBe("bulls eye egg");
  });
});

describe("portionGrams", () => {
  it("uses the source's own household measures", () => {
    expect(portionGrams(food("rice_white_cooked"), "1 cup")).toBe(158);
    expect(portionGrams(food("rice_white_cooked"), "½ cup")).toBe(79);
    expect(portionGrams(food("rice_white_cooked"), "1/2 cup")).toBe(79);
    expect(portionGrams(food("chapati_whole_wheat"), "2 rotis")).toBe(86);
    expect(portionGrams(food("egg_boiled"), "2 eggs")).toBe(100);
  });

  it("takes grams as given and converts ml with the source's cup weight", () => {
    expect(portionGrams(food("dal"), "150 g")).toBe(150);
    expect(portionGrams(food("dal"), "150g")).toBe(150);
    expect(portionGrams(food("milk_whole"), "200 ml")).toBeCloseTo((200 * 244) / 236.588, 5);
  });

  it("won't convert containers with no standard size", () => {
    expect(portionGrams(food("dal"), "1 katori")).toBeNull();
    expect(portionGrams(food("egg_boiled"), "1 bowl")).toBeNull();
    expect(portionGrams(food("rice_white_cooked"), "a plate")).toBeNull();
    expect(portionGrams(food("dal"), "some")).toBeNull();
  });
});

describe("source registry", () => {
  const fake = (id: string, key: string, aliases: string[], calcium: number): CompositionSourceFile => ({
    source: { id, name: id, licence: "test", url: "", datasets: [] },
    version: `${id}-v1`,
    builtBy: "test",
    foods: [{ key, id: `${id}:${key}`, dataset: "test", description: key, state: "prepared", group: "test", aliases, per100g: { calcium } }],
  });

  it("prefers the earlier source when two know the same name (IFCT before USDA)", () => {
    const index = buildIndex([fake("ifct", "dal", ["dal"], 1), fake("usda-fdc", "dal", ["dal"], 2)]);
    const m = matchFood("dal", {}, index);
    expect(m.kind === "matched" && m.food.sourceId).toBe("ifct");
    expect(getFood("dal", index)?.sourceId).toBe("ifct");
    expect(getFood("usda-fdc:dal", index)?.sourceId).toBe("usda-fdc");
    expect(index.versions).toEqual({ ifct: "ifct-v1", "usda-fdc": "usda-fdc-v1" });
  });
});
