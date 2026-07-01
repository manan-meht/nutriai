/**
 * Background processor for MealConfirmedEvent.
 *
 * Called after a user confirms (or auto-confirms) a meal.
 * Routes to the correct product intelligence layer based on workspace type.
 *
 * In production: wire this to a Supabase database webhook, pg_cron job,
 * or a queue worker (e.g. Inngest, Trigger.dev). At first release, call
 * it directly from the meal-confirmation API route.
 */

import type { MealConfirmedEvent } from "@/types";
import { getMealById } from "@/packages/core/meals";
import { createServiceClient } from "@/lib/supabase/server";

export async function handleMealConfirmed(event: MealConfirmedEvent): Promise<void> {
  if (event.workspaceType === "gym") {
    await runGymMealProcessing(event);
  } else if (event.workspaceType === "family") {
    await runFamilyMealProcessing(event);
  } else {
    throw new Error(`Unknown workspace type: ${(event as any).workspaceType}`);
  }
}

async function runGymMealProcessing(event: MealConfirmedEvent): Promise<void> {
  const meal = await getMealById(event.mealId);
  if (!meal) return;

  const supabase = createServiceClient();

  // Fetch active goals for this client
  const { data: goalRows } = await supabase
    .from("gym_goal_configs")
    .select("*")
    .eq("workspace_id", event.workspaceId)
    .eq("client_id", event.mealLoggerId)
    .eq("status", "active");

  const { analyseGymMeal } = await import("@/packages/analysis/gym-intelligence/gym-meal-analysis");

  const insight = await analyseGymMeal(
    meal,
    goalRows ?? [],
    [] // training schedule — fetch from DB in production
  );

  // Persist gym insight
  await supabase.from("gym_meal_insights").insert({
    meal_id: event.mealId,
    workspace_id: event.workspaceId,
    client_id: event.mealLoggerId,
    protein_target_contribution: insight.proteinTargetContribution,
    calorie_target_contribution: insight.calorieTargetContribution,
    macro_balance_protein: insight.macroBalance?.protein,
    macro_balance_carbohydrates: insight.macroBalance?.carbohydrates,
    macro_balance_fat: insight.macroBalance?.fat,
    is_training_day: insight.trainingContext?.trainingDay,
    is_pre_workout_meal: insight.trainingContext?.preWorkoutMeal,
    is_post_workout_meal: insight.trainingContext?.postWorkoutMeal,
    timing_observation: insight.trainingContext?.timingObservation,
    protein_status: insight.targetStatus.protein,
    calorie_status: insight.targetStatus.calories,
    meal_timing_status: insight.targetStatus.mealTiming,
    coach_review_recommended: insight.coachReviewRecommended,
    coach_review_reason: insight.coachReviewReason,
  });

  // Add to coach review queue if recommended
  if (insight.coachReviewRecommended && insight.coachReviewReason) {
    // Find trainer assigned to this client
    const { data: assignment } = await supabase
      .from("trainer_client_assignments")
      .select("trainer_id")
      .eq("workspace_id", event.workspaceId)
      .eq("client_id", event.mealLoggerId)
      .eq("is_active", true)
      .single();

    if (assignment) {
      await supabase.from("coach_review_queue").insert({
        workspace_id: event.workspaceId,
        trainer_id: assignment.trainer_id,
        client_id: event.mealLoggerId,
        reason: "protein_target_missed",
        severity: "low",
      });
    }
  }
}

async function runFamilyMealProcessing(event: MealConfirmedEvent): Promise<void> {
  const meal = await getMealById(event.mealId);
  if (!meal) return;

  const supabase = createServiceClient();

  // Fetch recent meals for baseline context (last 28 days)
  const { getMealsForUser } = await import("@/packages/core/meals");
  const recentMeals = await getMealsForUser(event.workspaceId, event.mealLoggerId, 60);
  const olderMeals = recentMeals.filter((m) => m.id !== event.mealId);

  const { analyseFamilyMeal } = await import(
    "@/packages/analysis/family-intelligence/family-meal-analysis"
  );

  const insight = await analyseFamilyMeal(meal, olderMeals);

  // Persist family insight
  await supabase.from("family_meal_insights").insert({
    meal_id: event.mealId,
    workspace_id: event.workspaceId,
    supported_person_id: event.mealLoggerId,
    meal_regularity_contribution: insight.mealRegularityContribution,
    protein_source_detected: insight.proteinSourceDetected,
    fruit_detected: insight.fruitDetected,
    vegetable_detected: insight.vegetableDetected,
    food_variety_contribution: insight.foodVarietyContribution,
    quantity_signal: insight.quantitySignal,
    appetite_signal: insight.appetiteSignal,
    hydration_signal: insight.hydrationSignal,
    baseline_change_detected: insight.baselineChange?.detected,
    baseline_change_description: insight.baselineChange?.description,
    baseline_change_confidence: insight.baselineChange?.confidence,
    family_alert_candidate: insight.familyAlertCandidate,
    family_alert_reason: insight.familyAlertReason,
  });

  // Check if sustained pattern warrants an alert (evaluated over 7 days, not single meal)
  const weekMeals = recentMeals.filter(
    (m) => new Date(m.loggedAt) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  );

  if (weekMeals.length >= 5) {
    const { evaluateFamilyAlerts } = await import(
      "@/packages/analysis/family-intelligence/family-alert-evaluator"
    );
    const { getMealsForUser: getMeals } = await import("@/packages/core/meals");
    const allInsightRows = await supabase
      .from("family_meal_insights")
      .select("*")
      .eq("workspace_id", event.workspaceId)
      .eq("supported_person_id", event.mealLoggerId)
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    const mappedInsights = (allInsightRows.data ?? []).map((row: any) => ({
      mealId: row.meal_id,
      supportedPersonId: row.supported_person_id,
      proteinSourceDetected: row.protein_source_detected,
      fruitDetected: row.fruit_detected,
      vegetableDetected: row.vegetable_detected,
      quantitySignal: row.quantity_signal,
      appetiteSignal: row.appetite_signal,
      hydrationSignal: row.hydration_signal,
      baselineChange: { detected: row.baseline_change_detected },
      familyAlertCandidate: row.family_alert_candidate,
    }));

    const alerts = evaluateFamilyAlerts(weekMeals, mappedInsights as any, 7);

    for (const alert of alerts) {
      // Upsert — avoid duplicate alerts for the same pattern
      await supabase.from("family_alerts").upsert(
        {
          workspace_id: event.workspaceId,
          supported_person_id: event.mealLoggerId,
          alert_type: alert.alertType,
          observed_pattern: alert.observedPattern,
          time_period_days: alert.timePeriodDays,
          data_completeness: alert.dataCompleteness,
          confidence: alert.confidence,
          suggested_action: alert.suggestedAction,
          severity: "awareness",
        },
        { onConflict: "workspace_id,supported_person_id,alert_type" }
      );
    }
  }
}
