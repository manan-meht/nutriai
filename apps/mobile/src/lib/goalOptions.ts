import type { NutritionGoal, ActivityLevel, ResistanceTrainingStatus } from "@nutriai/health-scoring";

// Mirrors src/lib/food-balance/goal-options.ts on the web app — same goal
// labels/copy, kept as a separate mobile-local file rather than a shared
// package since this is pure UI copy, not scoring logic (the actual
// scoring package, @nutriai/health-scoring, is already shared).
export const NUTRITION_GOAL_OPTIONS: Array<{ value: NutritionGoal; label: string; description: string }> = [
  { value: "reduce_weight", label: "Reduce weight", description: "Lower overall body weight at a gentle, sustainable pace." },
  { value: "reduce_body_fat", label: "Reduce body fat", description: "Lower body fat while preserving muscle and strength." },
  { value: "gain_muscle", label: "Gain muscle", description: "Build muscle with adequate protein and calories, alongside resistance training." },
  { value: "body_recomposition", label: "Body recomposition", description: "Build muscle and reduce fat at the same time." },
  { value: "maintain_weight", label: "Maintain weight", description: "Keep weight broadly stable while eating well." },
  { value: "improve_nutrition", label: "Improve nutrition", description: "Build a more balanced, varied eating pattern — no weight target." },
  { value: "healthy_aging", label: "Healthy Aging", description: "Support energy, strength, mobility and long-term health." },
];

export const NUTRITION_GOAL_LABELS: Record<NutritionGoal, string> = Object.fromEntries(
  NUTRITION_GOAL_OPTIONS.map((o) => [o.value, o.label])
) as Record<NutritionGoal, string>;

export const ACTIVITY_LEVEL_OPTIONS: Array<{ value: ActivityLevel; label: string }> = [
  { value: "unknown", label: "Not sure / prefer not to say" },
  { value: "mostly_sitting", label: "Mostly sitting" },
  { value: "lightly_active", label: "Lightly active" },
  { value: "moderately_active", label: "Moderately active" },
  { value: "very_active", label: "Very active" },
];

export const RESISTANCE_TRAINING_OPTIONS: Array<{ value: ResistanceTrainingStatus; label: string }> = [
  { value: "unknown", label: "Prefer not to say" },
  { value: "regularly", label: "Yes, regularly" },
  { value: "sometimes", label: "Sometimes" },
  { value: "not_currently", label: "Not currently" },
];

export function goalUsesResistanceTraining(goal: NutritionGoal): boolean {
  return goal === "gain_muscle" || goal === "body_recomposition" || goal === "healthy_aging";
}
