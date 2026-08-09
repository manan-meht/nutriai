// Guards the two best-guess force-save paths against committing an analysis
// the model never read any food out of — see analysisHasFoodContent. A real
// user was told "I've saved your breakfast using my best guess: No meal
// content provided. Please share a photo or description of your meal."

import { analysisHasFoodContent } from "@/lib/ai/meal-content";

describe("analysisHasFoodContent", () => {
  it("accepts an analysis with named foods", () => {
    expect(
      analysisHasFoodContent({ foods: [{ name: "Dal" }], total_calories_min: 200, total_calories_max: 300 })
    ).toBe(true);
  });

  it("accepts a genuinely zero-calorie item, which still names its food", () => {
    expect(
      analysisHasFoodContent({ foods: [{ name: "Black coffee" }], total_calories_min: 0, total_calories_max: 0 })
    ).toBe(true);
  });

  it("accepts a calorie estimate even when no foods were itemised", () => {
    expect(analysisHasFoodContent({ foods: [], total_calories_min: 0, total_calories_max: 450 })).toBe(true);
  });

  it("rejects the model's failure output — no foods and no calories", () => {
    expect(analysisHasFoodContent({ foods: [], total_calories_min: 0, total_calories_max: 0 })).toBe(false);
  });

  it("rejects foods that are present but blank/whitespace-named", () => {
    expect(
      analysisHasFoodContent({ foods: [{ name: "  " }, { name: undefined }], total_calories_min: 0, total_calories_max: 0 })
    ).toBe(false);
  });

  it("treats missing/null fields as absent rather than throwing", () => {
    expect(analysisHasFoodContent({})).toBe(false);
    expect(analysisHasFoodContent({ foods: null, total_calories_min: null, total_calories_max: null })).toBe(false);
  });
});
