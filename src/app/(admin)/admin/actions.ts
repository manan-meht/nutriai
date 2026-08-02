"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { getAdminSession, canWriteFoodKnowledgeBase } from "@/lib/admin/auth";
import { computeReviewPriority, type ReviewPriority } from "@/lib/admin/review-priority";
import { computeModelQualityMetrics, type ReviewedMealForMetrics, type ModelQualityMetrics } from "@/lib/admin/model-quality";
import { resolveSignedMealPhotoUrl, resolveSignedMealPhotoUrls } from "@nutriai/nutrition-core";
import { FOOD_CATEGORIES, type FoodCategory } from "@/lib/admin/food-categories";

// -----------------------------------------------------------------------
// Anonymized user IDs — derived deterministically from the UUID so the
// same person always shows the same "User #NNNN" across the queue, without
// needing a separate counter table or exposing the real ID.
// -----------------------------------------------------------------------
function anonymizedUserId(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return `User #${(hash % 9000) + 1000}`;
}

function pickLatestClassification(classifications: any[] | null | undefined) {
  if (!classifications?.length) return null;
  return [...classifications].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
}

function pickLatestReview(reviews: any[] | null | undefined) {
  if (!reviews?.length) return null;
  return [...reviews].sort((a, b) => new Date(b.reviewed_at).getTime() - new Date(a.reviewed_at).getTime())[0];
}

// -----------------------------------------------------------------------
// Queue
// -----------------------------------------------------------------------

const QUEUE_PAGE_SIZE = 30;

export interface QueueFilters {
  status?: "pending" | "reviewed" | "escalated" | "all";
  priority?: ReviewPriority | "all";
  mealType?: string;
  source?: string;
  market?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: "newest" | "oldest" | "lowest_confidence" | "highest_priority";
  /** 1-indexed. */
  page?: number;
}

export interface QueueItem {
  id: string;
  imageUrl: string | null;
  submittedAt: string;
  mealType: string;
  source: string;
  aiSummary: string;
  confidenceScore: number | null;
  priority: ReviewPriority;
  reviewStatus: string;
  anonymizedUserId: string;
  /** True when the AI paused this meal for a genuine identity ambiguity
   * (e.g. "is this paneer or tofu?") rather than guessing and logging
   * silently — see food-analyzer.ts's has_high_impact_ambiguity. */
  hasHighImpactAmbiguity: boolean;
}

export async function getReviewQueue(
  filters: QueueFilters
): Promise<{ items: QueueItem[]; page: number; hasNextPage: boolean } | { error: string }> {
  const session = await getAdminSession();
  if (!session) return { error: "Not authorized" };

  const db = createServiceClient();
  const page = Math.max(1, filters.page ?? 1);
  const offset = (page - 1) * QUEUE_PAGE_SIZE;
  // Fetches one extra row past the page size purely to know whether a
  // next page exists, rather than a separate COUNT query against a table
  // that only grows — this page previously loaded up to 200 rows (each
  // with its own signed-photo-URL round-trip, plus every row rendered
  // twice — see the mobile/desktop views below) on every load regardless
  // of how many the admin actually wanted to look at, which was the real
  // source of the slowness reported against this page.
  let query = db
    .from("meal_submissions")
    .select("*, ai_meal_classifications(*)")
    .order("submitted_at", { ascending: filters.sort === "oldest" })
    .range(offset, offset + QUEUE_PAGE_SIZE);

  if (filters.status && filters.status !== "all") query = query.eq("review_status", filters.status);
  if (filters.mealType) query = query.eq("meal_type", filters.mealType);
  if (filters.source) query = query.eq("source", filters.source);
  if (filters.market) query = query.eq("market", filters.market);
  if (filters.dateFrom) query = query.gte("submitted_at", filters.dateFrom);
  if (filters.dateTo) query = query.lte("submitted_at", filters.dateTo);

  const { data, error } = await query;
  if (error) return { error: error.message };
  const hasNextPage = (data ?? []).length > QUEUE_PAGE_SIZE;
  if (hasNextPage) data!.length = QUEUE_PAGE_SIZE;

  // meal-photos is a private bucket (see
  // supabase/migrations/0040_private_meal_photos.sql) — resolve every
  // row's stored path/legacy-URL to a short-lived signed URL in one batch
  // rather than exposing the raw storage path.
  const rows = data ?? [];
  const signedImageUrls = await resolveSignedMealPhotoUrls(db, rows.map((row: any) => row.image_url));

  let items: QueueItem[] = rows.map((row: any, i: number) => {
    const classification = pickLatestClassification(row.ai_meal_classifications);
    const detectedItems: string[] = (classification?.detected_items_json ?? []).map((f: any) => (typeof f === "string" ? f : f.name));
    const priority = computeReviewPriority({
      confidenceScore: classification?.confidence_score ?? null,
      imageQuality: row.image_quality,
      detectedItems,
      proteinAnchorStatus: classification?.protein_anchor_status,
      caption: row.caption,
      isEscalated: row.review_status === "escalated",
    });
    return {
      id: row.id,
      imageUrl: signedImageUrls[i] ?? null,
      submittedAt: row.submitted_at,
      mealType: row.meal_type,
      source: row.source,
      aiSummary: detectedItems.join(", ") || "No items detected",
      confidenceScore: classification?.confidence_score ?? null,
      priority,
      reviewStatus: row.review_status,
      anonymizedUserId: anonymizedUserId(row.user_id),
      hasHighImpactAmbiguity: classification?.structured_ai_output_json?.has_high_impact_ambiguity === true,
    };
  });

  if (filters.priority && filters.priority !== "all") {
    items = items.filter((i) => i.priority === filters.priority);
  }

  if (filters.sort === "lowest_confidence") {
    items = [...items].sort((a, b) => (a.confidenceScore ?? 1) - (b.confidenceScore ?? 1));
  } else if (filters.sort === "highest_priority") {
    const rank: Record<ReviewPriority, number> = { high: 0, medium: 1, low: 2 };
    items = [...items].sort((a, b) => rank[a.priority] - rank[b.priority]);
  }

  return { items, page, hasNextPage };
}

// -----------------------------------------------------------------------
// Detail
// -----------------------------------------------------------------------

export interface MealReviewDetail {
  submission: {
    id: string;
    imageUrl: string | null;
    caption: string | null;
    submittedAt: string;
    mealType: string;
    source: string;
    market: string | null;
    imageQuality: string;
    reviewStatus: string;
    anonymizedUserId: string;
  };
  classification: {
    id: string;
    detectedItems: any[];
    proteinAnchorStatus: string;
    vegetableFiberStatus: string;
    carbStatus: string;
    mealBalanceStatus: string;
    homeCookedLikelihood: string;
    enjoymentFoodPresent: boolean;
    sugaryDrinkPresent: boolean;
    friedFoodPresent: boolean;
    ultraProcessedLikelihood: string;
    healthierDirectionSignal: string;
    suggestedNextStep: string | null;
    confidenceScore: number | null;
    modelName: string;
    modelVersion: string | null;
    promptVersion: string | null;
    /** True when the AI paused this meal for a genuine identity ambiguity
     * (e.g. "is this paneer or tofu?") instead of guessing — see
     * food-analyzer.ts's has_high_impact_ambiguity. */
    hasHighImpactAmbiguity: boolean;
    clarificationQuestion: string | null;
    highImpactAmbiguityReason: string | null;
    /** Name of the specific detected item the question was about (the one
     * marked is_ambiguous in the AI's structured output), if any. */
    ambiguousItemName: string | null;
  } | null;
  latestReview: {
    id: string;
    reviewStatus: string;
    correctedItemsJson: any;
    correctedFoodItemsJson: CorrectedFoodItem[] | null;
    correctedProteinAnchorStatus: string | null;
    correctedVegetableFiberStatus: string | null;
    correctedCarbStatus: string | null;
    correctedMealBalanceStatus: string | null;
    correctedHomeCookedLikelihood: string | null;
    correctedEnjoymentFoodPresent: boolean | null;
    correctedSugaryDrinkPresent: boolean | null;
    correctedFriedFoodPresent: boolean | null;
    correctedUltraProcessedLikelihood: string | null;
    correctedHealthierDirectionSignal: string | null;
    correctedSuggestion: string | null;
    reviewNotes: string | null;
  } | null;
  // The actual calorie/protein/carb/fat estimates the AI produced, from the
  // confirmed meal_logs row this submission is linked to (meal_log_id) —
  // distinct from ai_meal_classifications, which only stores categorical
  // status enums (protein_anchor_status etc), not numeric macros. Null if
  // this submission hasn't been linked to a confirmed meal log yet.
  mealLog: {
    id: string;
    totalCaloriesMin: number;
    totalCaloriesMax: number;
    totalProteinMin: number;
    totalProteinMax: number;
    totalCarbsMin: number;
    totalCarbsMax: number;
    totalFatMin: number;
    totalFatMax: number;
    foods: any[];
  } | null;
  sameDaySubmissions: Array<{ id: string; imageUrl: string | null; mealType: string; submittedAt: string }>;
  /** Existing food_knowledge_base entries (name + aliases only) for the
   * per-item review UI's autocomplete — matching against these instead of
   * typing a fresh name each time keeps the knowledge base from
   * fragmenting into near-duplicates ("Chicken Curry" vs "Murgh Curry" vs
   * "chicken curry"). */
  knownFoods: Array<{
    id: string;
    foodName: string;
    aliases: string[];
    category: string;
    isHealthy: boolean | null;
    isHomeCooked: boolean | null;
    isUltraProcessed: boolean | null;
  }>;
}

/** One entry in a reviewer's confirmed/edited food-item list for a meal —
 * the source of truth for "what foods were actually in this meal" and the
 * per-food classification flags that feed food_knowledge_base (see
 * upsertFoodKnowledgeFromReviewItems). Superset of the old freeform
 * corrected_items_json, which only ever carried names. */
export interface CorrectedFoodItem {
  name: string;
  foodKnowledgeBaseId: string | null;
  category: FoodCategory | null;
  isHealthy: boolean | null;
  isHomeCooked: boolean | null;
  isUltraProcessed: boolean | null;
}

export async function getMealReviewDetail(mealSubmissionId: string): Promise<MealReviewDetail | { error: string }> {
  const session = await getAdminSession();
  if (!session) return { error: "Not authorized" };

  const db = createServiceClient();
  const { data: row, error } = await db
    .from("meal_submissions")
    .select(
      "*, ai_meal_classifications(*), human_meal_reviews(*), meal_logs(id, total_calories_min, total_calories_max, total_protein_min, total_protein_max, total_carbs_min, total_carbs_max, total_fat_min, total_fat_max, foods)"
    )
    .eq("id", mealSubmissionId)
    .single();

  if (error || !row) return { error: error?.message ?? "Meal submission not found" };

  const classification = pickLatestClassification(row.ai_meal_classifications);
  const latestReview = pickLatestReview(row.human_meal_reviews);
  const mealLogRow = row.meal_logs;

  const dayStart = new Date(row.submitted_at);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const { data: sameDayRows } = await db
    .from("meal_submissions")
    .select("id, image_url, meal_type, submitted_at")
    .eq("user_id", row.user_id)
    .neq("id", row.id)
    .gte("submitted_at", dayStart.toISOString())
    .lt("submitted_at", dayEnd.toISOString());

  // meal-photos is a private bucket (see
  // supabase/migrations/0040_private_meal_photos.sql) — see getReviewQueue's
  // identical resolution for the full rationale.
  const sameDayImageUrls = await resolveSignedMealPhotoUrls(db, (sameDayRows ?? []).map((r: any) => r.image_url));
  const submissionImageUrl = await resolveSignedMealPhotoUrl(db, row.image_url);

  const { data: knownFoodRows } = await db
    .from("food_knowledge_base")
    .select("id, food_name, aliases_json, category, is_healthy, is_home_cooked, is_ultra_processed")
    .is("archived_at", null)
    .order("food_name", { ascending: true });

  return {
    submission: {
      id: row.id,
      imageUrl: submissionImageUrl ?? null,
      caption: row.caption,
      submittedAt: row.submitted_at,
      mealType: row.meal_type,
      source: row.source,
      market: row.market,
      imageQuality: row.image_quality,
      reviewStatus: row.review_status,
      anonymizedUserId: anonymizedUserId(row.user_id),
    },
    classification: classification
      ? {
          id: classification.id,
          detectedItems: classification.detected_items_json ?? [],
          proteinAnchorStatus: classification.protein_anchor_status,
          vegetableFiberStatus: classification.vegetable_fiber_status,
          carbStatus: classification.carb_status,
          mealBalanceStatus: classification.meal_balance_status,
          homeCookedLikelihood: classification.home_cooked_likelihood,
          enjoymentFoodPresent: classification.enjoyment_food_present,
          sugaryDrinkPresent: classification.sugary_drink_present,
          friedFoodPresent: classification.fried_food_present,
          ultraProcessedLikelihood: classification.ultra_processed_likelihood,
          healthierDirectionSignal: classification.healthier_direction_signal,
          suggestedNextStep: classification.suggested_next_step,
          confidenceScore: classification.confidence_score,
          modelName: classification.model_name,
          modelVersion: classification.model_version,
          promptVersion: classification.prompt_version,
          hasHighImpactAmbiguity: classification.structured_ai_output_json?.has_high_impact_ambiguity === true,
          clarificationQuestion: classification.structured_ai_output_json?.clarification_question ?? null,
          highImpactAmbiguityReason: classification.structured_ai_output_json?.high_impact_ambiguity_reason ?? null,
          ambiguousItemName:
            (classification.detected_items_json ?? []).find((f: any) => f?.is_ambiguous === true)?.name ?? null,
        }
      : null,
    latestReview: latestReview
      ? {
          id: latestReview.id,
          reviewStatus: latestReview.review_status,
          correctedItemsJson: latestReview.corrected_items_json,
          correctedFoodItemsJson: latestReview.corrected_food_items_json ?? null,
          correctedProteinAnchorStatus: latestReview.corrected_protein_anchor_status,
          correctedVegetableFiberStatus: latestReview.corrected_vegetable_fiber_status,
          correctedCarbStatus: latestReview.corrected_carb_status,
          correctedMealBalanceStatus: latestReview.corrected_meal_balance_status,
          correctedHomeCookedLikelihood: latestReview.corrected_home_cooked_likelihood,
          correctedEnjoymentFoodPresent: latestReview.corrected_enjoyment_food_present,
          correctedSugaryDrinkPresent: latestReview.corrected_sugary_drink_present,
          correctedFriedFoodPresent: latestReview.corrected_fried_food_present,
          correctedUltraProcessedLikelihood: latestReview.corrected_ultra_processed_likelihood,
          correctedHealthierDirectionSignal: latestReview.corrected_healthier_direction_signal,
          correctedSuggestion: latestReview.corrected_suggestion,
          reviewNotes: latestReview.review_notes,
        }
      : null,
    mealLog: mealLogRow
      ? {
          id: mealLogRow.id,
          totalCaloriesMin: mealLogRow.total_calories_min ?? 0,
          totalCaloriesMax: mealLogRow.total_calories_max ?? 0,
          totalProteinMin: mealLogRow.total_protein_min ?? 0,
          totalProteinMax: mealLogRow.total_protein_max ?? 0,
          totalCarbsMin: mealLogRow.total_carbs_min ?? 0,
          totalCarbsMax: mealLogRow.total_carbs_max ?? 0,
          totalFatMin: mealLogRow.total_fat_min ?? 0,
          totalFatMax: mealLogRow.total_fat_max ?? 0,
          foods: mealLogRow.foods ?? [],
        }
      : null,
    sameDaySubmissions: (sameDayRows ?? []).map((r: any, i: number) => ({
      id: r.id,
      imageUrl: sameDayImageUrls[i] ?? null,
      mealType: r.meal_type,
      submittedAt: r.submitted_at,
    })),
    knownFoods: (knownFoodRows ?? []).map((r: any) => ({
      id: r.id,
      foodName: r.food_name,
      aliases: r.aliases_json ?? [],
      category: r.category,
      isHealthy: r.is_healthy,
      isHomeCooked: r.is_home_cooked,
      isUltraProcessed: r.is_ultra_processed,
    })),
  };
}

// -----------------------------------------------------------------------
// Save / escalate review
// -----------------------------------------------------------------------

const REVIEW_STATUSES = ["correct", "partially_correct", "incorrect", "unclear_photo", "not_food", "duplicate", "escalated"] as const;
const PRESENCE_STATUSES = ["missing", "partial", "present", "unknown"] as const;
const CARB_STATUSES = ["missing", "present", "dominant", "unknown"] as const;
const BALANCE_STATUSES = ["needs_support", "moderate", "strong", "unknown"] as const;
const LIKELIHOODS = ["low", "medium", "high", "unknown"] as const;
const DIRECTION_SIGNALS = ["negative", "neutral", "positive", "unknown"] as const;

export interface SaveReviewInput {
  mealSubmissionId: string;
  aiClassificationId?: string | null;
  reviewStatus: (typeof REVIEW_STATUSES)[number];
  correctedItemsJson?: unknown;
  correctedFoodItems?: CorrectedFoodItem[];
  /** Per-item macro corrections, keyed by name against mealLog.foods —
   * when present (and mealLogId is set), saveHumanReview updates the real
   * meal_logs row (the user-facing one), not just this QC record. Only
   * items the reviewer actually edited need to be included. */
  correctedMealMacros?: Array<{ name: string; caloriesKcal: number; proteinG: number; carbsG: number; fatG: number }>;
  mealLogId?: string | null;
  correctedProteinAnchorStatus?: (typeof PRESENCE_STATUSES)[number];
  correctedVegetableFiberStatus?: (typeof PRESENCE_STATUSES)[number];
  correctedCarbStatus?: (typeof CARB_STATUSES)[number];
  correctedMealBalanceStatus?: (typeof BALANCE_STATUSES)[number];
  correctedHomeCookedLikelihood?: (typeof LIKELIHOODS)[number];
  correctedEnjoymentFoodPresent?: boolean;
  correctedSugaryDrinkPresent?: boolean;
  correctedFriedFoodPresent?: boolean;
  correctedUltraProcessedLikelihood?: (typeof LIKELIHOODS)[number];
  correctedHealthierDirectionSignal?: (typeof DIRECTION_SIGNALS)[number];
  correctedSuggestion?: string;
  reviewNotes?: string;
}

function validateSaveReviewInput(input: SaveReviewInput): string | null {
  if (!input.mealSubmissionId) return "Missing meal submission id.";
  if (!REVIEW_STATUSES.includes(input.reviewStatus)) return "Invalid review status.";
  if (input.correctedProteinAnchorStatus && !PRESENCE_STATUSES.includes(input.correctedProteinAnchorStatus)) return "Invalid protein anchor status.";
  if (input.correctedVegetableFiberStatus && !PRESENCE_STATUSES.includes(input.correctedVegetableFiberStatus)) return "Invalid vegetable/fiber status.";
  if (input.correctedCarbStatus && !CARB_STATUSES.includes(input.correctedCarbStatus)) return "Invalid carb status.";
  if (input.correctedMealBalanceStatus && !BALANCE_STATUSES.includes(input.correctedMealBalanceStatus)) return "Invalid meal balance status.";
  if (input.correctedHomeCookedLikelihood && !LIKELIHOODS.includes(input.correctedHomeCookedLikelihood)) return "Invalid home-cooked likelihood.";
  if (input.correctedUltraProcessedLikelihood && !LIKELIHOODS.includes(input.correctedUltraProcessedLikelihood)) return "Invalid ultra-processed likelihood.";
  if (input.correctedHealthierDirectionSignal && !DIRECTION_SIGNALS.includes(input.correctedHealthierDirectionSignal)) return "Invalid healthier-direction signal.";
  for (const item of input.correctedFoodItems ?? []) {
    if (item.category && !FOOD_CATEGORIES.includes(item.category)) return `Invalid food category: ${item.category}.`;
  }
  return null;
}

export async function saveHumanReview(input: SaveReviewInput): Promise<{ reviewId: string } | { error: string }> {
  const session = await getAdminSession();
  if (!session) return { error: "Not authorized" };

  const validationError = validateSaveReviewInput(input);
  if (validationError) return { error: validationError };

  const db = createServiceClient();

  // One review per (submission, reviewer) — re-saving updates it in place,
  // with the audit log capturing the before/after rather than the reviews
  // table accumulating duplicate rows per edit.
  const { data: existing } = await db
    .from("human_meal_reviews")
    .select("*")
    .eq("meal_submission_id", input.mealSubmissionId)
    .eq("reviewer_id", session.userId)
    .maybeSingle();

  const reviewFields = {
    meal_submission_id: input.mealSubmissionId,
    ai_classification_id: input.aiClassificationId ?? null,
    reviewer_id: session.userId,
    review_status: input.reviewStatus,
    corrected_items_json: input.correctedItemsJson ?? null,
    corrected_food_items_json: input.correctedFoodItems ?? null,
    corrected_macros_json: input.correctedMealMacros ?? null,
    corrected_protein_anchor_status: input.correctedProteinAnchorStatus ?? null,
    corrected_vegetable_fiber_status: input.correctedVegetableFiberStatus ?? null,
    corrected_carb_status: input.correctedCarbStatus ?? null,
    corrected_meal_balance_status: input.correctedMealBalanceStatus ?? null,
    corrected_home_cooked_likelihood: input.correctedHomeCookedLikelihood ?? null,
    corrected_enjoyment_food_present: input.correctedEnjoymentFoodPresent ?? null,
    corrected_sugary_drink_present: input.correctedSugaryDrinkPresent ?? null,
    corrected_fried_food_present: input.correctedFriedFoodPresent ?? null,
    corrected_ultra_processed_likelihood: input.correctedUltraProcessedLikelihood ?? null,
    corrected_healthier_direction_signal: input.correctedHealthierDirectionSignal ?? null,
    corrected_suggestion: input.correctedSuggestion ?? null,
    review_notes: input.reviewNotes ?? null,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: saved, error } = existing
    ? await db.from("human_meal_reviews").update(reviewFields).eq("id", existing.id).select().single()
    : await db.from("human_meal_reviews").insert(reviewFields).select().single();

  if (error || !saved) return { error: error?.message ?? "Failed to save review" };

  await db.from("meal_review_audit_logs").insert({
    meal_submission_id: input.mealSubmissionId,
    ai_classification_id: input.aiClassificationId ?? null,
    human_review_id: saved.id,
    actor_id: session.userId,
    action_type: existing ? "updated_review" : "created_review",
    before_json: existing ?? null,
    after_json: saved,
  });

  await db
    .from("meal_submissions")
    .update({ review_status: input.reviewStatus === "escalated" ? "escalated" : "reviewed", updated_at: new Date().toISOString() })
    .eq("id", input.mealSubmissionId);

  if (input.correctedFoodItems?.length) {
    await upsertFoodKnowledgeFromReviewItems(db, input.correctedFoodItems, session.userId);
  }

  if (input.correctedMealMacros?.length && input.mealLogId) {
    await applyMacroCorrectionsToMealLog(db, input.mealLogId, input.correctedMealMacros);
  }

  return { reviewId: saved.id };
}

/** Writes a reviewer's per-item macro corrections straight into the real
 * meal_logs row — the one the user's dashboard/WhatsApp totals actually
 * read from — not just this QC record. Collapses each corrected item's
 * min/max to the same exact value (a human confirmed it, so there's no
 * more uncertainty to express as a range — see the earlier decision to
 * show a single midpoint everywhere rather than a range in some places
 * and not others), and recomputes the meal's totals as the sum across all
 * foods (corrected ones at their new value, everything else unchanged). */
async function applyMacroCorrectionsToMealLog(
  db: ReturnType<typeof createServiceClient>,
  mealLogId: string,
  corrections: Array<{ name: string; caloriesKcal: number; proteinG: number; carbsG: number; fatG: number }>
): Promise<void> {
  const { data: mealLogRow } = await db.from("meal_logs").select("foods").eq("id", mealLogId).single();
  if (!mealLogRow) return;

  const byName = new Map(corrections.map((c) => [c.name.toLowerCase(), c]));
  const updatedFoods = (mealLogRow.foods ?? []).map((food: any) => {
    const correction = byName.get(food.name?.toLowerCase());
    if (!correction) return food;
    return {
      ...food,
      calories_min: correction.caloriesKcal,
      calories_max: correction.caloriesKcal,
      protein_min: correction.proteinG,
      protein_max: correction.proteinG,
      carbs_min: correction.carbsG,
      carbs_max: correction.carbsG,
      fat_min: correction.fatG,
      fat_max: correction.fatG,
    };
  });

  const sum = (key: string) => updatedFoods.reduce((s: number, f: any) => s + (f[key] ?? 0), 0);

  await db
    .from("meal_logs")
    .update({
      foods: updatedFoods,
      total_calories_min: sum("calories_min"),
      total_calories_max: sum("calories_max"),
      total_protein_min: sum("protein_min"),
      total_protein_max: sum("protein_max"),
      total_carbs_min: sum("carbs_min"),
      total_carbs_max: sum("carbs_max"),
      total_fat_min: sum("fat_min"),
      total_fat_max: sum("fat_max"),
    })
    .eq("id", mealLogId);
}

/** Turns a reviewer's per-item corrections directly into food_knowledge_base
 * facts — closing the loop that used to require a separate manual "add to
 * knowledge base" step (which only ever captured the first detected item
 * anyway). Matches each item against an existing entry by exact
 * name/alias first (case-insensitive) so repeated corrections of the same
 * dish reinforce one entry instead of fragmenting into near-duplicates;
 * only creates a new row when nothing matches. `correction_count` is a
 * simple frequency signal — a food confirmed across many reviews is a more
 * reliable fact for a future RAG lookup to trust than a single one-off
 * correction. Only overwrites a flag when the reviewer actually set it
 * (non-null) — an item left unchecked for "healthy" isn't necessarily a
 * claim that it's unhealthy, just that this reviewer didn't judge it. */
async function upsertFoodKnowledgeFromReviewItems(
  db: ReturnType<typeof createServiceClient>,
  items: CorrectedFoodItem[],
  reviewerId: string
): Promise<void> {
  const named = items.filter((item) => item.name.trim());
  if (!named.length) return;

  const { data: existingRows } = await db
    .from("food_knowledge_base")
    .select("id, food_name, aliases_json, category, is_healthy, is_home_cooked, is_ultra_processed, correction_count")
    .is("archived_at", null);

  const byNameOrAlias = new Map<string, any>();
  for (const row of existingRows ?? []) {
    byNameOrAlias.set(row.food_name.toLowerCase(), row);
    for (const alias of row.aliases_json ?? []) {
      if (typeof alias === "string") byNameOrAlias.set(alias.toLowerCase(), row);
    }
  }

  for (const item of named) {
    const name = item.name.trim();
    const match = item.foodKnowledgeBaseId
      ? (existingRows ?? []).find((r) => r.id === item.foodKnowledgeBaseId)
      : byNameOrAlias.get(name.toLowerCase());

    if (match) {
      await db
        .from("food_knowledge_base")
        .update({
          category: item.category ?? match.category,
          is_healthy: item.isHealthy ?? match.is_healthy,
          is_home_cooked: item.isHomeCooked ?? match.is_home_cooked,
          is_ultra_processed: item.isUltraProcessed ?? match.is_ultra_processed,
          correction_count: (match.correction_count ?? 0) + 1,
          reviewed_by: reviewerId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", match.id);
    } else {
      await db.from("food_knowledge_base").insert({
        food_name: name,
        category: item.category ?? "unknown",
        protein_relevance: "none",
        fiber_relevance: "none",
        is_healthy: item.isHealthy,
        is_home_cooked: item.isHomeCooked,
        is_ultra_processed: item.isUltraProcessed,
        correction_count: 1,
        reviewed_by: reviewerId,
      });
    }
  }
}

export async function escalateReview(mealSubmissionId: string, notes?: string): Promise<{ ok: true } | { error: string }> {
  const session = await getAdminSession();
  if (!session) return { error: "Not authorized" };

  const result = await saveHumanReview({
    mealSubmissionId,
    reviewStatus: "escalated",
    reviewNotes: notes,
  });
  if ("error" in result) return result;

  const db = createServiceClient();
  await db.from("meal_review_audit_logs").insert({
    meal_submission_id: mealSubmissionId,
    human_review_id: result.reviewId,
    actor_id: session.userId,
    action_type: "escalated",
    after_json: { notes },
  });

  return { ok: true };
}

/** Used by "Save and next" — finds the next pending submission after the
 * given one so a reviewer can move through the queue without returning to
 * it manually. */
export async function getNextPendingMealId(currentSubmissionId: string): Promise<{ id: string | null } | { error: string }> {
  const session = await getAdminSession();
  if (!session) return { error: "Not authorized" };

  const db = createServiceClient();
  const { data: current } = await db.from("meal_submissions").select("submitted_at").eq("id", currentSubmissionId).single();
  if (!current) return { id: null };

  const { data: next } = await db
    .from("meal_submissions")
    .select("id")
    .eq("review_status", "pending")
    .lt("submitted_at", current.submitted_at)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { id: next?.id ?? null };
}

// -----------------------------------------------------------------------
// Food knowledge base
// -----------------------------------------------------------------------

export interface FoodKnowledgeEntry {
  id: string;
  foodName: string;
  aliases: string[];
  region: string | null;
  category: string;
  proteinRelevance: string;
  fiberRelevance: string;
  usualContext: string | null;
  commonPairings: string[];
  commonMisclassifications: string[];
  recommendedSuggestion: string | null;
  updatedAt: string;
  archived: boolean;
}

export async function listFoodKnowledge(search?: string): Promise<{ entries: FoodKnowledgeEntry[] } | { error: string }> {
  const session = await getAdminSession();
  if (!session) return { error: "Not authorized" };

  const db = createServiceClient();
  let query = db.from("food_knowledge_base").select("*").order("food_name", { ascending: true });
  if (search) query = query.ilike("food_name", `%${search}%`);

  const { data, error } = await query;
  if (error) return { error: error.message };

  return {
    entries: (data ?? []).map((r: any) => ({
      id: r.id,
      foodName: r.food_name,
      aliases: r.aliases_json ?? [],
      region: r.region,
      category: r.category,
      proteinRelevance: r.protein_relevance,
      fiberRelevance: r.fiber_relevance,
      usualContext: r.usual_context,
      commonPairings: r.common_pairings_json ?? [],
      commonMisclassifications: r.common_misclassifications_json ?? [],
      recommendedSuggestion: r.recommended_suggestion,
      updatedAt: r.updated_at,
      archived: !!r.archived_at,
    })),
  };
}

export interface UpsertFoodKnowledgeInput {
  id?: string;
  foodName: string;
  aliases?: string[];
  region?: string;
  category: string;
  proteinRelevance: string;
  fiberRelevance: string;
  usualContext?: string;
  commonPairings?: string[];
  commonMisclassifications?: string[];
  recommendedSuggestion?: string;
}

export async function upsertFoodKnowledgeEntry(input: UpsertFoodKnowledgeInput): Promise<{ id: string } | { error: string }> {
  const session = await getAdminSession();
  if (!session) return { error: "Not authorized" };
  if (!input.foodName.trim()) return { error: "Food name is required." };

  const db = createServiceClient();
  const fields = {
    food_name: input.foodName.trim(),
    aliases_json: input.aliases ?? [],
    region: input.region ?? null,
    category: input.category,
    protein_relevance: input.proteinRelevance,
    fiber_relevance: input.fiberRelevance,
    usual_context: input.usualContext ?? null,
    common_pairings_json: input.commonPairings ?? [],
    common_misclassifications_json: input.commonMisclassifications ?? [],
    recommended_suggestion: input.recommendedSuggestion ?? null,
    reviewed_by: session.userId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = input.id
    ? await db.from("food_knowledge_base").update(fields).eq("id", input.id).select("id").single()
    : await db.from("food_knowledge_base").insert(fields).select("id").single();

  if (error || !data) return { error: error?.message ?? "Failed to save food knowledge entry" };
  return { id: data.id };
}

export async function archiveFoodKnowledgeEntry(id: string): Promise<{ ok: true } | { error: string }> {
  const session = await getAdminSession();
  if (!session) return { error: "Not authorized" };
  if (!canWriteFoodKnowledgeBase(session.role)) return { error: "Only admins can archive food knowledge entries." };

  const db = createServiceClient();
  const { error } = await db.from("food_knowledge_base").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: error.message };
  return { ok: true };
}


// -----------------------------------------------------------------------
// Model quality dashboard
// -----------------------------------------------------------------------

export async function getModelQualityMetrics(): Promise<ModelQualityMetrics | { error: string }> {
  const session = await getAdminSession();
  if (!session) return { error: "Not authorized" };

  const db = createServiceClient();
  const { data, error } = await db
    .from("human_meal_reviews")
    .select("*, ai_meal_classifications(*), meal_submissions(meal_type, market)");

  if (error) return { error: error.message };

  const rows: ReviewedMealForMetrics[] = (data ?? []).map((r: any) => {
    const classification = r.ai_meal_classifications;
    const submission = r.meal_submissions;
    const correctedFoods: string[] = Array.isArray(r.corrected_items_json)
      ? r.corrected_items_json.map((f: any) => (typeof f === "string" ? f : f.name)).filter(Boolean)
      : [];
    return {
      reviewStatus: r.review_status,
      aiProteinStatus: classification?.protein_anchor_status ?? null,
      correctedProteinStatus: r.corrected_protein_anchor_status,
      aiVegStatus: classification?.vegetable_fiber_status ?? null,
      correctedVegStatus: r.corrected_vegetable_fiber_status,
      aiCarbStatus: classification?.carb_status ?? null,
      correctedCarbStatus: r.corrected_carb_status,
      aiBalanceStatus: classification?.meal_balance_status ?? null,
      correctedBalanceStatus: r.corrected_meal_balance_status,
      aiDirectionSignal: classification?.healthier_direction_signal ?? null,
      correctedDirectionSignal: r.corrected_healthier_direction_signal,
      aiSuggestion: classification?.suggested_next_step ?? null,
      correctedSuggestion: r.corrected_suggestion,
      modelVersion: classification?.model_version ?? null,
      promptVersion: classification?.prompt_version ?? null,
      mealType: submission?.meal_type ?? null,
      market: submission?.market ?? null,
      misclassifiedFoods: r.review_status !== "correct" ? correctedFoods : [],
    };
  });

  return computeModelQualityMetrics(rows);
}
