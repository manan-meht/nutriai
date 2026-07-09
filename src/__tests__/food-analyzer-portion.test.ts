// Covers the conservative-portion-estimation rewrite (see
// src/lib/ai/food-analyzer.ts): the high-protein sanity check, the
// "portion is hard to judge" uncertainty language, and the correction-tone
// rule that replies must never open with "I can see:".

import {
  needsPortionConfirmation,
  buildEstimateMessage,
  FoodAnalysisResult,
} from "@/lib/ai/food-analyzer";

function baseAnalysis(overrides: Partial<FoodAnalysisResult> = {}): FoodAnalysisResult {
  return {
    foods: [
      { name: "Chicken hariyali tikka", quantity: "3-4 small pieces", visible_quantity: "3-4 small pieces", calories_min: 120, calories_max: 220, protein_min: 18, protein_max: 28, carbs_min: 0, carbs_max: 0, fat_min: 0, fat_max: 0 },
    ],
    meal_type: "lunch",
    total_calories_min: 500,
    total_calories_max: 700,
    total_protein_min: 32,
    total_protein_max: 45,
    total_carbs_min: 0,
    total_carbs_max: 0,
    total_fat_min: 0,
    total_fat_max: 0,
    summary: "chicken, omelette, avocado",
    confidence: "medium",
    is_zero_calorie_item: false,
    ...overrides,
  };
}

describe("needsPortionConfirmation — high-protein sanity check", () => {
  it("flags a >50g protein estimate that isn't backed by high confidence", () => {
    const analysis = baseAnalysis({ total_protein_max: 65, confidence: "medium" });
    expect(needsPortionConfirmation(analysis)).toBe(true);
  });

  it("does not flag a >50g protein estimate when the model is genuinely confident", () => {
    const analysis = baseAnalysis({ total_protein_max: 65, confidence: "high" });
    expect(needsPortionConfirmation(analysis)).toBe(false);
  });

  it("does not flag a normal, moderate-protein estimate", () => {
    const analysis = baseAnalysis({ total_protein_max: 45, confidence: "medium" });
    expect(needsPortionConfirmation(analysis)).toBe(false);
  });

  it("flags whenever the model itself marked the portion as uncertain, regardless of protein", () => {
    const analysis = baseAnalysis({ total_protein_max: 20, confidence: "medium", portion_uncertain: true });
    expect(needsPortionConfirmation(analysis)).toBe(true);
  });
});

describe("buildEstimateMessage — conservative portion copy and correction tone", () => {
  it("uses visible_quantity (what was actually counted) over the generic quantity field", () => {
    const analysis = baseAnalysis({
      foods: [{ name: "Chicken", quantity: "1 serving", visible_quantity: "3-4 small pieces", calories_min: 100, calories_max: 150, protein_min: 15, protein_max: 20, carbs_min: 0, carbs_max: 0, fat_min: 0, fat_max: 0 }],
    });
    const msg = buildEstimateMessage(analysis, { seed: "test" });
    expect(msg).toContain("3-4 small pieces");
    expect(msg).not.toContain("1 serving");
  });

  it("adds an uncertainty check and asks about the protein portion when the sanity check trips", () => {
    const analysis = baseAnalysis({ total_protein_min: 45, total_protein_max: 68, confidence: "medium" });
    const msg = buildEstimateMessage(analysis, { seed: "test" });
    expect(msg).toMatch(/hard to judge|estimating only what's visible|help with the portion size|small portion/i);
    expect(msg).toContain("Was the protein portion larger than what's visible here?");
  });

  it("does not ask the protein-portion question for a normal, non-flagged estimate", () => {
    const analysis = baseAnalysis({ total_protein_max: 45, confidence: "high" });
    const msg = buildEstimateMessage(analysis, { seed: "test" });
    expect(msg).not.toContain("Was the protein portion larger");
  });

  it("correction replies never open with 'I can see:' and instead acknowledge the correction", () => {
    const analysis = baseAnalysis();
    const msg = buildEstimateMessage(analysis, { isCorrection: true, seed: "correction-seed" });
    expect(msg.startsWith("I can see:")).toBe(false);
    expect(msg).toMatch(/^(Got it|You're right|Thanks|Okay)/);
  });

  it("correction replies never contain generic praise like 'What a lovely meal' or 'Great choice'", () => {
    const analysis = baseAnalysis();
    const msg = buildEstimateMessage(analysis, { isCorrection: true, seed: "another-seed" });
    expect(msg).not.toMatch(/lovely meal|great choice/i);
  });
});
