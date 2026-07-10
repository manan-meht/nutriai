// Covers the portion -> nutrition calculation pipeline in
// src/lib/ai/food-analyzer.ts: code-side density-based recalculation
// (recalculateNutritionFromPortions) and the wording/protein consistency
// cap (applyPortionConsistencyCaps). These exist so the LLM's job is to
// see the food (piece count, size, edible weight), not to invent a final
// protein number — a model that ignores the prompt and still returns an
// inflated protein/calorie figure for a small visible portion should be
// overridden by these, not trusted.

import {
  computeItemNutrition,
  recalculateNutritionFromPortions,
  applyPortionConsistencyCaps,
  FoodAnalysisResult,
  FoodItem,
} from "@/lib/ai/food-analyzer";

function makeItem(overrides: Partial<FoodItem> = {}): FoodItem {
  return {
    name: "item", quantity: "1 serving",
    calories_min: 0, calories_max: 0, protein_min: 0, protein_max: 0,
    carbs_min: 0, carbs_max: 0, fat_min: 0, fat_max: 0,
    ...overrides,
  };
}

function makeAnalysis(foods: FoodItem[], overrides: Partial<FoodAnalysisResult> = {}): FoodAnalysisResult {
  const sum = (k: "calories_min" | "calories_max" | "protein_min" | "protein_max") => foods.reduce((t, f) => t + f[k], 0);
  return {
    foods,
    meal_type: "lunch",
    total_calories_min: sum("calories_min"),
    total_calories_max: sum("calories_max"),
    total_protein_min: sum("protein_min"),
    total_protein_max: sum("protein_max"),
    total_carbs_min: 0, total_carbs_max: 0, total_fat_min: 0, total_fat_max: 0,
    summary: "test meal",
    confidence: "medium",
    is_zero_calorie_item: false,
    ...overrides,
  };
}

describe("computeItemNutrition — density-based portion -> macro calculation", () => {
  it("computes chicken protein/calories from edible weight, not the model's own number", () => {
    const item = makeItem({
      food_category: "chicken",
      estimated_edible_weight_grams_min: 45,
      estimated_edible_weight_grams_max: 75,
      protein_min: 40, protein_max: 65, // what an overconfident model might have said
    });
    const computed = computeItemNutrition(item)!;
    expect(computed.protein_min).toBeLessThan(item.protein_min);
    expect(computed.protein_max).toBeLessThan(item.protein_max);
    expect(computed.protein_min).toBeGreaterThanOrEqual(11);
    expect(computed.protein_max).toBeLessThanOrEqual(24);
  });

  it("computes egg/omelette protein from egg count, not raw model output", () => {
    const item = makeItem({ food_category: "egg", egg_count_min: 1, egg_count_max: 2 });
    const computed = computeItemNutrition(item)!;
    expect(computed.protein_min).toBe(6);
    expect(computed.protein_max).toBe(14);
  });

  it("treats avocado as low-protein regardless of what the model reported", () => {
    const item = makeItem({
      food_category: "avocado",
      estimated_edible_weight_grams_min: 75,
      estimated_edible_weight_grams_max: 100,
      protein_min: 10, protein_max: 15,
    });
    const computed = computeItemNutrition(item)!;
    expect(computed.protein_max).toBeLessThanOrEqual(3);
  });

  it("returns null (leaves the model's numbers alone) for uncategorized items like rice or mixed curry", () => {
    const item = makeItem({ name: "Rice", protein_min: 4, protein_max: 6 });
    expect(computeItemNutrition(item)).toBeNull();
  });
});

describe("recalculateNutritionFromPortions — re-sums the meal from corrected item macros", () => {
  it("reproduces the small-chicken-plate example: chicken + omelette + avocado lands well under 45g protein", () => {
    const analysis = makeAnalysis([
      makeItem({
        name: "Hariyali Chicken Tikka", visible_quantity: "3-4 small pieces", portion_size: "small",
        food_category: "chicken", estimated_edible_weight_grams_min: 45, estimated_edible_weight_grams_max: 75,
        protein_min: 40, protein_max: 65, calories_min: 300, calories_max: 400,
      }),
      makeItem({
        name: "Omelette", food_category: "egg", egg_count_min: 1, egg_count_max: 2,
        protein_min: 15, protein_max: 20, calories_min: 150, calories_max: 200,
      }),
      makeItem({
        name: "Avocado", food_category: "avocado", portion_size: "medium",
        estimated_edible_weight_grams_min: 75, estimated_edible_weight_grams_max: 100,
        protein_min: 5, protein_max: 8, calories_min: 120, calories_max: 160,
      }),
    ]);

    const recalculated = recalculateNutritionFromPortions(analysis);

    expect(recalculated.total_protein_max).toBeLessThan(45);
    expect(recalculated.total_protein_max).toBeLessThanOrEqual(40);
    expect(recalculated.total_protein_min).toBeGreaterThanOrEqual(15);
  });

  it("leaves items without a food_category untouched (e.g. dal/rice mixed plate)", () => {
    const analysis = makeAnalysis([
      makeItem({ name: "Rice", protein_min: 4, protein_max: 5, calories_min: 200, calories_max: 220 }),
      makeItem({ name: "Mixed sabzi", protein_min: 3, protein_max: 4, calories_min: 100, calories_max: 130 }),
    ]);
    const recalculated = recalculateNutritionFromPortions(analysis);
    expect(recalculated.total_protein_min).toBe(7);
    expect(recalculated.total_protein_max).toBe(9);
  });
});

describe("applyPortionConsistencyCaps — the estimate must match its own portion wording", () => {
  it("caps a small-portion meat item's protein at 25g even if the raw number is higher", () => {
    const analysis = makeAnalysis([
      makeItem({ food_category: "chicken", portion_size: "small", protein_min: 30, protein_max: 55 }),
    ]);
    const capped = applyPortionConsistencyCaps(analysis);
    expect(capped.foods[0].protein_max).toBeLessThanOrEqual(25);
  });

  it("caps a 1-2 egg omelette's protein at 14g", () => {
    const analysis = makeAnalysis([
      makeItem({ food_category: "egg", egg_count_min: 1, egg_count_max: 2, protein_min: 10, protein_max: 20 }),
    ]);
    const capped = applyPortionConsistencyCaps(analysis);
    expect(capped.foods[0].protein_max).toBeLessThanOrEqual(14);
  });

  it("scales down a >45g total when no item clearly supports a large protein serving, and marks portion_confidence low", () => {
    const analysis = makeAnalysis([
      makeItem({ name: "Mystery protein blob", protein_min: 40, protein_max: 60 }),
    ], { confidence: "medium" });
    const capped = applyPortionConsistencyCaps(analysis);
    expect(capped.total_protein_max).toBeLessThanOrEqual(45);
    expect(capped.portion_confidence).toBe("low");
  });

  it("does not cap a >45g total when a clearly large protein item backs it up, and leaves portion_confidence untouched", () => {
    const analysis = makeAnalysis([
      makeItem({
        food_category: "chicken", portion_size: "large",
        estimated_edible_weight_grams_min: 180, estimated_edible_weight_grams_max: 220,
        protein_min: 48, protein_max: 68,
      }),
    ], { confidence: "medium" });
    const capped = applyPortionConsistencyCaps(analysis);
    expect(capped.total_protein_max).toBeGreaterThan(45);
    expect(capped.portion_confidence).toBeFalsy();
  });
});
