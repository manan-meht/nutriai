"use client";

import type { MealLog } from "@/app/(gym)/gym/dashboard/actions";

interface Props {
  meals: MealLog[];
}

const MEAL_EMOJIS: Record<string, string> = {
  breakfast: "🌅",
  lunch: "☀️",
  dinner: "🌙",
  snack: "🍎",
};

export function MealFeed({ meals }: Props) {
  if (meals.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        No meals logged in the last 7 days
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {meals.slice(0, 10).map((meal) => {
        const avgProtein = Math.round((meal.totalProteinMin + meal.totalProteinMax) / 2);
        const avgCal = Math.round((meal.totalCaloriesMin + meal.totalCaloriesMax) / 2);
        const time = new Date(meal.loggedAt).toLocaleString("en-IN", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });
        const emoji = MEAL_EMOJIS[meal.mealType] ?? "🍽️";
        const mealLabel = meal.mealType.charAt(0).toUpperCase() + meal.mealType.slice(1);

        return (
          <div key={meal.id} className="flex items-start gap-3 rounded-xl border border-gray-100 p-3">
            <span className="text-xl mt-0.5">{emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="text-sm font-medium text-gray-900">{mealLabel}</span>
                <span className="text-xs text-gray-400 shrink-0">{time}</span>
              </div>
              <p className="text-xs text-gray-500 truncate">{meal.aiSummary ?? meal.foods.map((f) => f.name).join(", ")}</p>
              <div className="flex gap-3 mt-1">
                <span className="text-xs font-medium text-purple-600">{avgProtein}g protein</span>
                <span className="text-xs text-gray-400">{avgCal} kcal</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
