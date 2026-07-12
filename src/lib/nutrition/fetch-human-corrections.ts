import { createServiceClient } from "@/lib/supabase/server";
import type { HumanCorrectionFields } from "@nutriai/dashboard-core";

// Server-only — imports @/lib/supabase/server (next/headers). Keep this
// separate from human-corrections.ts, which client dashboard components
// import for the pure applyHumanCorrection() function; bundling this fetch
// alongside it breaks the client build (next/headers isn't available there).

/** Only review statuses that actually represent a judged classification
 * (not "unclear photo"/"not food"/"duplicate", which say nothing about
 * whether the food fields are right) are used to override the dashboard. */
const APPLICABLE_REVIEW_STATUSES = new Set(["correct", "partially_correct", "incorrect"]);

function definedAndKnown<T extends string>(value: T | null | undefined): T | undefined {
  return value && value !== "unknown" ? value : undefined;
}

/** Fetches the latest applicable human correction for each meal_logs row,
 * keyed by meal_logs.id, for use by the caregiver/self dashboards. */
export async function fetchHumanCorrectionsByMealLogId(mealLogIds: string[]): Promise<Record<string, HumanCorrectionFields>> {
  if (mealLogIds.length === 0) return {};

  const db = createServiceClient();
  const { data } = await db
    .from("meal_submissions")
    .select("meal_log_id, human_meal_reviews(*)")
    .in("meal_log_id", mealLogIds);

  const result: Record<string, HumanCorrectionFields> = {};
  for (const row of data ?? []) {
    if (!row.meal_log_id) continue;
    const reviews: any[] = row.human_meal_reviews ?? [];
    if (!reviews.length) continue;

    const latest = [...reviews].sort((a, b) => new Date(b.reviewed_at).getTime() - new Date(a.reviewed_at).getTime())[0];
    if (!APPLICABLE_REVIEW_STATUSES.has(latest.review_status)) continue;

    result[row.meal_log_id] = {
      proteinAnchorStatus: definedAndKnown(latest.corrected_protein_anchor_status),
      vegetableFiberStatus: definedAndKnown(latest.corrected_vegetable_fiber_status),
      mealBalanceStatus: definedAndKnown(latest.corrected_meal_balance_status),
      homeCookedLikelihood: definedAndKnown(latest.corrected_home_cooked_likelihood),
      enjoymentFoodPresent: latest.corrected_enjoyment_food_present ?? undefined,
      sugaryDrinkPresent: latest.corrected_sugary_drink_present ?? undefined,
      ultraProcessedLikelihood: definedAndKnown(latest.corrected_ultra_processed_likelihood),
      suggestedNextStep: latest.corrected_suggestion ?? undefined,
    };
  }
  return result;
}
