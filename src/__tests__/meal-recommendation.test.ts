import { buildMealRecommendation } from "@/lib/ai/food-analyzer";

function analysis(foodNames: string[], overrides: Record<string, unknown> = {}) {
  return {
    meal_type: "lunch",
    foods: foodNames.map((name) => ({ name, quantity: "1 serving" })),
    total_calories_min: 400, total_calories_max: 500,
    total_protein_min: 25, total_protein_max: 30,
    total_carbs_min: 30, total_carbs_max: 40,
    total_fat_min: 5, total_fat_max: 10,
    summary: foodNames.join(", "), confidence: "high", is_zero_calorie_item: false,
    ...overrides,
  } as any;
}

describe("buildMealRecommendation", () => {
  it("returns null for dinner regardless of balance", () => {
    expect(buildMealRecommendation(analysis(["white rice"]), "dinner", { protein: 0, targetProteinG: 100 })).toBeNull();
  });

  it("affirms a well-rounded meal with no target context", () => {
    const result = buildMealRecommendation(analysis(["chicken", "salad", "rice"]), "lunch", null);
    expect(result).toContain("well-rounded");
  });

  it("flags a protein-light meal with no target context", () => {
    const result = buildMealRecommendation(analysis(["white rice", "salad"]), "lunch", null);
    expect(result).toContain("light on protein");
  });

  it("suggests veg when protein is present but veg is missing, no target context", () => {
    const result = buildMealRecommendation(analysis(["chicken", "rice"]), "lunch", null);
    expect(result).toContain("add a vegetable");
  });

  it("tells a well-rounded meal it's on track when close to target", () => {
    const result = buildMealRecommendation(analysis(["chicken", "salad", "rice"]), "lunch", { protein: 95, targetProteinG: 100 });
    expect(result).toContain("right on track");
  });

  it("tells a well-rounded meal to keep protein in mind when behind target", () => {
    const result = buildMealRecommendation(analysis(["chicken", "salad", "rice"]), "lunch", { protein: 40, targetProteinG: 100 });
    expect(result).toContain("40g of your 100g protein target");
  });

  it("doesn't push more protein on a protein-light meal when the day is already on track", () => {
    const result = buildMealRecommendation(analysis(["white rice", "salad"]), "lunch", { protein: 95, targetProteinG: 100 });
    expect(result).toContain("no need to add more");
  });

  it("pushes protein on a protein-light meal when the day is behind target", () => {
    const result = buildMealRecommendation(analysis(["white rice", "salad"]), "lunch", { protein: 30, targetProteinG: 100 });
    expect(result).toContain("only at 30g of your 100g target");
  });
});
