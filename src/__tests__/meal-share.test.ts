import { buildMealShareData } from "@/lib/meal-share/types";

const baseMeal = {
  imageUrl: "https://example.com/photo.jpg",
  mealType: "lunch",
  loggedAt: "2026-07-19T08:12:09.814Z",
  aiSummary: "Dal rice with sabzi",
  foods: [{ name: "Dal" }, { name: "Rice" }],
  totalProteinMin: 20,
  totalProteinMax: 30,
  totalCaloriesMin: 500,
  totalCaloriesMax: 600,
  totalCarbsMin: 60,
  totalCarbsMax: 80,
  totalFatMin: 10,
  totalFatMax: 14,
};

describe("buildMealShareData", () => {
  it("returns null when the meal has no photo", () => {
    expect(buildMealShareData({ ...baseMeal, imageUrl: undefined })).toBeNull();
  });

  it("computes midpoint macro values", () => {
    const data = buildMealShareData(baseMeal);
    expect(data).toEqual({
      imageUrl: baseMeal.imageUrl,
      mealType: "lunch",
      loggedAt: baseMeal.loggedAt,
      summary: "Dal rice with sabzi",
      proteinG: 25,
      caloriesKcal: 550,
      carbsG: 70,
      fatG: 12,
    });
  });

  it("falls back to a joined food-name list when there's no AI summary", () => {
    const data = buildMealShareData({ ...baseMeal, aiSummary: undefined });
    expect(data?.summary).toBe("Dal, Rice");
  });
});
