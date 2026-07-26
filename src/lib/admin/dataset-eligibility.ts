import { createServiceClient } from "@/lib/supabase/server";

/**
 * The single mandatory entry point for "which meal submissions may be used
 * for model-improvement/training." See
 * docs/FOOD_MODEL_IMPROVEMENT_AUDIT.md section F, gap #3: consent columns
 * (meal_submissions.consent_for_model_improvement/
 * eligible_for_anonymized_training, human_meal_reviews.
 * eligible_for_model_improvement) already exist and default safely, but
 * nothing in this repo reads them yet — so a future export/embedding/
 * fine-tuning script written without deliberately re-deriving this exact
 * gate would silently defeat the "safe by default" design.
 *
 * Every future dataset-export, embedding-generation, or fine-tuning-data
 * job MUST filter through this function (or fetchEligibleMealSubmissionIds
 * below) rather than querying meal_submissions/human_meal_reviews directly
 * — that's the whole point of centralizing it in one place.
 *
 * A row is eligible only when ALL of the following hold:
 *  - meal_submissions.consent_for_model_improvement is true (the user, or
 *    their account owner, agreed photos may be used to improve the model —
 *    distinct from ordinary operational/dashboard use)
 *  - meal_submissions.eligible_for_anonymized_training is true (the
 *    submission has actually been through whatever de-identification step
 *    the consent implies — this repo does not yet implement that step, see
 *    the audit's other P0 gaps, so this flag should stay false until it
 *    does)
 *  - meal_submissions.needs_redaction is false, OR a redacted_image_url is
 *    present (never surface an image that was flagged as needing redaction
 *    unless a redacted version actually exists)
 *  - at least one human_meal_reviews row on that submission has
 *    eligible_for_model_improvement = true (a human explicitly judged this
 *    specific review record fit for training use, not just "the meal was
 *    reviewed")
 */
export interface DatasetEligibilityFilters {
  /** Restrict to a specific dataset_split (train/validation/test/holdout).
   * Omit to get all splits (including 'unset', still gated by consent). */
  datasetSplit?: "train" | "validation" | "test" | "holdout";
  /** Restrict to human_meal_reviews.is_gold_standard = true rows only. */
  goldStandardOnly?: boolean;
}

export interface EligibleMealSubmissionRow {
  submissionId: string;
  reviewId: string;
  imageUrl: string | null;
  redactedImageUrl: string | null;
  datasetSplit: string;
  isGoldStandard: boolean;
  reviewQuality: string;
}

/**
 * Returns the set of (submission, review) pairs currently eligible for any
 * model-improvement use, applying every consent/redaction/review-quality
 * gate described above. Returns an empty array (never throws) if the
 * consent/eligibility columns can't be read for any reason — callers must
 * treat an empty result as "nothing eligible," never as "gate not applied."
 */
export async function fetchEligibleMealSubmissions(
  filters: DatasetEligibilityFilters = {}
): Promise<EligibleMealSubmissionRow[]> {
  const db = createServiceClient();

  let query = db
    .from("human_meal_reviews")
    .select(
      `
      id,
      dataset_split,
      is_gold_standard,
      review_quality,
      eligible_for_model_improvement,
      meal_submissions!inner (
        id,
        image_url,
        redacted_image_url,
        needs_redaction,
        consent_for_model_improvement,
        eligible_for_anonymized_training
      )
    `
    )
    .eq("eligible_for_model_improvement", true)
    .eq("meal_submissions.consent_for_model_improvement", true)
    .eq("meal_submissions.eligible_for_anonymized_training", true);

  if (filters.datasetSplit) query = query.eq("dataset_split", filters.datasetSplit);
  if (filters.goldStandardOnly) query = query.eq("is_gold_standard", true);

  const { data, error } = await query;
  if (error || !data) return [];

  return data
    .filter((row: any) => !row.meal_submissions.needs_redaction || row.meal_submissions.redacted_image_url)
    .map((row: any) => ({
      submissionId: row.meal_submissions.id as string,
      reviewId: row.id as string,
      imageUrl: row.meal_submissions.needs_redaction ? null : (row.meal_submissions.image_url as string | null),
      redactedImageUrl: row.meal_submissions.redacted_image_url as string | null,
      datasetSplit: row.dataset_split as string,
      isGoldStandard: row.is_gold_standard as boolean,
      reviewQuality: row.review_quality as string,
    }));
}

/** Convenience wrapper for callers that only need the ids (e.g. to join
 * against another table) without the full row shape. */
export async function fetchEligibleMealSubmissionIds(filters: DatasetEligibilityFilters = {}): Promise<string[]> {
  const rows = await fetchEligibleMealSubmissions(filters);
  return rows.map((r) => r.submissionId);
}
