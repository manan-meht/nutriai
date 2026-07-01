"use client";

import type { MealLog, WorkoutLog } from "@/app/(gym)/gym/dashboard/actions";

interface Props {
  meals: MealLog[];
  workouts: WorkoutLog[];
  days?: number;
}

export function ActivityHeatmap({ meals, workouts, days = 30 }: Props) {
  const today = new Date();
  const cells = Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(today.getDate() - (days - 1 - i));
    const key = d.toISOString().slice(0, 10);

    const mealCount = meals.filter((m) => m.loggedAt.slice(0, 10) === key).length;
    const hasWorkout = workouts.some((w) => w.loggedAt.slice(0, 10) === key);

    return { date: d, key, mealCount, hasWorkout };
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
      <div className="flex gap-1.5">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1.5">
            {week.map((cell) => {
              const isToday = cell.key === today.toISOString().slice(0, 10);
              return (
                <div
                  key={cell.key}
                  title={`${cell.date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · ${cell.mealCount} meal${cell.mealCount !== 1 ? "s" : ""}${cell.hasWorkout ? " · workout" : ""}`}
                  className={`relative w-7 h-7 rounded-md ${mealColor(cell.mealCount)} ${isToday ? "ring-2 ring-purple-400 ring-offset-1" : ""} transition-colors`}
                >
                  {cell.hasWorkout && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-400 rounded-full border border-white" />
                  )}
                </div>
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
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block" /> Workout
        </span>
      </div>
    </div>
  );
}
