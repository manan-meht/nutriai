"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { MealLog } from "@/app/(gym)/gym/dashboard/actions";

interface Props {
  meals: MealLog[];
  targetProteinG?: number;
}

function getLast7Days() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  return days;
}

export function WeeklyNutritionChart({ meals, targetProteinG }: Props) {
  const days = getLast7Days();

  const data = days.map((day) => {
    const label = day.toLocaleDateString("en-IN", { weekday: "short" });
    const dayMeals = meals.filter((m) => {
      const d = new Date(m.loggedAt);
      return (
        d.getDate() === day.getDate() &&
        d.getMonth() === day.getMonth() &&
        d.getFullYear() === day.getFullYear()
      );
    });

    const protein = dayMeals.length
      ? Math.round(
          dayMeals.reduce(
            (sum, m) => sum + (m.totalProteinMin + m.totalProteinMax) / 2,
            0
          )
        )
      : 0;

    const calories = dayMeals.length
      ? Math.round(
          dayMeals.reduce(
            (sum, m) => sum + (m.totalCaloriesMin + m.totalCaloriesMax) / 2,
            0
          )
        )
      : 0;

    return { label, protein, calories, mealsCount: dayMeals.length };
  });

  const maxProtein = Math.max(...data.map((d) => d.protein), targetProteinG ?? 0, 50);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-gray-700">Protein this week (g)</p>
        {targetProteinG && (
          <span className="text-xs text-purple-600 font-medium">Target: {targetProteinG}g</span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#f0f0f0" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} domain={[0, maxProtein + 20]} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload;
              return (
                <div className="bg-white border border-gray-100 rounded-xl px-3 py-2 shadow-lg text-xs">
                  <p className="font-semibold text-gray-900">{d.protein}g protein</p>
                  <p className="text-gray-500">{d.calories} kcal · {d.mealsCount} meal{d.mealsCount !== 1 ? "s" : ""}</p>
                </div>
              );
            }}
          />
          {targetProteinG && (
            <ReferenceLine y={targetProteinG} stroke="#9333ea" strokeDasharray="4 3" strokeWidth={1.5} />
          )}
          <Bar dataKey="protein" fill="#9333ea" radius={[4, 4, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
