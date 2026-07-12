import { applyHumanCorrection, classifyMeal } from "@nutriai/dashboard-core";

describe("applyHumanCorrection", () => {
  const baseMeal = classifyMeal({
    id: "meal-1",
    loggedAt: new Date().toISOString(),
    mealType: "lunch",
    foods: [{ name: "rice" }, { name: "roti" }],
  });

  it("returns the original classification when there is no correction", () => {
    expect(applyHumanCorrection(baseMeal)).toEqual(baseMeal);
  });

  it("prefers the human-corrected fields over the heuristic classification", () => {
    expect(baseMeal.proteinAnchorStatus).toBe("missing");

    const corrected = applyHumanCorrection(baseMeal, {
      proteinAnchorStatus: "present",
      suggestedNextStep: "Reviewer note: this thali included dal off-camera.",
    });

    expect(corrected.proteinAnchorStatus).toBe("present");
    expect(corrected.suggestedNextStep).toBe("Reviewer note: this thali included dal off-camera.");
    // Fields the reviewer didn't touch fall back to the original.
    expect(corrected.vegetableFiberStatus).toBe(baseMeal.vegetableFiberStatus);
    expect(corrected.mealBalanceStatus).toBe(baseMeal.mealBalanceStatus);
  });

  it("does not override booleans with false when the reviewer left them unset", () => {
    const meal = classifyMeal({
      id: "meal-2",
      loggedAt: new Date().toISOString(),
      mealType: "snack",
      foods: [{ name: "samosa" }],
    });
    expect(meal.enjoymentFoodPresent).toBe(true);

    const corrected = applyHumanCorrection(meal, { proteinAnchorStatus: "missing" });
    expect(corrected.enjoymentFoodPresent).toBe(true);
  });
});
