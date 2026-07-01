import type { ConfirmedMeal, GymGoalConfig } from "@/types";
import type { GoalEvaluationResult } from "./gym-goal-evaluator";

export interface GymWeeklyReportDraft {
  clientId: string;
  weekStarting: Date;
  summary: string;
  goalResults: GoalEvaluationResult[];
  loggingConsistency: number; // 0–1
  positiveHighlights: string[];
  coachingPriorities: string[];
  suggestedNextActions: string[];
  rawData: {
    mealsLogged: number;
    avgDailyProtein: number;
    avgDailyCalories: number;
    trainingDayProteinAvg: number;
    restDayProteinAvg: number;
  };
}

export async function generateGymWeeklyReport(
  clientId: string,
  weekStarting: Date,
  meals: ConfirmedMeal[],
  goals: GymGoalConfig[],
  goalResults: GoalEvaluationResult[]
): Promise<GymWeeklyReportDraft> {
  const mealsLogged = meals.length;
  const expectedMeals = 7 * 3; // 3 meals a day target
  const loggingConsistency = Math.min(mealsLogged / expectedMeals, 1);

  const avgDailyProtein =
    meals.reduce((s, m) => s + (m.nutritionEstimate.proteinGrams?.max ?? 0), 0) / 7;
  const avgDailyCalories =
    meals.reduce((s, m) => s + (m.nutritionEstimate.calories?.max ?? 0), 0) / 7;

  // Separate training vs rest day meals (stub — assumes no schedule data)
  const trainingDayProteinAvg = avgDailyProtein; // replace with real training schedule lookup
  const restDayProteinAvg = avgDailyProtein;

  const positiveHighlights: string[] = [];
  const coachingPriorities: string[] = [];
  const suggestedNextActions: string[] = [];

  for (const result of goalResults) {
    if (result.status === "on_track") {
      positiveHighlights.push(`${result.metric.replace(/_/g, " ")} goal — on track (${result.progressPercent}%).`);
    } else if (result.status === "below_target") {
      coachingPriorities.push(`${result.metric.replace(/_/g, " ")} below target. ${result.note ?? ""}`);
      suggestedNextActions.push(`Review ${result.metric.replace(/_/g, " ")} with client.`);
    }
  }

  if (loggingConsistency < 0.7) {
    coachingPriorities.unshift("Meal logging consistency is below 70%. Client may need a reminder.");
    suggestedNextActions.unshift("Send a gentle logging reminder.");
  }

  const summary =
    loggingConsistency >= 0.8 && goalResults.every((r) => r.status === "on_track")
      ? "Strong week — logging consistent and goals on track."
      : loggingConsistency < 0.5
      ? "Limited data this week. Logging consistency needs attention before targets can be assessed."
      : `Mixed week — ${goalResults.filter((r) => r.status === "on_track").length} of ${goalResults.length} goals on track.`;

  return {
    clientId,
    weekStarting,
    summary,
    goalResults,
    loggingConsistency,
    positiveHighlights,
    coachingPriorities,
    suggestedNextActions,
    rawData: {
      mealsLogged,
      avgDailyProtein: Math.round(avgDailyProtein),
      avgDailyCalories: Math.round(avgDailyCalories),
      trainingDayProteinAvg: Math.round(trainingDayProteinAvg),
      restDayProteinAvg: Math.round(restDayProteinAvg),
    },
  };
}
