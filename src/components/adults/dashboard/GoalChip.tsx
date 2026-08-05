"use client";

// Matches NUTRITION_GOAL_OPTIONS' values (src/lib/food-balance/goal-options.ts).
const GOAL_EMOJI: Record<string, string> = {
  reduce_weight: "⚖️",
  reduce_body_fat: "🔥",
  gain_muscle: "💪",
  body_recomposition: "🔁",
  maintain_weight: "🌿",
  improve_nutrition: "🥗",
  healthy_aging: "🌿",
};

/** Compact coloured pill for a person's nutrition goal, shown next to their
 * name on the family dashboard card header — replaces the old plain-text
 * "Self-tracking, 44y" subtitle (see the family-dashboard-redesign spec).
 * Picks an emoji by goal id where we have one, falling back to a generic
 * leaf rather than guessing. */
export function GoalChip({ label, goalId }: { label: string; goalId?: string }) {
  const emoji = (goalId && GOAL_EMOJI[goalId]) || "🌿";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-dashboard-primary)] bg-[var(--color-dashboard-primary-light)] dark:bg-white/10 dark:text-purple-200 rounded-full px-3 py-1">
      <span aria-hidden="true">{emoji}</span> {label}
    </span>
  );
}
