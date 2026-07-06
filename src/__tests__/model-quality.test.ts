import { computeModelQualityMetrics, type ReviewedMealForMetrics } from "@/lib/admin/model-quality";

function row(overrides: Partial<ReviewedMealForMetrics>): ReviewedMealForMetrics {
  return { reviewStatus: "correct", ...overrides };
}

describe("computeModelQualityMetrics", () => {
  it("returns all-zero metrics for no reviewed meals", () => {
    const metrics = computeModelQualityMetrics([]);
    expect(metrics.totalReviewed).toBe(0);
    expect(metrics.pctCorrect).toBe(0);
    expect(metrics.proteinAccuracy).toBeNull();
  });

  it("computes overall correctness percentages", () => {
    const metrics = computeModelQualityMetrics([
      row({ reviewStatus: "correct" }),
      row({ reviewStatus: "correct" }),
      row({ reviewStatus: "incorrect" }),
      row({ reviewStatus: "partially_correct" }),
    ]);
    expect(metrics.totalReviewed).toBe(4);
    expect(metrics.pctCorrect).toBe(0.5);
    expect(metrics.pctIncorrect).toBe(0.25);
    expect(metrics.pctPartiallyCorrect).toBe(0.25);
  });

  it("computes protein accuracy only over meals with a corrected protein status", () => {
    const metrics = computeModelQualityMetrics([
      row({ aiProteinStatus: "present", correctedProteinStatus: "present" }),
      row({ aiProteinStatus: "missing", correctedProteinStatus: "present" }),
      row({ aiProteinStatus: "present", correctedProteinStatus: null }), // not judged — excluded
    ]);
    expect(metrics.proteinAccuracy).toBe(0.5);
  });

  it("computes the suggestion edit rate", () => {
    const metrics = computeModelQualityMetrics([
      row({ aiSuggestion: "Add protein", correctedSuggestion: "Add protein" }),
      row({ aiSuggestion: "Add protein", correctedSuggestion: "Add curd or dal" }),
    ]);
    expect(metrics.suggestionEditRate).toBe(0.5);
  });

  it("counts most commonly misclassified foods", () => {
    const metrics = computeModelQualityMetrics([
      row({ reviewStatus: "incorrect", misclassifiedFoods: ["poha"] }),
      row({ reviewStatus: "incorrect", misclassifiedFoods: ["poha"] }),
      row({ reviewStatus: "incorrect", misclassifiedFoods: ["idli"] }),
    ]);
    expect(metrics.mostCommonlyMisclassifiedFoods[0]).toEqual({ food: "poha", count: 2 });
  });

  it("groups accuracy by model version", () => {
    const metrics = computeModelQualityMetrics([
      row({ reviewStatus: "correct", modelVersion: "v1" }),
      row({ reviewStatus: "incorrect", modelVersion: "v1" }),
      row({ reviewStatus: "correct", modelVersion: "v2" }),
    ]);
    expect(metrics.accuracyByModelVersion.v1).toBe(0.5);
    expect(metrics.accuracyByModelVersion.v2).toBe(1);
  });
});
