"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
} from "recharts";
import type { MealLog } from "@/app/(gym)/gym/dashboard/actions";

interface Props {
  meals: MealLog[];
  targetProteinG?: number;
  targetCaloriesMin?: number;
  targetCaloriesMax?: number;
  days?: number;
}

function buildDayData(meals: MealLog[], days: number) {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-IN", { weekday: "short" });

    const dayMeals = meals.filter((m) => m.loggedAt.slice(0, 10) === key);
    const protein = dayMeals.length
      ? Math.round(dayMeals.reduce((s, m) => s + (m.totalProteinMin + m.totalProteinMax) / 2, 0))
      : 0;
    const calories = dayMeals.length
      ? Math.round(dayMeals.reduce((s, m) => s + (m.totalCaloriesMin + m.totalCaloriesMax) / 2, 0))
      : 0;
    const carbs = dayMeals.length
      ? Math.round(dayMeals.reduce((s, m) => s + (m.totalCarbsMin + m.totalCarbsMax) / 2, 0))
      : 0;
    const fat = dayMeals.length
      ? Math.round(dayMeals.reduce((s, m) => s + (m.totalFatMin + m.totalFatMax) / 2, 0))
      : 0;

    return { label, protein, calories, carbs, fat, mealCount: dayMeals.length };
  });
}

export function ProteinChart({ meals, targetProteinG, days = 7 }: Props) {
  const data = buildDayData(meals, days);
  const max = Math.max(...data.map((d) => d.protein), targetProteinG ?? 0, 40);

  return (
    <ChartShell title="Protein (g)" badge={targetProteinG ? `Target: ${targetProteinG}g` : undefined}>
      <ResponsiveContainer width="100%" height={160}>
        <ComposedChart data={data} margin={{ top: 4, right: 0, left: -22, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#f0f0f0" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} domain={[0, max + 20]} />
          <Tooltip content={<MacroTooltip unit="g" field="protein" />} />
          {targetProteinG && (
            <ReferenceLine y={targetProteinG} stroke="#9333ea" strokeDasharray="4 3" strokeWidth={1.5} />
          )}
          <Bar dataKey="protein" fill="#9333ea" radius={[4, 4, 0, 0]} maxBarSize={32} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

export function CalorieChart({ meals, targetCaloriesMin, targetCaloriesMax, days = 7 }: Props) {
  const data = buildDayData(meals, days);
  const max = Math.max(...data.map((d) => d.calories), targetCaloriesMax ?? 0, 500);

  return (
    <ChartShell title="Calories (kcal)" badge={targetCaloriesMin && targetCaloriesMax ? `Target: ${targetCaloriesMin}–${targetCaloriesMax}` : undefined}>
      <ResponsiveContainer width="100%" height={160}>
        <ComposedChart data={data} margin={{ top: 4, right: 0, left: -10, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#f0f0f0" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} domain={[0, max + 100]} />
          <Tooltip content={<MacroTooltip unit="kcal" field="calories" />} />
          {targetCaloriesMin && targetCaloriesMax && (
            <ReferenceArea y1={targetCaloriesMin} y2={targetCaloriesMax} fill="#9333ea" fillOpacity={0.07} />
          )}
          <Bar dataKey="calories" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={32} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

export function CarbsFatChart({ meals, days = 7 }: Props) {
  const data = buildDayData(meals, days);

  return (
    <ChartShell title="Carbs & Fat (g)">
      <ResponsiveContainer width="100%" height={160}>
        <ComposedChart data={data} margin={{ top: 4, right: 0, left: -22, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#f0f0f0" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload;
              return (
                <div className="bg-white border border-gray-100 rounded-xl px-3 py-2 shadow-lg text-xs space-y-0.5">
                  <p className="text-amber-600 font-medium">{d.carbs}g carbs</p>
                  <p className="text-pink-600 font-medium">{d.fat}g fat</p>
                </div>
              );
            }}
          />
          <Bar dataKey="carbs" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={16} />
          <Bar dataKey="fat" fill="#ec4899" radius={[4, 4, 0, 0]} maxBarSize={16} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

function ChartShell({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-700">{title}</p>
        {badge && <span className="text-xs text-purple-600 font-medium">{badge}</span>}
      </div>
      {children}
    </div>
  );
}

function MacroTooltip({ active, payload, unit, field }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-gray-100 rounded-xl px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-gray-900">{d[field]}{unit}</p>
      <p className="text-gray-400">{d.mealCount} meal{d.mealCount !== 1 ? "s" : ""}</p>
    </div>
  );
}
