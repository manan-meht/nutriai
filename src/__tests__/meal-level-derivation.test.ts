import { deriveMealLevelFields, type DerivableFoodItem } from "@/lib/admin/meal-level-derivation";

function item(overrides: Partial<DerivableFoodItem> = {}): DerivableFoodItem {
  return { category: null, isHealthy: null, isHomeCooked: null, isUltraProcessed: null, ...overrides };
}

describe("deriveMealLevelFields", () => {
  it("returns all-unknown for an empty item list", () => {
    expect(deriveMealLevelFields([])).toEqual({
      proteinAnchorStatus: "unknown",
      vegetableFiberStatus: "unknown",
      carbStatus: "unknown",
      mealBalanceStatus: "unknown",
      homeCookedLikelihood: "unknown",
      ultraProcessedLikelihood: "unknown",
      healthierDirectionSignal: "unknown",
    });
  });

  it("marks protein anchor present when a protein_anchor item exists", () => {
    const result = deriveMealLevelFields([item({ category: "protein_anchor" }), item({ category: "carb_base" })]);
    expect(result.proteinAnchorStatus).toBe("present");
  });

  it("marks protein anchor partial when only a partial_protein item exists", () => {
    const result = deriveMealLevelFields([item({ category: "partial_protein" }), item({ category: "carb_base" })]);
    expect(result.proteinAnchorStatus).toBe("partial");
  });

  it("marks protein anchor missing when no protein item exists", () => {
    const result = deriveMealLevelFields([item({ category: "carb_base" })]);
    expect(result.proteinAnchorStatus).toBe("missing");
  });

  it("marks carbs dominant when at least half the items are carb_base", () => {
    const result = deriveMealLevelFields([item({ category: "carb_base" }), item({ category: "carb_base" }), item({ category: "protein_anchor" })]);
    expect(result.carbStatus).toBe("dominant");
  });

  it("marks meal balance strong when protein and veg are both present", () => {
    const result = deriveMealLevelFields([item({ category: "protein_anchor" }), item({ category: "vegetable_fiber" })]);
    expect(result.mealBalanceStatus).toBe("strong");
  });

  it("marks meal balance needs_support when neither protein nor veg is present", () => {
    const result = deriveMealLevelFields([item({ category: "carb_base" })]);
    expect(result.mealBalanceStatus).toBe("needs_support");
  });

  it("rolls up home-cooked likelihood as high when all items are home-cooked", () => {
    const result = deriveMealLevelFields([item({ isHomeCooked: true }), item({ isHomeCooked: true })]);
    expect(result.homeCookedLikelihood).toBe("high");
  });

  it("rolls up ultra-processed likelihood as low when no items are ultra-processed", () => {
    const result = deriveMealLevelFields([item({ isUltraProcessed: false }), item({ isUltraProcessed: false })]);
    expect(result.ultraProcessedLikelihood).toBe("low");
  });

  it("rolls up to medium when items disagree", () => {
    const result = deriveMealLevelFields([item({ isHomeCooked: true }), item({ isHomeCooked: false })]);
    expect(result.homeCookedLikelihood).toBe("medium");
  });

  it("returns unknown likelihood when no item has an opinion", () => {
    const result = deriveMealLevelFields([item(), item()]);
    expect(result.homeCookedLikelihood).toBe("unknown");
  });

  it("rolls up healthier direction signal as positive when most items are healthy", () => {
    const result = deriveMealLevelFields([item({ isHealthy: true }), item({ isHealthy: true }), item({ isHealthy: false })]);
    expect(result.healthierDirectionSignal).toBe("positive");
  });
});
