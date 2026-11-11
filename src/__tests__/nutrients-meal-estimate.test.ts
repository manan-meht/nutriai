// One meal's vitamin and mineral estimate (src/lib/nutrients/meal-estimate.ts).
// What must hold: unknown never becomes 0, a meal with an unweighed or
// unmatched item is partial (a floor), recipes and ingredient breakdowns
// are marked inferred, fortification is applied only when confirmed, and
// household defaults never reach a meal eaten outside.

import { getFood, nutrientPer100g } from "@/lib/nutrients/composition";
import type { ConfirmedProduct } from "@/lib/nutrients/facts";
import { estimateInputHash, estimateMeal, parseGramsText, sumComponents, type AnalyzedFoodInput } from "@/lib/nutrients/meal-estimate";

const per100 = (key: string, nutrient: Parameters<typeof nutrientPer100g>[1]) => {
  const v = nutrientPer100g(getFood(key)!, nutrient);
  if (v.state !== "value") throw new Error(`${key} ${nutrient} is ${v.state}`);
  return v.amount;
};

const food = (name: string, grams?: string, extra: Partial<AnalyzedFoodInput> = {}): AnalyzedFoodInput => ({
  name,
  quantity: "1 serving",
  ...(grams ? { estimated_cooked_weight_grams: grams } : {}),
  ...extra,
});

describe("parseGramsText", () => {
  it("reads the analyzer's weight strings", () => {
    expect(parseGramsText("45-75g")).toBe(60);
    expect(parseGramsText("about 150 g")).toBe(150);
    expect(parseGramsText("1.2 kg")).toBe(1200);
    expect(parseGramsText("100 to 140 grams")).toBe(120);
  });
  it("won't read a count as a weight", () => {
    expect(parseGramsText("2-3 pieces")).toBeNull();
    expect(parseGramsText("")).toBeNull();
    expect(parseGramsText(undefined)).toBeNull();
  });
});

describe("estimateMeal", () => {
  it("calculates from composition data: grams x per-100 g value", () => {
    const e = estimateMeal({ foods: [food("Dal", "200g")] });
    expect(e.nutrients.iron).toEqual({ state: "value", amount: Math.round(per100("dal", "iron") * 2 * 1000) / 1000, coverage: 1 });
    expect(e.items[0]).toMatchObject({ origin: "matched", gramsBasis: "analysis_cooked_weight", grams: 200 });
    expect(e.items[0].components[0].food).toMatchObject({ sourceId: "usda-fdc", dataset: "fndds", key: "dal" });
    expect(e.items[0].reasons).toContain("portion_estimated_from_photo");
    expect(e.compositionVersions["usda-fdc"]).toMatch(/^usda-fdc-subset-/);
  });

  it("keeps a nutrient the source doesn't have as unknown, never 0", () => {
    // No iodine anywhere in the USDA subset.
    const e = estimateMeal({ foods: [food("Dal", "200g"), food("Rice", "150g")] });
    expect(e.nutrients.iodine).toEqual({ state: "unknown", amount: null, coverage: 0 });
  });

  it("keeps a measured zero as zero", () => {
    // Cooked white rice: vitamin C measured 0 in SR Legacy.
    const e = estimateMeal({ foods: [food("Rice", "150g")] });
    expect(e.nutrients.vitamin_c).toEqual({ state: "zero", amount: 0, coverage: 1 });
  });

  it("makes the meal partial (a floor) when an item can't be matched", () => {
    const e = estimateMeal({ foods: [food("Dal", "200g"), food("Mystery casserole", "200g")] });
    expect(e.nutrients.iron.state).toBe("partial");
    expect(e.nutrients.iron.coverage).toBe(0.5);
    expect(e.nutrients.iron.amount).toBeCloseTo(per100("dal", "iron") * 2, 3);
    expect(e.status).toBe("partial");
    expect(e.items[1]).toMatchObject({ origin: "unmatched" });
    expect(e.reasons).toContain("not_in_composition_data");
  });

  it("makes the meal partial when an item has no weight at all", () => {
    const e = estimateMeal({ foods: [food("Dal", "200g"), { name: "Rice", quantity: "1 plate" }] });
    expect(e.items[1]).toMatchObject({ grams: null, gramsBasis: "unknown" });
    expect(e.nutrients.calcium.state).toBe("partial");
    expect(e.reasons).toContain("portion_unknown");
  });

  it("is unknown when nothing could be matched", () => {
    const e = estimateMeal({ foods: [food("Mystery casserole", "300g")] });
    expect(e.status).toBe("unknown");
    expect(e.nutrients.calcium.state).toBe("unknown");
  });

  it("uses household measures from the source when there's no weight", () => {
    const e = estimateMeal({ foods: [{ name: "Roti", quantity: "2 rotis" }] });
    expect(e.items[0]).toMatchObject({ grams: 86, gramsBasis: "household_measure" });
    expect(e.items[0].reasons).toContain("portion_from_household_measure");
  });

  it("prefers the analyzer's edible weight, then egg count", () => {
    const chicken = estimateMeal({ foods: [food("Grilled chicken", "100-200g", { estimated_edible_weight_grams_min: 80, estimated_edible_weight_grams_max: 120 })] });
    expect(chicken.items[0]).toMatchObject({ grams: 100, gramsBasis: "analysis_edible_weight" });
    const eggs = estimateMeal({ foods: [{ name: "Boiled eggs", quantity: "2", egg_count_min: 2, egg_count_max: 2 }] });
    expect(eggs.items[0]).toMatchObject({ grams: 100, gramsBasis: "analysis_egg_count" });
  });

  it("splits a known mixed dish with a standard recipe, marked unreviewed", () => {
    const e = estimateMeal({ foods: [food("Dal chawal", "400g")] });
    expect(e.items[0]).toMatchObject({ origin: "inferred", recipe: { source: "standard_recipe", id: "dal_rice", reviewed: false } });
    expect(e.items[0].components.map((c) => [c.food?.key, c.grams])).toEqual([
      ["rice_white_cooked", 220],
      ["dal", 180],
    ]);
    expect(e.reasons).toContain("standard_recipe_unreviewed");
  });

  it("uses the analyzer's own ingredient breakdown first, marked inferred", () => {
    const e = estimateMeal({
      foods: [
        food("Chana masala", "250g", {
          ingredients: [
            { name: "chickpeas", grams: 180, state: "cooked" },
            { name: "onion", grams: 40 },
            { name: "tomato", grams: 30 },
          ],
        }),
      ],
    });
    expect(e.items[0]).toMatchObject({ origin: "inferred", recipe: { source: "analysis", reviewed: false }, gramsBasis: "ingredients", grams: 250 });
    expect(e.items[0].components.map((c) => c.food?.key)).toEqual(["chickpeas_cooked", "onion_raw", "tomato_raw"]);
    expect(e.reasons).toContain("ingredients_inferred_by_analysis");
  });

  it("doesn't credit a two-food name to one food", () => {
    const e = estimateMeal({ foods: [food("Rice with rajma and salad", "300g")] });
    expect(e.items[0].origin).toBe("unmatched");
    expect(e.items[0].reasons).toContain("several_foods_in_one_item");
  });

  it("flags a dish matched only to its main ingredient", () => {
    const e = estimateMeal({ foods: [food("Prawn curry", "200g")] });
    expect(e.items[0].components[0].approximate).toBe(true);
    expect(e.items[0].reasons).toContain("dish_matched_to_main_ingredient");
  });

  it("records US enrichment it dropped", () => {
    const e = estimateMeal({ foods: [food("Chicken biryani", "300g")] });
    expect(e.nutrients.iron.state).toBe("unknown");
    expect(e.reasons).toContain("us_values_excluded");
  });

  describe("milk fortification", () => {
    const milk = [food("Milk", "240g")];

    it("treats vitamin D from milk as a floor while fortification is unknown", () => {
      const e = estimateMeal({ foods: milk });
      expect(e.nutrients.vitamin_d.state).toBe("partial");
      expect(e.nutrients.calcium.state).toBe("value");
      expect(e.reasons).toContain("milk_fortification_unknown");
    });

    it("uses the fortified variant when the household says so", () => {
      const e = estimateMeal({ foods: milk, household: { milk_fortified: "yes" } });
      expect(e.nutrients.vitamin_d).toMatchObject({ state: "value" });
      expect(e.nutrients.vitamin_d.amount).toBeCloseTo(per100("milk_whole_fortified", "vitamin_d") * 2.4, 3);
      expect(e.items[0].components[0].food?.key).toBe("milk_whole_fortified");
      expect(e.reasons).toContain("household_default_applied");
    });

    it("never applies the household default to a meal eaten outside", () => {
      const e = estimateMeal({ foods: milk, household: { milk_fortified: "yes" }, meal: { eatenOutside: true } });
      expect(e.items[0].components[0].food?.key).toBe("milk_whole");
      expect(e.nutrients.vitamin_d.state).toBe("partial");
      expect(e.reasons).not.toContain("household_default_applied");
    });

    it("lets a meal's own fact override the household default", () => {
      const e = estimateMeal({ foods: milk, household: { milk_fortified: "yes" }, meal: { milkFortified: "no" } });
      expect(e.items[0].components[0].food?.key).toBe("milk_whole");
      expect(e.nutrients.vitamin_d.state).toBe("value");
    });
  });

  it("uses a confirmed product's label values, marked observed", () => {
    const product: ConfirmedProduct = {
      id: "p1",
      name: "Test fortified atta",
      brand: "Testbrand",
      basis: "per_serving",
      servingGrams: 50,
      nutrients: { iron: 5, folate: 100 },
      source: "label",
      matchNames: ["testbrand atta"],
    };
    const e = estimateMeal({ foods: [food("Testbrand atta roti", "100g")], products: [product] });
    expect(e.items[0]).toMatchObject({ origin: "observed" });
    expect(e.items[0].components[0].product).toMatchObject({ id: "p1", source: "label" });
    expect(e.nutrients.iron).toEqual({ state: "value", amount: 10, coverage: 1 });
    // Not on the label: unknown.
    expect(e.nutrients.calcium.state).toBe("unknown");
  });

  it("keeps trace apart from zero", () => {
    const n = sumComponents([
      { name: "a", grams: 100, food: null, product: null, approximate: false, stateMismatch: false, amounts: { iron: 0 }, trace: ["zinc"], unknown: [], floors: [] },
    ]);
    expect(n.zinc).toEqual({ state: "trace", amount: 0, coverage: 1 });
    expect(n.iron).toEqual({ state: "zero", amount: 0, coverage: 1 });
  });
});

describe("estimateInputHash", () => {
  it("is stable for the same input and changes when a fact changes", () => {
    const a = estimateInputHash({ foods: [food("Milk", "240g")] });
    expect(estimateInputHash({ foods: [food("Milk", "240g")] })).toBe(a);
    expect(estimateInputHash({ foods: [food("Milk", "240g")], household: { milk_fortified: "yes" } })).not.toBe(a);
    expect(estimateInputHash({ foods: [food("Milk", "250g")] })).not.toBe(a);
  });
});
