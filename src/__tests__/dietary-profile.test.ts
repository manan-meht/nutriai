import { DEFAULT_DIETARY_PROFILE, DietaryProfile } from "@/lib/dietary-profile/types";
import { updateDietaryProfile as update } from "@/lib/dietary-profile/update";
import { applyExplicitPreferences } from "@/lib/dietary-profile/preferences";
import { buildProteinSuggestion } from "@/lib/dietary-profile/recommend";
import { mentionsMedicalCondition, withMedicalHandoffIfNeeded, MEDICAL_HANDOFF_MESSAGE } from "@/lib/dietary-profile/medical-handoff";
import { buildMealObservation } from "@/lib/dietary-profile/classify-meal";
import type { FoodAnalysisResult, FoodItem } from "@/lib/ai/food-analyzer";

function profile(overrides: Partial<DietaryProfile> = {}): DietaryProfile {
  return { ...DEFAULT_DIETARY_PROFILE, ...overrides };
}

describe("dietary profile — new user default", () => {
  it("1. new user receives plant-based protein suggestions by default", () => {
    const msg = buildProteinSuggestion(DEFAULT_DIETARY_PROFILE);
    expect(msg).toContain("dal");
    expect(msg).toMatch(/beans|tofu|sprouts|chana|lentils/);
    expect(msg).not.toContain("chicken");
    expect(msg).not.toContain("fish");
    expect(msg).not.toContain("paneer");
  });
});

describe("dietary profile — observation-driven unlocking", () => {
  it("2. dairy observation enables vegetarian dairy suggestions", () => {
    const p = update(DEFAULT_DIETARY_PROFILE, { categories: ["dairy"], confidence: "high" });
    expect(p.observed_dairy).toBe(true);
    const msg = buildProteinSuggestion(p);
    expect(msg).toContain("paneer");
    expect(msg).not.toContain("chicken");
  });

  it("3. lactose-containing dairy is tracked separately from dairy generally", () => {
    const p = update(DEFAULT_DIETARY_PROFILE, { categories: ["lactose_dairy"], confidence: "high" });
    expect(p.observed_lactose_dairy).toBe(true);
    expect(p.observed_lactose_free_dairy).toBe(false);
  });

  it("4. chicken observation enables chicken suggestions", () => {
    const p = update(DEFAULT_DIETARY_PROFILE, { categories: ["chicken"], confidence: "high" });
    expect(p.observed_chicken).toBe(true);
    const msg = buildProteinSuggestion(p);
    expect(msg).toContain("chicken");
  });

  it("5. fish observation enables fish suggestions", () => {
    const p = update(DEFAULT_DIETARY_PROFILE, { categories: ["fish"], confidence: "high" });
    expect(p.observed_fish).toBe(true);
    const msg = buildProteinSuggestion(p);
    expect(msg).toContain("fish");
  });
});

describe("dietary profile — explicit preferences override inference", () => {
  it("6. explicit vegetarian preference blocks chicken/fish/meat recommendations even if observed", () => {
    let p = update(DEFAULT_DIETARY_PROFILE, { categories: ["chicken", "fish"], confidence: "high" });
    p = applyExplicitPreferences(p, { eatsVegetarian: true });
    const msg = buildProteinSuggestion(p);
    expect(msg).not.toContain("chicken");
    expect(msg).not.toContain("fish");
  });

  it("7. explicit vegan preference (\"I am vegan\") blocks dairy, eggs, fish, and meat recommendations", () => {
    let p = update(DEFAULT_DIETARY_PROFILE, { categories: ["dairy", "eggs", "fish", "chicken"], confidence: "high" });
    p = applyExplicitPreferences(p, { isVegan: true });
    expect(p.explicit_vegan).toBe(true);
    const msg = buildProteinSuggestion(p);
    expect(msg).not.toContain("paneer");
    expect(msg).not.toContain("chicken");
    expect(msg).not.toContain("fish");
    expect(msg.toLowerCase()).not.toContain("egg");
    expect(msg).toContain("dal");
  });

  it("7b. \"I am vegan\" and \"I eat chicken\" are independent toggles — checking one after the other reflects the most recent explicit choice", () => {
    let p = applyExplicitPreferences(DEFAULT_DIETARY_PROFILE, { isVegan: true });
    expect(p.explicit_vegan).toBe(true);
    p = applyExplicitPreferences(p, { eatsChicken: true });
    expect(p.explicit_vegan).toBe(false);
    const msg = buildProteinSuggestion(p);
    expect(msg).toContain("chicken");
  });
});

describe("dietary profile — confidence gating", () => {
  it("8. low-confidence classifications do not update the dietary profile", () => {
    const p = update(DEFAULT_DIETARY_PROFILE, { categories: ["chicken"], confidence: "low" });
    expect(p).toBe(DEFAULT_DIETARY_PROFILE); // unchanged reference — no-op
    expect(p.observed_chicken).toBe(false);
  });

  it("medium confidence also does not update the profile", () => {
    const p = update(DEFAULT_DIETARY_PROFILE, { categories: ["fish"], confidence: "medium" });
    expect(p.observed_fish).toBe(false);
  });

  it("high overall confidence with low food-identity confidence does not update the profile", () => {
    const p = update(DEFAULT_DIETARY_PROFILE, {
      categories: ["chicken"],
      confidence: "high",
      foodIdentityConfidence: "low",
    });
    expect(p.observed_chicken).toBe(false);
  });

  it("9. user corrections update the dietary profile even without high AI confidence", () => {
    const p = update(DEFAULT_DIETARY_PROFILE, { categories: ["chicken"], confidence: "low", isUserCorrection: true });
    expect(p.observed_chicken).toBe(true);
  });

  it("sensitive categories (pork/red meat/shellfish/other meat) require explicit confirmation or a repeat high-confidence sighting", () => {
    const firstPass = update(DEFAULT_DIETARY_PROFILE, { categories: ["pork"], confidence: "high" });
    expect(firstPass.observed_pork).toBe(false); // one sighting alone isn't enough

    const secondPass = update(firstPass, { categories: ["pork"], confidence: "high" }, { pork: 1 });
    expect(secondPass.observed_pork).toBe(true); // second high-confidence sighting confirms it

    const viaCorrection = update(DEFAULT_DIETARY_PROFILE, { categories: ["pork"], confidence: "low", isUserCorrection: true });
    expect(viaCorrection.observed_pork).toBe(true); // explicit confirmation is immediate
  });

  it("never un-observes a category once confirmed, even if a later meal is plant-based", () => {
    const withChicken = update(DEFAULT_DIETARY_PROFILE, { categories: ["chicken"], confidence: "high" });
    const afterPlantMeal = update(withChicken, { categories: [], confidence: "high" });
    expect(afterPlantMeal.observed_chicken).toBe(true);
  });
});

describe("dietary profile — medical condition boundary", () => {
  it("10. medical-condition-specific advice is not generated; instead a safe handoff is appended", () => {
    const generalAdvice = buildProteinSuggestion(DEFAULT_DIETARY_PROFILE);
    const result = withMedicalHandoffIfNeeded(generalAdvice, "I have diabetes, what should I eat?");
    expect(result).toContain(MEDICAL_HANDOFF_MESSAGE);
    expect(result).toContain("dal"); // still gets the general suggestion, not a diabetes-specific one
  });

  it("detects each listed condition category", () => {
    const examples = [
      "I have diabetes",
      "my kidney numbers were off",
      "dealing with hypertension",
      "history of heart disease",
      "I'm pregnant",
      "recovering from an eating disorder",
      "diagnosed with cancer",
      "liver disease runs in my family",
      "started a new medication",
      "got my lab results back",
    ];
    for (const text of examples) {
      expect(mentionsMedicalCondition(text)).toBe(true);
    }
  });

  it("does not flag ordinary food-balance questions as medical", () => {
    expect(mentionsMedicalCondition("what should I eat for more protein?")).toBe(false);
    expect(mentionsMedicalCondition("is rice healthy?")).toBe(false);
  });

  it("11. recommendation copy stays general wellness — never disease-management phrasing", () => {
    const msg = buildProteinSuggestion(DEFAULT_DIETARY_PROFILE);
    for (const bannedTerm of ["diabetes", "blood sugar", "cholesterol", "blood pressure", "kidney", "disease", "treatment", "diagnos"]) {
      expect(msg.toLowerCase()).not.toContain(bannedTerm);
    }
  });
});

describe("dietary profile — preference editor", () => {
  it("12. preference editor updates future recommendations", () => {
    let p = DEFAULT_DIETARY_PROFILE;
    let msg = buildProteinSuggestion(p);
    expect(msg).not.toContain("chicken");

    p = applyExplicitPreferences(p, { eatsChicken: true });
    msg = buildProteinSuggestion(p);
    expect(msg).toContain("chicken");
  });

  it("explicit avoidance blocks a category even if previously observed", () => {
    let p = update(DEFAULT_DIETARY_PROFILE, { categories: ["chicken"], confidence: "high" });
    expect(buildProteinSuggestion(p)).toContain("chicken");

    p = applyExplicitPreferences(p, { eatsChicken: false });
    expect(buildProteinSuggestion(p)).not.toContain("chicken");
  });

  it("partial preference saves don't reset unrelated fields", () => {
    let p = applyExplicitPreferences(DEFAULT_DIETARY_PROFILE, { avoidsDairy: true });
    p = applyExplicitPreferences(p, { avoidsPork: true });
    expect(p.explicit_avoids_dairy).toBe(true);
    expect(p.explicit_avoids_pork).toBe(true);
  });
});

describe("dietary profile — beef tracked separately from red meat generally", () => {
  function foodItem(overrides: Partial<FoodItem>): FoodItem {
    return {
      name: "item", quantity: "1 serving",
      calories_min: 100, calories_max: 150, protein_min: 10, protein_max: 15,
      carbs_min: 0, carbs_max: 0, fat_min: 0, fat_max: 0, fiber_min: 0, fiber_max: 0,
      ...overrides,
    };
  }
  function analysisWith(foods: FoodItem[], overrides: Partial<FoodAnalysisResult> = {}): FoodAnalysisResult {
    return {
      foods, meal_type: "dinner",
      total_calories_min: 0, total_calories_max: 0, total_protein_min: 0, total_protein_max: 0,
      total_carbs_min: 0, total_carbs_max: 0, total_fat_min: 0, total_fat_max: 0, total_fiber_min: 0, total_fiber_max: 0,
      summary: "test", confidence: "high", is_zero_calorie_item: false,
      ...overrides,
    };
  }

  it("classifies a beef item as 'beef', not 'red_meat'", () => {
    const analysis = analysisWith([foodItem({ name: "Beef steak", food_category: "beef" })]);
    const observation = buildMealObservation(analysis);
    expect(observation.categories).toContain("beef");
    expect(observation.categories).not.toContain("red_meat");
  });

  it("classifies mutton/lamb/goat as 'red_meat', not 'beef'", () => {
    const analysis = analysisWith([foodItem({ name: "Mutton curry", food_category: "red_meat" })]);
    const observation = buildMealObservation(analysis);
    expect(observation.categories).toContain("red_meat");
    expect(observation.categories).not.toContain("beef");
  });

  it("beef requires a second high-confidence sighting or explicit confirmation before being recorded (sensitive category)", () => {
    const analysis = analysisWith([foodItem({ name: "Beef steak", food_category: "beef" })]);
    const observation = buildMealObservation(analysis);

    const firstPass = update(DEFAULT_DIETARY_PROFILE, observation);
    expect(firstPass.observed_beef).toBe(false);

    const secondPass = update(firstPass, observation, { beef: 1 });
    expect(secondPass.observed_beef).toBe(true);

    const viaCorrection = update(DEFAULT_DIETARY_PROFILE, { ...observation, isUserCorrection: true });
    expect(viaCorrection.observed_beef).toBe(true);
  });

  it("classifies paneer as dairy, tofu as neither dairy nor meat", () => {
    const paneerObservation = buildMealObservation(analysisWith([foodItem({ name: "Paneer tikka", food_category: "paneer" })]));
    expect(paneerObservation.categories).toContain("dairy");

    const tofuObservation = buildMealObservation(analysisWith([foodItem({ name: "Tofu stir-fry", food_category: "tofu" })]));
    expect(tofuObservation.categories).toEqual([]);
  });
});
