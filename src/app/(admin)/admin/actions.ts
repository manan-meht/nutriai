"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { getAdminSession, canWriteFoodKnowledgeBase } from "@/lib/admin/auth";
import { computeReviewPriority, type ReviewPriority } from "@/lib/admin/review-priority";
import { computeModelQualityMetrics, type ReviewedMealForMetrics, type ModelQualityMetrics } from "@/lib/admin/model-quality";

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

export interface QueueFilters {
  status?: "pending" | "reviewed" | "escalated" | "all";
  priority?: ReviewPriority | "all";
  mealType?: string;
  source?: string;
  market?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: "newest" | "oldest" | "lowest_confidence" | "highest_priority";
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
}

export async function getReviewQueue(filters: QueueFilters): Promise<{ items: QueueItem[] } | { error: string }> {
  const session = await getAdminSession();
  if (!session) return { error: "Not authorized" };

  const db = createServiceClient();
  let query = db
    .from("meal_submissions")
    .select("*, ai_meal_classifications(*)")
    .order("submitted_at", { ascending: filters.sort === "oldest" })
    .limit(200);

  if (filters.status && filters.status !== "all") query = query.eq("review_status", filters.status);
  if (filters.mealType) query = query.eq("meal_type", filters.mealType);
  if (filters.source) query = query.eq("source", filters.source);
  if (filters.market) query = query.eq("market", filters.market);
  if (filters.dateFrom) query = query.gte("submitted_at", filters.dateFrom);
  if (filters.dateTo) query = query.lte("submitted_at", filters.dateTo);

  const { data, error } = await query;
  if (error) return { error: error.message };

  let items: QueueItem[] = (data ?? []).map((row: any) => {
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
      imageUrl: row.image_url,
      submittedAt: row.submitted_at,
      mealType: row.meal_type,
      source: row.source,
      aiSummary: detectedItems.join(", ") || "No items detected",
      confidenceScore: classification?.confidence_score ?? null,
      priority,
      reviewStatus: row.review_status,
      anonymizedUserId: anonymizedUserId(row.user_id),
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

  return { items };
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
  } | null;
  latestReview: {
    id: string;
    reviewStatus: string;
    correctedItemsJson: any;
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
  sameDaySubmissions: Array<{ id: string; imageUrl: string | null; mealType: string; submittedAt: string }>;
}

export async function getMealReviewDetail(mealSubmissionId: string): Promise<MealReviewDetail | { error: string }> {
  const session = await getAdminSession();
  if (!session) return { error: "Not authorized" };

  const db = createServiceClient();
  const { data: row, error } = await db
    .from("meal_submissions")
    .select("*, ai_meal_classifications(*), human_meal_reviews(*)")
    .eq("id", mealSubmissionId)
    .single();

  if (error || !row) return { error: error?.message ?? "Meal submission not found" };

  const classification = pickLatestClassification(row.ai_meal_classifications);
  const latestReview = pickLatestReview(row.human_meal_reviews);

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

  return {
    submission: {
      id: row.id,
      imageUrl: row.image_url,
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
        }
      : null,
    latestReview: latestReview
      ? {
          id: latestReview.id,
          reviewStatus: latestReview.review_status,
          correctedItemsJson: latestReview.corrected_items_json,
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
    sameDaySubmissions: (sameDayRows ?? []).map((r: any) => ({
      id: r.id,
      imageUrl: r.image_url,
      mealType: r.meal_type,
      submittedAt: r.submitted_at,
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

  return { reviewId: saved.id };
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

/** Copies a reviewer-selected food item straight into the knowledge base as
 * a starting entry — reviewers fill in the rest (category, relevance) from
 * the food-knowledge page afterward. */
export async function addFoodToKnowledgeBase(mealSubmissionId: string, foodName: string): Promise<{ id: string } | { error: string }> {
  const session = await getAdminSession();
  if (!session) return { error: "Not authorized" };

  const result = await upsertFoodKnowledgeEntry({
    foodName,
    category: "unknown",
    proteinRelevance: "none",
    fiberRelevance: "none",
  });
  if ("error" in result) return result;

  const db = createServiceClient();
  await db.from("meal_review_audit_logs").insert({
    meal_submission_id: mealSubmissionId,
    actor_id: session.userId,
    action_type: "added_to_knowledge_base",
    after_json: { foodName, knowledgeBaseId: result.id },
  });

  return result;
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
