"use client";

/** One optional food suggestion tile — id/emoji, not a real photo. The
 * scoring engine currently only returns recommendation text plus internal
 * food-library ids (FoodBalanceRecommendation.exampleFoodIds), with no
 * image or emoji attached to those ids anywhere in the codebase, so this
 * type exists for a future caller to populate rather than being wired up
 * today (see TodaysFocus's own doc comment — falls back to text-only). */
export interface SuggestedFood {
  id: string;
  label: string;
  emoji: string;
}

/** Bottom-of-card "Today's focus" recommendation, from the same Food
 * Balance Score result FoodBalanceRing/the parent card already fetched
 * (result.recommendations[0]) — the single top-priority recommendation,
 * not the full ranked list FoodBalanceScoreCard shows on the detail page.
 * Supports an optional suggestedFoods[] tile row per the family-dashboard-
 * redesign spec, but nothing in the scoring pipeline provides per-food
 * images/emoji today, so every current caller omits it and this renders
 * text-only until that data exists — never fabricated. */
export function TodaysFocus({ text, suggestedFoods }: { text: string; suggestedFoods?: SuggestedFood[] }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Today&apos;s focus</p>
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-0.5 truncate">{text}</p>
      </div>
      {suggestedFoods && suggestedFoods.length > 0 && (
        <div className="flex items-center gap-1.5 shrink-0">
          {suggestedFoods.slice(0, 3).map((food) => (
            <div
              key={food.id}
              title={food.label}
              className="w-11 h-11 rounded-xl bg-gray-100 dark:bg-white/10 flex items-center justify-center text-lg"
            >
              <span aria-hidden="true">{food.emoji}</span>
            </div>
          ))}
          {suggestedFoods.length > 3 && (
            <div className="w-11 h-11 rounded-xl bg-gray-100 dark:bg-white/10 flex items-center justify-center text-xs font-semibold text-gray-500 dark:text-gray-400">
              +{suggestedFoods.length - 3}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
