"use client";

import type { MealLog } from "@/app/(gym)/gym/dashboard/actions";

interface Props {
  meals: MealLog[];
  days?: number;
}

export function ActivityHeatmap({ meals, days = 30 }: Props) {
  const today = new Date();
  const cells = Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(today.getDate() - (days - 1 - i));
    const key = d.toISOString().slice(0, 10);

    const mealCount = meals.filter((m) => m.loggedAt.slice(0, 10) === key).length;

    return { date: d, key, mealCount };
  });

  function mealColor(count: number) {
    if (count === 0) return "bg-gray-100";
    if (count === 1) return "bg-purple-200";
    if (count === 2) return "bg-purple-400";
    return "bg-purple-600";
  }

  const weeks: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  return (
    <div>
      {/* justify-between (rather than a fixed gap) spreads the week-columns
          across the card's full width instead of hugging the left edge —
          the columns' own width was previously the only thing determining
          the grid's total width, leaving most of a wide card empty. */}
      <div className="flex justify-between w-full">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1.5">
            {week.map((cell) => {
              const isToday = cell.key === today.toISOString().slice(0, 10);
              return (
                <div
                  key={cell.key}
                  title={`${cell.date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · ${cell.mealCount} meal${cell.mealCount !== 1 ? "s" : ""}`}
                  className={`relative w-8 h-8 sm:w-9 sm:h-9 rounded-md ${mealColor(cell.mealCount)} ${isToday ? "ring-2 ring-purple-400 ring-offset-1" : ""} transition-colors`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-gray-100 inline-block" /> No meals
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-purple-400 inline-block" /> Meals logged
        </span>
      </div>
    </div>
  );
}
