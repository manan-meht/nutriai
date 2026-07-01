import type { ConfirmedMeal, GymGoalConfig } from "@/types";

export interface GoalEvaluationResult {
  goalId: string;
  metric: string;
  status: "on_track" | "below_target" | "above_target" | "insufficient_data";
  currentValue?: number;
  targetValue?: number;
  progressPercent?: number;
  note?: string;
}

export async function evaluateGoalsForPeriod(
  goals: GymGoalConfig[],
  meals: ConfirmedMeal[],
  periodDays: 7 | 14 | 28 = 7
): Promise<GoalEvaluationResult[]> {
  return goals
    .filter((g) => g.status === "active")
    .map((goal) => evaluateSingleGoal(goal, meals, periodDays));
}

function evaluateSingleGoal(
  goal: GymGoalConfig,
  meals: ConfirmedMeal[],
  periodDays: number
): GoalEvaluationResult {
  if (meals.length === 0) {
    return {
      goalId: goal.id,
      metric: goal.metric,
      status: "insufficient_data",
      note: "No meals logged in this period.",
    };
  }

  switch (goal.metric) {
    case "protein_grams": {
      const avgDailyProtein =
        meals.reduce((sum, m) => sum + (m.nutritionEstimate.proteinGrams?.max ?? 0), 0) /
        periodDays;
      const target = goal.targetValue!;
      const status =
        avgDailyProtein >= (goal.minimumValue ?? target * 0.9)
          ? "on_track"
          : "below_target";
      return {
        goalId: goal.id,
        metric: goal.metric,
        status,
        currentValue: Math.round(avgDailyProtein),
        targetValue: target,
        progressPercent: Math.min(Math.round((avgDailyProtein / target) * 100), 100),
        note: status === "below_target" ? `Average ${Math.round(avgDailyProtein)}g/day against ${target}g target.` : undefined,
      };
    }

    case "meals_logged": {
      const daysWithMeals = new Set(meals.map((m) => new Date(m.loggedAt).toDateString())).size;
      const target = goal.targetValue ?? periodDays;
      const status = daysWithMeals >= target * 0.85 ? "on_track" : "below_target";
      return {
        goalId: goal.id,
        metric: goal.metric,
        status,
        currentValue: daysWithMeals,
        targetValue: target,
        progressPercent: Math.round((daysWithMeals / target) * 100),
      };
    }

    case "protein_meal_frequency": {
      const mealsWithGoodProtein = meals.filter(
        (m) => (m.nutritionEstimate.proteinGrams?.max ?? 0) >= 20
      ).length;
      const target = goal.targetValue ?? (periodDays * 3);
      const status = mealsWithGoodProtein >= target ? "on_track" : "below_target";
      return {
        goalId: goal.id,
        metric: goal.metric,
        status,
        currentValue: mealsWithGoodProtein,
        targetValue: target,
        progressPercent: Math.round((mealsWithGoodProtein / target) * 100),
      };
    }

    default:
      return { goalId: goal.id, metric: goal.metric, status: "insufficient_data" };
  }
}
