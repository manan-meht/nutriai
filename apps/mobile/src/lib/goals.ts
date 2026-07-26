import type {
  NutritionGoal,
  ActivityLevel,
  ResistanceTrainingStatus,
  DailyMovementLevel,
  WeeklyModerateActivity,
  StrengthExerciseFrequency,
} from '@nutriai/health-scoring';

/** Shared by person-detail.tsx and person-card.tsx so the goal label shown
 * on a person's card matches the one shown on their detail page. */
export const NUTRITION_GOAL_LABELS: Record<string, string> = {
  reduce_weight: 'Reduce weight',
  reduce_body_fat: 'Reduce body fat',
  gain_muscle: 'Gain muscle',
  body_recomposition: 'Body recomposition',
  maintain_weight: 'Maintain weight',
  improve_nutrition: 'Improve nutrition',
  healthy_aging: 'Healthy aging',
};

// Mirrors nutriai-fresh's main web app's src/lib/food-balance/goal-options.ts
// — same goal copy, plus the profile fields (activity level, resistance
// training) that power the Food Balance Score. Used by
// nutrition-goal-fields.tsx (add/edit person forms), not by the read-only
// detail/card views above.
export const NUTRITION_GOAL_OPTIONS: Array<{ value: NutritionGoal; label: string; description: string }> = [
  { value: 'reduce_weight', label: 'Reduce weight', description: 'Lower overall body weight at a gentle, sustainable pace.' },
  { value: 'reduce_body_fat', label: 'Reduce body fat', description: 'Lower body fat while preserving muscle and strength.' },
  { value: 'gain_muscle', label: 'Gain muscle', description: 'Build muscle with adequate protein and calories, alongside resistance training.' },
  { value: 'body_recomposition', label: 'Body recomposition', description: 'Build muscle and reduce fat at the same time.' },
  { value: 'maintain_weight', label: 'Maintain weight', description: 'Keep weight broadly stable while eating well.' },
  { value: 'improve_nutrition', label: 'Improve nutrition', description: 'Build a more balanced, varied eating pattern — no weight target.' },
  { value: 'healthy_aging', label: 'Healthy Aging', description: 'Support energy, strength, mobility and long-term health.' },
];

// Legacy — no longer shown in any add/edit form (see
// DAILY_MOVEMENT_OPTIONS/WEEKLY_MODERATE_ACTIVITY_OPTIONS/
// STRENGTH_EXERCISE_FREQUENCY_OPTIONS below), kept only as the label set
// for old activity_level/resistance_training_status audit-trail values.
export const ACTIVITY_LEVEL_OPTIONS: Array<{ value: ActivityLevel; label: string }> = [
  { value: 'unknown', label: 'Not sure / prefer not to say' },
  { value: 'mostly_sitting', label: 'Mostly sitting' },
  { value: 'lightly_active', label: 'Lightly active' },
  { value: 'moderately_active', label: 'Moderately active' },
  { value: 'very_active', label: 'Very active' },
];

export const RESISTANCE_TRAINING_OPTIONS: Array<{ value: ResistanceTrainingStatus; label: string }> = [
  { value: 'unknown', label: 'Prefer not to say' },
  { value: 'regularly', label: 'Yes, regularly' },
  { value: 'sometimes', label: 'Sometimes' },
  { value: 'not_currently', label: 'Not currently' },
];

export function goalUsesResistanceTraining(goal: NutritionGoal): boolean {
  return goal === 'gain_muscle' || goal === 'body_recomposition' || goal === 'healthy_aging';
}

// ---------------------------------------------------------------------
// Behavioural activity-profile questions — mirrors the main web app's
// identical additions to src/lib/food-balance/goal-options.ts. See
// @nutriai/health-scoring's deriveActivityLevel for how these answers
// become the internal category calorie/macro calculations use.
// ---------------------------------------------------------------------

export const DAILY_MOVEMENT_OPTIONS: Array<{ value: DailyMovementLevel; label: string }> = [
  { value: 'mostly_seated', label: 'Mostly sitting or lying down for most of the day' },
  { value: 'mixed_light_movement', label: 'A mix of sitting, standing and some walking' },
  { value: 'moving_several_hours', label: 'On their feet and moving for several hours a day' },
  { value: 'physically_demanding', label: 'Physically demanding work or household activity for much of the day' },
  { value: 'not_sure', label: 'Not sure' },
];

export const WEEKLY_MODERATE_ACTIVITY_OPTIONS: Array<{ value: WeeklyModerateActivity; label: string }> = [
  { value: 'under_30', label: 'Less than 30 minutes a week' },
  { value: '30_to_89', label: '30–89 minutes a week' },
  { value: '90_to_149', label: '90–149 minutes a week' },
  { value: '150_to_299', label: '150–299 minutes a week' },
  { value: '300_plus', label: '300 minutes or more a week' },
  { value: 'not_sure', label: 'Not sure' },
];

export const STRENGTH_EXERCISE_FREQUENCY_OPTIONS: Array<{ value: StrengthExerciseFrequency; label: string }> = [
  { value: 'zero_days', label: '0 days' },
  { value: 'less_than_weekly', label: 'Less than 1 day a week' },
  { value: 'one_day', label: '1 day a week' },
  { value: 'two_days', label: '2 days a week' },
  { value: 'three_plus_days', label: '3 or more days a week' },
  { value: 'not_sure', label: 'Not sure' },
];
