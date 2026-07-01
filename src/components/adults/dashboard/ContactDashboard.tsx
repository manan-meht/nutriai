"use client";

import React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { AdultsContactDetails } from "@/app/(adults)/adults/dashboard/actions";
import { ProgressInsights } from "@/components/shared/ProgressInsights";
import { computeInsights } from "@/lib/insights";

const ActivityHeatmap = dynamic(() => import("@/components/gym/dashboard/ActivityHeatmap").then((m) => m.ActivityHeatmap), { ssr: false });
const ProteinChart = dynamic(() => import("@/components/gym/dashboard/MacroCharts").then((m) => m.ProteinChart), { ssr: false });
const CalorieChart = dynamic(() => import("@/components/gym/dashboard/MacroCharts").then((m) => m.CalorieChart), { ssr: false });

const GOAL_LABELS: Record<string, string> = {
  eat_enough: "Eat enough food", enough_protein: "Enough protein", increase_protein: "More protein",
  reduce_carbs: "Fewer carbs", balanced_meals: "Balanced meals", weight_gain: "Weight gain",
  hydration: "Hydration", custom: "Custom",
};

const MEAL_EMOJIS: Record<string, string> = { breakfast: "🌅", lunch: "☀️", dinner: "🌙", snack: "🍎" };

export function ContactDashboard({ contact, meals }: AdultsContactDetails) {
  const activeGoal = contact.goals.find((g) => g.status === "active");
  const initials = contact.fullName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  const since7 = new Date(); since7.setDate(since7.getDate() - 7);
  const meals7d = meals.filter((m) => new Date(m.loggedAt) >= since7);
  const daysLogged7d = new Set(meals7d.map((m) => m.loggedAt.slice(0, 10))).size;

  const avgProtein = meals7d.length
    ? Math.round(meals7d.reduce((s, m) => s + (m.totalProteinMin + m.totalProteinMax) / 2, 0) / 7)
    : 0;
  const avgCalories = meals7d.length
    ? Math.round(meals7d.reduce((s, m) => s + (m.totalCaloriesMin + m.totalCaloriesMax) / 2, 0) / 7)
    : 0;

  // Adapt meals type for shared components (gym meal logs shape)
  const gymStyleMeals = meals.map((m) => ({
    ...m,
    clientId: m.contactId,
    totalCarbsMin: m.totalCarbsMin,
    totalCarbsMax: m.totalCarbsMax,
    totalFatMin: m.totalFatMin,
    totalFatMax: m.totalFatMax,
  }));

  const proteinTarget = activeGoal?.targetProteinG;
  const calTarget = activeGoal?.targetCaloriesMin;
  const proteinOk = proteinTarget ? avgProtein >= proteinTarget * 0.8 : null;
  const calOk = calTarget ? avgCalories >= calTarget * 0.8 : null;
  const insights = computeInsights(gymStyleMeals, {
    targetProteinG: activeGoal?.targetProteinG,
    targetCaloriesMin: activeGoal?.targetCaloriesMin,
    product: "adults",
  });

  return (
    <div className="min-h-screen bg-rose-50/40">
      <header className="bg-white border-b border-gray-100 px-4 sm:px-6 py-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Link href="/adults/dashboard" className="text-gray-400 hover:text-gray-700 transition-colors">
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex items-center gap-3 flex-1">
            <div className="w-9 h-9 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-rose-700">{initials}</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900 leading-tight">{contact.fullName}</h1>
              <p className="text-xs text-gray-400">
                {contact.relationship ? contact.relationship.charAt(0).toUpperCase() + contact.relationship.slice(1) : "Contact"}
                {contact.age ? `, ${contact.age} years old` : ""}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Health summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <HealthCard
            label="Meals this week"
            value={`${meals7d.length}`}
            sub={`${daysLogged7d} of 7 days`}
            ok={daysLogged7d >= 5}
          />
          <HealthCard
            label="Avg protein/day"
            value={avgProtein > 0 ? `${avgProtein}g` : "—"}
            sub={proteinTarget ? `target: ${proteinTarget}g` : "no target"}
            ok={proteinOk ?? undefined}
          />
          <HealthCard
            label="Avg calories/day"
            value={avgCalories > 0 ? `${avgCalories}` : "—"}
            sub={calTarget ? `target: ≥${calTarget}` : "kcal"}
            ok={calOk ?? undefined}
          />
        </div>

        {/* Progress insights */}
        {insights && <ProgressInsights insights={insights} variant="adults" />}

        {/* Goal */}
        {activeGoal && (
          <div className="bg-rose-50 rounded-2xl p-4">
            <p className="text-xs font-semibold text-rose-600 uppercase tracking-widest mb-2">Goal</p>
            <p className="font-semibold text-gray-900 mb-0.5">{GOAL_LABELS[activeGoal.goalType] ?? activeGoal.goalType}</p>
            {activeGoal.description && <p className="text-sm text-gray-500 mb-2">{activeGoal.description}</p>}
            <div className="flex flex-wrap gap-3 text-sm">
              {activeGoal.targetProteinG && <GoalPill label="Protein" value={`${activeGoal.targetProteinG}g/day`} />}
              {activeGoal.targetCaloriesMin && <GoalPill label="Min calories" value={`${activeGoal.targetCaloriesMin} kcal`} />}
              {activeGoal.targetMealsPerDay && <GoalPill label="Meals/day" value={String(activeGoal.targetMealsPerDay)} />}
            </div>
          </div>
        )}

        {/* Activity heatmap */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">Meal activity – last 30 days</p>
          <ActivityHeatmap meals={gymStyleMeals as any} workouts={[]} days={30} />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ProteinChart meals={gymStyleMeals as any} targetProteinG={activeGoal?.targetProteinG} />
          <CalorieChart meals={gymStyleMeals as any} targetCaloriesMin={activeGoal?.targetCaloriesMin} targetCaloriesMax={activeGoal?.targetCaloriesMax} />
        </div>

        {/* Recent meals */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Recent meals</p>
          {meals.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm bg-white rounded-2xl border border-gray-100">
              No meals logged yet — they just need to send a WhatsApp photo!
            </div>
          ) : (
            <div className="space-y-3">
              {meals.slice(0, 10).map((meal) => {
                const avgProt = Math.round((meal.totalProteinMin + meal.totalProteinMax) / 2);
                const avgCal = Math.round((meal.totalCaloriesMin + meal.totalCaloriesMax) / 2);
                const time = new Date(meal.loggedAt).toLocaleString("en-IN", {
                  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
                });
                const emoji = MEAL_EMOJIS[meal.mealType] ?? "🍽️";
                return (
                  <div key={meal.id} className="flex items-start gap-3 bg-white rounded-xl border border-gray-100 p-3">
                    <span className="text-xl mt-0.5">{emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="text-sm font-medium text-gray-900 capitalize">{meal.mealType}</span>
                        <span className="text-xs text-gray-400 shrink-0">{time}</span>
                      </div>
                      <p className="text-xs text-gray-500 truncate">{meal.aiSummary ?? meal.foods.map((f: any) => f.name).join(", ")}</p>
                      <div className="flex gap-3 mt-1">
                        <span className="text-xs font-medium text-rose-600">{avgProt}g protein</span>
                        <span className="text-xs text-gray-400">{avgCal} kcal</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function HealthCard({ label, value, sub, ok }: { label: string; value: string; sub?: string; ok?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${ok === true ? "bg-green-50 border-green-100" : ok === false ? "bg-amber-50 border-amber-100" : "bg-white border-gray-100"}`}>
      <p className={`text-2xl font-bold mb-0.5 ${ok === true ? "text-green-700" : ok === false ? "text-amber-700" : "text-gray-900"}`}>{value}</p>
      <p className="text-xs font-medium text-gray-600">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function GoalPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl px-3 py-2">
      <p className="text-xs text-rose-400">{label}</p>
      <p className="text-sm font-semibold text-rose-900">{value}</p>
    </div>
  );
}
