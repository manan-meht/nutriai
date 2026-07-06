// Human review is treated as ground truth throughout — every accuracy
// figure here is "does the AI field match the reviewer's corrected field,"
// computed only over meals where a reviewer actually set that corrected
// field (an unset corrected field means the reviewer didn't judge that
// dimension, not that the AI was right).

export type ReviewStatus = "correct" | "partially_correct" | "incorrect" | "unclear_photo" | "not_food" | "duplicate" | "escalated";

export interface ReviewedMealForMetrics {
  reviewStatus: ReviewStatus;
  aiProteinStatus?: string | null;
  correctedProteinStatus?: string | null;
  aiVegStatus?: string | null;
  correctedVegStatus?: string | null;
  aiCarbStatus?: string | null;
  correctedCarbStatus?: string | null;
  aiBalanceStatus?: string | null;
  correctedBalanceStatus?: string | null;
  aiDirectionSignal?: string | null;
  correctedDirectionSignal?: string | null;
  aiSuggestion?: string | null;
  correctedSuggestion?: string | null;
  modelVersion?: string | null;
  promptVersion?: string | null;
  mealType?: string | null;
  market?: string | null;
  misclassifiedFoods?: string[];
}

export interface ModelQualityMetrics {
  totalReviewed: number;
  pctCorrect: number;
  pctPartiallyCorrect: number;
  pctIncorrect: number;
  pctUnclearOrNotFood: number;
  proteinAccuracy: number | null;
  vegetableFiberAccuracy: number | null;
  carbAccuracy: number | null;
  balancedPlateAccuracy: number | null;
  healthierDirectionAccuracy: number | null;
  suggestionEditRate: number;
  mostCommonlyMisclassifiedFoods: Array<{ food: string; count: number }>;
  accuracyByModelVersion: Record<string, number>;
  accuracyByPromptVersion: Record<string, number>;
  accuracyByMealType: Record<string, number>;
  accuracyByMarket: Record<string, number>;
}

function fieldAccuracy<K extends keyof ReviewedMealForMetrics>(
  rows: ReviewedMealForMetrics[],
  aiKey: K,
  correctedKey: K
): number | null {
  const withCorrection = rows.filter((r) => r[correctedKey] != null);
  if (!withCorrection.length) return null;
  const matches = withCorrection.filter((r) => r[aiKey] === r[correctedKey]).length;
  return matches / withCorrection.length;
}

function overallAccuracy(rows: ReviewedMealForMetrics[]): number {
  if (!rows.length) return 0;
  return rows.filter((r) => r.reviewStatus === "correct").length / rows.length;
}

function groupAccuracy(rows: ReviewedMealForMetrics[], keyFn: (r: ReviewedMealForMetrics) => string | null | undefined): Record<string, number> {
  const groups: Record<string, ReviewedMealForMetrics[]> = {};
  for (const r of rows) {
    const key = keyFn(r) ?? "unknown";
    (groups[key] ??= []).push(r);
  }
  const result: Record<string, number> = {};
  for (const [key, groupRows] of Object.entries(groups)) {
    result[key] = overallAccuracy(groupRows);
  }
  return result;
}

export function computeModelQualityMetrics(rows: ReviewedMealForMetrics[]): ModelQualityMetrics {
  const total = rows.length;
  const pct = (pred: (r: ReviewedMealForMetrics) => boolean) => (total ? rows.filter(pred).length / total : 0);

  const suggestionEdited = rows.filter(
    (r) => r.correctedSuggestion != null && r.aiSuggestion != null && r.correctedSuggestion !== r.aiSuggestion
  );

  const foodCounts: Record<string, number> = {};
  for (const r of rows) {
    for (const food of r.misclassifiedFoods ?? []) {
      foodCounts[food] = (foodCounts[food] ?? 0) + 1;
    }
  }
  const mostCommonlyMisclassifiedFoods = Object.entries(foodCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([food, count]) => ({ food, count }));

  return {
    totalReviewed: total,
    pctCorrect: pct((r) => r.reviewStatus === "correct"),
    pctPartiallyCorrect: pct((r) => r.reviewStatus === "partially_correct"),
    pctIncorrect: pct((r) => r.reviewStatus === "incorrect"),
    pctUnclearOrNotFood: pct((r) => r.reviewStatus === "unclear_photo" || r.reviewStatus === "not_food"),
    proteinAccuracy: fieldAccuracy(rows, "aiProteinStatus", "correctedProteinStatus"),
    vegetableFiberAccuracy: fieldAccuracy(rows, "aiVegStatus", "correctedVegStatus"),
    carbAccuracy: fieldAccuracy(rows, "aiCarbStatus", "correctedCarbStatus"),
    balancedPlateAccuracy: fieldAccuracy(rows, "aiBalanceStatus", "correctedBalanceStatus"),
    healthierDirectionAccuracy: fieldAccuracy(rows, "aiDirectionSignal", "correctedDirectionSignal"),
    suggestionEditRate: total ? suggestionEdited.length / total : 0,
    mostCommonlyMisclassifiedFoods,
    accuracyByModelVersion: groupAccuracy(rows, (r) => r.modelVersion),
    accuracyByPromptVersion: groupAccuracy(rows, (r) => r.promptVersion),
    accuracyByMealType: groupAccuracy(rows, (r) => r.mealType),
    accuracyByMarket: groupAccuracy(rows, (r) => r.market),
  };
}
