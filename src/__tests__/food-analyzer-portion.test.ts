// Covers the conservative-portion-estimation rewrite (see
// src/lib/ai/food-analyzer.ts): conditional portion-uncertainty gating
// (needsPortionConfirmation), reason-specific caveat wording
// (pickPortionCaveatLine), and the correction-tone rule that replies must
// never open with "I can see:".
//
// The core regression this guards against: the bot used to append "This
// looks like a small portion, but please correct me if there was more."
// (or similar) to nearly every food breakdown. Uncertainty language must
// now only appear when a specific, structured signal (low portion
// confidence, poor image quality, hidden food, a genuinely wide estimate
// range, or low model confidence) actually warrants it — a clearly visible
// small portion is not, on its own, one of those signals.

import {
  needsPortionConfirmation,
  buildEstimateMessage,
  FoodAnalysisResult,
} from "@/lib/ai/food-analyzer";

// A "normal, clear" fixture: tight range, no uncertainty signals set —
// this should never trigger a caveat on its own.
function baseAnalysis(overrides: Partial<FoodAnalysisResult> = {}): FoodAnalysisResult {
  return {
    foods: [
      { name: "Chicken hariyali tikka", quantity: "3-4 small pieces", visible_quantity: "3-4 small pieces", portion_size: "small", calories_min: 120, calories_max: 190, protein_min: 18, protein_max: 25, carbs_min: 0, carbs_max: 0, fat_min: 0, fat_max: 0 },
    ],
    meal_type: "lunch",
    total_calories_min: 480,
    total_calories_max: 600,
    total_protein_min: 25,
    total_protein_max: 36,
    total_carbs_min: 0,
    total_carbs_max: 0,
    total_fat_min: 0,
    total_fat_max: 0,
    summary: "chicken, omelette, avocado",
    confidence: "high",
    is_zero_calorie_item: false,
    ...overrides,
  };
}

describe("needsPortionConfirmation — conditional gating, not a default", () => {
  it("does NOT flag a normal, clear, tight-range estimate — the default case", () => {
    expect(needsPortionConfirmation(baseAnalysis())).toBe(false);
  });

  it("does NOT flag a clearly-visible SMALL portion just because it's small", () => {
    const analysis = baseAnalysis({
      foods: [{ name: "Chicken", quantity: "3-4 small pieces", visible_quantity: "3-4 small pieces", portion_size: "small", calories_min: 100, calories_max: 150, protein_min: 15, protein_max: 22, carbs_min: 0, carbs_max: 0, fat_min: 0, fat_max: 0 }],
      total_protein_min: 22, total_protein_max: 30,
      confidence: "high",
      // No portion_confidence/image_quality/food_visibility/has_hidden_protein_food set —
      // "small" alone must not imply "uncertain".
    });
    expect(needsPortionConfirmation(analysis)).toBe(false);
  });

  it("flags when portion_confidence is low", () => {
    expect(needsPortionConfirmation(baseAnalysis({ portion_confidence: "low" }))).toBe(true);
  });

  it("flags when image_quality is poor", () => {
    expect(needsPortionConfirmation(baseAnalysis({ image_quality: "poor" }))).toBe(true);
  });

  it("flags when food_visibility is partial or hidden", () => {
    expect(needsPortionConfirmation(baseAnalysis({ food_visibility: "partial" }))).toBe(true);
    expect(needsPortionConfirmation(baseAnalysis({ food_visibility: "hidden" }))).toBe(true);
  });

  it("does not flag on food_visibility: clear or uncertain-but-unset fields", () => {
    expect(needsPortionConfirmation(baseAnalysis({ food_visibility: "clear" }))).toBe(false);
  });

  it("flags when a protein-dense item is marked as possibly hidden", () => {
    expect(needsPortionConfirmation(baseAnalysis({ has_hidden_protein_food: true }))).toBe(true);
  });

  it("flags when the estimated range is genuinely wide", () => {
    const analysis = baseAnalysis({ total_protein_min: 15, total_protein_max: 45 }); // 30g spread
    expect(needsPortionConfirmation(analysis)).toBe(true);
  });

  it("flags when model confidence is low", () => {
    expect(needsPortionConfirmation(baseAnalysis({ confidence: "low" }))).toBe(true);
  });
});

describe("buildEstimateMessage — no default uncertainty language", () => {
  it("ends with the plain Yes/correct/Skip prompt when nothing warrants a caveat", () => {
    const msg = buildEstimateMessage(baseAnalysis(), { seed: "test" });
    expect(msg).toContain("Reply *Yes* to save, type a correction, or reply *Skip* to discard.");
    expect(msg).not.toMatch(/small portion|hard to judge|correct me if there was more/i);
  });

  it("describes a clear small portion plainly, without an uncertainty caveat", () => {
    const analysis = baseAnalysis({
      foods: [
        { name: "Hariyali chicken", quantity: "3-4 small pieces", visible_quantity: "3-4 small pieces", portion_size: "small", calories_min: 120, calories_max: 190, protein_min: 12, protein_max: 23, carbs_min: 0, carbs_max: 0, fat_min: 0, fat_max: 0 },
      ],
      total_protein_min: 25, total_protein_max: 36,
      confidence: "high",
    });
    const msg = buildEstimateMessage(analysis, { seed: "test" });
    expect(msg).toContain("3-4 small pieces");
    expect(msg).not.toMatch(/correct me if there was more|please correct me/i);
  });

  it("uses hidden-food-specific wording when has_hidden_protein_food is true", () => {
    const analysis = baseAnalysis({ has_hidden_protein_food: true });
    const msg = buildEstimateMessage(analysis, { seed: "test" });
    expect(msg).toMatch(/partly hidden|underneath|partly covered/i);
  });

  it("uses image-quality-specific wording when image_quality is poor", () => {
    const analysis = baseAnalysis({ image_quality: "poor" });
    const msg = buildEstimateMessage(analysis, { seed: "test" });
    expect(msg).toMatch(/photo/i);
  });

  it("asks about the protein portion when a high-protein estimate isn't backed by high confidence", () => {
    const analysis = baseAnalysis({ total_protein_min: 45, total_protein_max: 68, confidence: "medium", portion_confidence: "low" });
    const msg = buildEstimateMessage(analysis, { seed: "test" });
    expect(msg).toContain("Was the protein portion larger than what's visible here?");
  });

  it("does not ask the protein-portion question for a normal, non-flagged estimate", () => {
    const msg = buildEstimateMessage(baseAnalysis(), { seed: "test" });
    expect(msg).not.toContain("Was the protein portion larger");
  });

  it("uses visible_quantity (what was actually counted) over the generic quantity field", () => {
    const analysis = baseAnalysis({
      foods: [{ name: "Chicken", quantity: "1 serving", visible_quantity: "3-4 small pieces", calories_min: 100, calories_max: 150, protein_min: 15, protein_max: 20, carbs_min: 0, carbs_max: 0, fat_min: 0, fat_max: 0 }],
    });
    const msg = buildEstimateMessage(analysis, { seed: "test" });
    expect(msg).toContain("3-4 small pieces");
    expect(msg).not.toContain("1 serving");
  });

  it("correction replies never open with 'I can see:' and instead acknowledge the correction", () => {
    const msg = buildEstimateMessage(baseAnalysis(), { isCorrection: true, seed: "correction-seed" });
    expect(msg.startsWith("I can see:")).toBe(false);
    expect(msg).toMatch(/^(Got it|You're right|Thanks|Okay)/);
  });

  it("correction replies never contain generic praise like 'What a lovely meal' or 'Great choice'", () => {
    const msg = buildEstimateMessage(baseAnalysis(), { isCorrection: true, seed: "another-seed" });
    expect(msg).not.toMatch(/lovely meal|great choice/i);
  });
});
