"use client";

/** Bottom-of-card "Today's focus" recommendation, from the same Food
 * Balance Score result FoodBalanceRing/the parent card already fetched
 * (result.recommendations[0]) — the single top-priority recommendation,
 * not the full ranked list FoodBalanceScoreCard shows on the detail page.
 * Text-only and allowed to wrap to a second line rather than truncating —
 * an icon-tile treatment (bundled Twemoji SVGs per FOOD_LIBRARY id) was
 * tried and reverted: the icons weren't intuitive enough at tile size to
 * justify over plain, fully-readable text. */
export function TodaysFocus({ text }: { text: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Today&apos;s focus</p>
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-0.5">{text}</p>
    </div>
  );
}
