import { DEFAULT_DIETARY_PROFILE, DietaryProfile, updateDietaryProfile, applyExplicitPreferences } from "@/lib/dietary-profile";
import { personalizeFoodBalanceRecommendation, personalizeFoodBalanceRecommendations, pickFoodExampleLabels } from "@/lib/food-balance/personalize";
import { generateFoodBalanceRecommendations } from "@/lib/food-balance/generate";
import { applyRecommendationFeedback } from "@/lib/food-balance/feedback";
import { isRecommendationSafe, violatesSafetyRules } from "@/lib/food-balance/safety";
import type { FoodBalanceRecommendation } from "@nutriai/health-scoring";

function profile(overrides: Partial<DietaryProfile> = {}): DietaryProfile {
  return { ...DEFAULT_DIETARY_PROFILE, ...overrides };
}

function genericProteinRec(): FoodBalanceRecommendation {
  return {
    id: "proteinAdequacy",
    category: "protein",
    title: "Include protein at breakfast.",
    description: "Adding eggs, yoghurt, tofu, paneer, dal, or another protein source could better support your goal.",
    reason: "Protein intake has been below the range that supports your goal.",
    priority: 1,
    confidence: 0.8,
  };
}

describe("Food Balance Recommendations — personalization", () => {
  it("1. protein-low recommendation uses Food Profile foods instead of the generic template", () => {
    const dairyProfile = updateDietaryProfile(DEFAULT_DIETARY_PROFILE, { categories: ["dairy"], confidence: "high" });
    const rec = personalizeFoodBalanceRecommendation(genericProteinRec(), dairyProfile);
    expect(rec.description).not.toBe(genericProteinRec().description);
    expect(rec.action).toBeDefined();
    expect(rec.exampleFoodIds?.length).toBeGreaterThan(0);
  });

  it("2. Greek yogurt is recommended only when dairy is allowed", () => {
    const dairyProfile = updateDietaryProfile(DEFAULT_DIETARY_PROFILE, { categories: ["dairy"], confidence: "high" });
    const examples = pickFoodExampleLabels("protein", dairyProfile, { meal: "breakfast" });
    expect(examples).toContain("Greek yogurt with fruit");
  });

  it("3. Greek yogurt is not recommended for a vegan profile, even if dairy was somehow observed", () => {
    let p = updateDietaryProfile(DEFAULT_DIETARY_PROFILE, { categories: ["dairy"], confidence: "high" });
    p = applyExplicitPreferences(p, { isVegan: true });
    const examples = pickFoodExampleLabels("protein", p, { meal: "breakfast" });
    expect(examples).not.toContain("Greek yogurt with fruit");
    expect(examples.join(" ")).not.toMatch(/paneer|egg|chicken|fish/i);
  });

  it("Greek yogurt is not recommended for a lactose-intolerant (dairy-avoiding) profile", () => {
    let p = updateDietaryProfile(DEFAULT_DIETARY_PROFILE, { categories: ["dairy"], confidence: "high" });
    p = applyExplicitPreferences(p, { avoidsLactose: true, avoidsDairy: true });
    const examples = pickFoodExampleLabels("protein", p, { meal: "breakfast" });
    expect(examples).not.toContain("Greek yogurt with fruit");
  });

  it("4. Chicken/fish are not recommended for a vegetarian profile even if previously observed", () => {
    let p = updateDietaryProfile(DEFAULT_DIETARY_PROFILE, { categories: ["chicken", "fish"], confidence: "high" });
    p = applyExplicitPreferences(p, { eatsVegetarian: true });
    const examples = pickFoodExampleLabels("protein", p);
    expect(examples.join(" ").toLowerCase()).not.toMatch(/chicken|fish/);
  });

  it("5. Eggs are only recommended once eggs are allowed", () => {
    const noEggs = pickFoodExampleLabels("protein", DEFAULT_DIETARY_PROFILE, { meal: "breakfast" });
    expect(noEggs.join(" ").toLowerCase()).not.toContain("egg");

    const withEggs = applyExplicitPreferences(DEFAULT_DIETARY_PROFILE, { eatsEggs: true });
    const examples = pickFoodExampleLabels("protein", withEggs, { meal: "breakfast" });
    expect(examples.join(" ").toLowerCase()).toContain("egg");
  });

  it("7. disliked foods are excluded from future recommendations", () => {
    const dairyProfile = updateDietaryProfile(DEFAULT_DIETARY_PROFILE, { categories: ["dairy"], confidence: "high" });
    const before = pickFoodExampleLabels("protein", dairyProfile, { meal: "breakfast" });
    expect(before).toContain("Greek yogurt with fruit");

    const afterDislike = applyRecommendationFeedback(dairyProfile, "dont_like", ["greek_yogurt"]);
    const after = pickFoodExampleLabels("protein", afterDislike, { meal: "breakfast" });
    expect(after).not.toContain("Greek yogurt with fruit");
  });

  it("9. Indian vegetarian (dairy-allowed) profile gets dal/paneer/tofu/chana/rajma-style suggestions", () => {
    let p = updateDietaryProfile(DEFAULT_DIETARY_PROFILE, { categories: ["dairy"], confidence: "high" });
    p = applyExplicitPreferences(p, { eatsVegetarian: true });
    const examples = pickFoodExampleLabels("protein", p).join(" ").toLowerCase();
    expect(examples).toMatch(/dal|paneer|tofu|chana|rajma/);
    expect(examples).not.toMatch(/chicken|fish|beef|pork/);
  });

  it("10. vegan profile gets tofu/dal/chana/rajma/soy-style suggestions", () => {
    const p = applyExplicitPreferences(DEFAULT_DIETARY_PROFILE, { isVegan: true });
    const examples = pickFoodExampleLabels("protein", p).join(" ").toLowerCase();
    expect(examples).toMatch(/tofu|dal|chana|rajma|soy/);
    expect(examples).not.toMatch(/paneer|yogurt|egg|chicken|fish/);
  });

  it("11. non-vegetarian profile can receive eggs/fish/chicken plus plant options", () => {
    let p = updateDietaryProfile(DEFAULT_DIETARY_PROFILE, { categories: ["chicken", "fish"], confidence: "high" });
    p = applyExplicitPreferences(p, { eatsEggs: true });
    const examples = pickFoodExampleLabels("protein", p, { count: 20 }).join(" ").toLowerCase();
    expect(examples).toMatch(/chicken|fish|egg/);
    expect(examples).toMatch(/dal|tofu|chana/);
  });

  it("12. a brand-new (low-data) profile gets cautious, broadly-worded plant-based guidance", () => {
    const examples = pickFoodExampleLabels("protein", DEFAULT_DIETARY_PROFILE);
    expect(examples.length).toBeGreaterThan(0);
    expect(examples.join(" ").toLowerCase()).not.toMatch(/chicken|fish|egg|paneer|beef|pork/);
  });

  it("14. no disease-treatment claims are ever generated by the templates", () => {
    const profiles = [
      DEFAULT_DIETARY_PROFILE,
      updateDietaryProfile(DEFAULT_DIETARY_PROFILE, { categories: ["chicken", "fish", "dairy", "eggs"], confidence: "high" }),
    ];
    for (const p of profiles) {
      for (const category of ["protein", "fiber", "fruit_veg", "balanced_carb", "home_cooked", "snack_swap"] as const) {
        const rec = personalizeFoodBalanceRecommendation(
          { id: mapCategoryToId(category), category: "protein", title: "x", description: "x", reason: "x", priority: 1, confidence: 0.8 },
          p
        );
        expect(isRecommendationSafe(rec)).toBe(true);
        expect(violatesSafetyRules(`${rec.title} ${rec.description} ${rec.action ?? ""} ${rec.whyThisHelps ?? ""}`)).toBe(false);
      }
    }
  });

  it("safety validator catches banned medical-claim phrasing", () => {
    expect(violatesSafetyRules("Eat this to lower blood sugar.")).toBe(true);
    expect(violatesSafetyRules("This will prevent heart disease.")).toBe(true);
    expect(violatesSafetyRules("You must eat more vegetables.")).toBe(true);
    expect(violatesSafetyRules("Try adding a vegetable to lunch.")).toBe(false);
  });

  it("17. feedback updates future ranking — 'not available' deprioritizes without excluding", () => {
    let p = updateDietaryProfile(DEFAULT_DIETARY_PROFILE, { categories: ["dairy"], confidence: "high" });
    const before = pickFoodExampleLabels("protein", p, { meal: "breakfast", count: 10 });
    expect(before).toContain("Greek yogurt with fruit");

    p = applyRecommendationFeedback(p, "not_available", ["greek_yogurt"]);
    const after = pickFoodExampleLabels("protein", p, { meal: "breakfast", count: 2 });
    expect(after).not.toContain("Greek yogurt with fruit");
  });

  it("personalizeFoodBalanceRecommendations passes through recommendations it doesn't know how to personalize", () => {
    const unrelated: FoodBalanceRecommendation = {
      id: "intakeConsistency", category: "consistency", title: "Keep portions steady", description: "x", reason: "x", priority: 1, confidence: 0.8,
    };
    const result = personalizeFoodBalanceRecommendations([unrelated], profile());
    expect(result[0]).toEqual(unrelated);
  });
});

function mapCategoryToId(category: string): string {
  const map: Record<string, string> = {
    protein: "proteinAdequacy",
    fiber: "fibreAdequacy",
    fruit_veg: "fruitAndVegetableIntake",
    balanced_carb: "carbohydrateSupport",
    home_cooked: "homePreparedMealShare",
    snack_swap: "minimallyProcessedFoodBalance",
  };
  return map[category];
}

describe("generateFoodBalanceRecommendations — lightweight meal-pattern generator", () => {
  it("caps output at 3 even when every gap is detected", () => {
    const recs = generateFoodBalanceRecommendations({
      profileId: "test",
      foodProfile: DEFAULT_DIETARY_PROFILE,
      mealPattern: {
        proteinLowMeal: "breakfast",
        carbHeavy: true,
        lowFruitVeg: true,
        lowFiber: true,
        ultraProcessedSnacks: true,
        veryLightDinner: true,
      },
      dateRange: { start: "2026-01-01", end: "2026-01-07" },
    });
    expect(recs.length).toBeLessThanOrEqual(3);
  });

  it("ties the recommendation to the specific meal where the gap appears", () => {
    const recs = generateFoodBalanceRecommendations({
      profileId: "test",
      foodProfile: DEFAULT_DIETARY_PROFILE,
      mealPattern: { proteinLowMeal: "dinner" },
      dateRange: { start: "2026-01-01", end: "2026-01-07" },
    });
    expect(recs[0].title.toLowerCase()).toContain("dinner");
    expect(recs[0].description.toLowerCase()).toContain("dinner");
  });

  it("returns nothing when no gaps are detected", () => {
    const recs = generateFoodBalanceRecommendations({
      profileId: "test",
      foodProfile: DEFAULT_DIETARY_PROFILE,
      mealPattern: {},
      dateRange: { start: "2026-01-01", end: "2026-01-07" },
    });
    expect(recs).toEqual([]);
  });
});
