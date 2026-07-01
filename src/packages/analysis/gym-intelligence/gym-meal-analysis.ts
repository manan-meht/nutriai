import type { ConfirmedMeal, GymMealInsight, GymGoalConfig } from "@/types";

interface TrainingDay {
  date: Date;
  isTrainingDay: boolean;
  sessionTime?: string; // HH:MM
}

export async function analyseGymMeal(
  meal: ConfirmedMeal,
  goals: GymGoalConfig[],
  trainingSchedule: TrainingDay[]
): Promise<GymMealInsight> {
  const mealDate = new Date(meal.loggedAt);
  const dayOfWeek = mealDate.getDay();

  const todaySchedule = trainingSchedule.find(
    (s) => s.date.toDateString() === mealDate.toDateString()
  );
  const isTrainingDay = todaySchedule?.isTrainingDay ?? false;

  // Determine relevant goals (training-day vs rest-day vs all)
  const applicableGoals = goals.filter(
    (g) =>
      g.status === "active" &&
      (g.appliesOn === "all_days" ||
        (g.appliesOn === "training_days" && isTrainingDay) ||
        (g.appliesOn === "rest_days" && !isTrainingDay))
  );

  const proteinGoal = applicableGoals.find((g) => g.metric === "protein_grams");
  const calorieGoal = applicableGoals.find((g) => g.metric === "calorie_range");

  const mealProtein = meal.nutritionEstimate.proteinGrams?.max ?? 0;
  const mealCalories = meal.nutritionEstimate.calories?.max ?? 0;

  // Protein target contribution (fraction of daily target from this meal)
  const proteinTargetContribution =
    proteinGoal?.targetValue && proteinGoal.targetValue > 0
      ? Math.min(mealProtein / proteinGoal.targetValue, 1)
      : undefined;

  const calorieTargetContribution =
    calorieGoal?.targetValue && calorieGoal.targetValue > 0
      ? Math.min(mealCalories / calorieGoal.targetValue, 1)
      : undefined;

  // Macro balance
  const totalMacroCalories =
    (meal.nutritionEstimate.proteinGrams?.max ?? 0) * 4 +
    (meal.nutritionEstimate.carbohydratesGrams?.max ?? 0) * 4 +
    (meal.nutritionEstimate.fatGrams?.max ?? 0) * 9;

  const macroBalance =
    totalMacroCalories > 0
      ? {
          protein: `${Math.round(((meal.nutritionEstimate.proteinGrams?.max ?? 0) * 4 / totalMacroCalories) * 100)}%`,
          carbohydrates: `${Math.round(((meal.nutritionEstimate.carbohydratesGrams?.max ?? 0) * 4 / totalMacroCalories) * 100)}%`,
          fat: `${Math.round(((meal.nutritionEstimate.fatGrams?.max ?? 0) * 9 / totalMacroCalories) * 100)}%`,
        }
      : undefined;

  // Meal timing context
  const mealHour = mealDate.getHours();
  const sessionHour = todaySchedule?.sessionTime
    ? parseInt(todaySchedule.sessionTime.split(":")[0])
    : undefined;

  const isPreWorkout =
    isTrainingDay && sessionHour !== undefined && mealHour >= sessionHour - 3 && mealHour < sessionHour;
  const isPostWorkout =
    isTrainingDay && sessionHour !== undefined && mealHour >= sessionHour && mealHour <= sessionHour + 2;

  let timingObservation: string | undefined;
  if (isPreWorkout) timingObservation = "Pre-workout meal timing — carbohydrates may support session energy.";
  if (isPostWorkout && mealProtein >= 20) timingObservation = "Post-workout meal with adequate protein — good for recovery.";
  if (isPostWorkout && mealProtein < 20) timingObservation = "Post-workout meal — protein content appears lower than ideal for recovery.";

  // Target status
  const proteinStatus = proteinGoal
    ? mealProtein < (proteinGoal.minimumValue ?? proteinGoal.targetValue! * 0.25)
      ? "below"
      : mealProtein > (proteinGoal.maximumValue ?? proteinGoal.targetValue! * 0.45)
      ? "above"
      : "within"
    : "unknown";

  const calorieStatus = calorieGoal
    ? mealCalories < (calorieGoal.minimumValue ?? calorieGoal.targetValue! * 0.2)
      ? "below"
      : mealCalories > (calorieGoal.maximumValue ?? calorieGoal.targetValue! * 0.4)
      ? "above"
      : "within"
    : "unknown";

  // Coach review
  const coachReviewRecommended = proteinStatus === "below" || (isPostWorkout && mealProtein < 20);
  const coachReviewReason = coachReviewRecommended
    ? proteinStatus === "below"
      ? "Protein target appears below goal for this meal."
      : "Post-workout protein intake may be insufficient for recovery."
    : undefined;

  return {
    mealId: meal.id,
    clientId: meal.mealLoggerId,
    proteinTargetContribution,
    calorieTargetContribution,
    macroBalance,
    trainingContext: {
      trainingDay: isTrainingDay,
      preWorkoutMeal: isPreWorkout,
      postWorkoutMeal: isPostWorkout,
      timingObservation,
    },
    targetStatus: {
      protein: proteinStatus as any,
      calories: calorieStatus as any,
      mealTiming: isTrainingDay ? "on_track" : "unknown",
    },
    coachReviewRecommended,
    coachReviewReason,
  };
}
