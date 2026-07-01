"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { GymClient, MealLog } from "@/app/(gym)/gym/dashboard/actions";
import { getClientMeals } from "@/app/(gym)/gym/dashboard/actions";
import { MealFeed } from "./MealFeed";

const WeeklyNutritionChart = dynamic(
  () => import("./WeeklyNutritionChart").then((m) => m.WeeklyNutritionChart),
  { ssr: false, loading: () => <div className="h-[140px] bg-gray-50 rounded-xl animate-pulse" /> }
);

interface Props {
  client: GymClient;
  onClose: () => void;
}

export function ClientDetailPanel({ client, onClose }: Props) {
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getClientMeals(client.id)
      .then(setMeals)
      .finally(() => setLoading(false));
  }, [client.id]);

  const activeGoal = client.goals.find((g) => g.status === "active");
  const initials = client.fullName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  const totalProtein7d = meals.reduce(
    (sum, m) => sum + Math.round((m.totalProteinMin + m.totalProteinMax) / 2),
    0
  );
  const avgProtein = meals.length ? Math.round(totalProtein7d / 7) : 0;
  const daysLogged = new Set(meals.map((m) => m.loggedAt.slice(0, 10))).size;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-lg bg-white h-full overflow-y-auto flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
              <span className="text-purple-700 font-bold text-sm">{initials}</span>
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">{client.fullName}</h2>
              <p className="text-xs text-gray-400">{client.whatsappNumber}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="flex-1 px-6 py-6 space-y-6">

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-3">
            <MiniStat label="Days logged" value={`${daysLogged}/7`} />
            <MiniStat label="Avg protein" value={`${avgProtein}g`} />
            <MiniStat label="Meals" value={`${meals.length}`} />
          </div>

          {/* Goal */}
          {activeGoal && (
            <div className="bg-purple-50 rounded-2xl p-4">
              <p className="text-xs font-semibold text-purple-600 uppercase tracking-widest mb-2">Active goal</p>
              <p className="text-sm font-semibold text-gray-900 mb-1">{activeGoal.title}</p>
              {activeGoal.description && (
                <p className="text-xs text-gray-500 mb-2">{activeGoal.description}</p>
              )}
              <div className="flex flex-wrap gap-3 text-xs text-gray-600">
                {activeGoal.targetProteinG && <span>🥩 {activeGoal.targetProteinG}g protein/day</span>}
                {activeGoal.targetCaloriesMin && activeGoal.targetCaloriesMax && (
                  <span>🔥 {activeGoal.targetCaloriesMin}–{activeGoal.targetCaloriesMax} kcal</span>
                )}
                {activeGoal.deadline && (
                  <span>📅 {new Date(activeGoal.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                )}
              </div>
            </div>
          )}

          {/* Physical stats */}
          {(client.weightKg || client.heightCm || client.bmi) && (
            <div className="grid grid-cols-3 gap-3">
              {client.weightKg && <MiniStat label="Weight" value={`${client.weightKg}kg`} />}
              {client.heightCm && <MiniStat label="Height" value={`${client.heightCm}cm`} />}
              {client.bmi && <MiniStat label="BMI" value={String(client.bmi)} />}
            </div>
          )}

          {/* Weekly chart */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">Last 7 days</p>
            {loading ? (
              <div className="h-[140px] bg-gray-50 rounded-xl animate-pulse" />
            ) : (
              <WeeklyNutritionChart meals={meals} targetProteinG={activeGoal?.targetProteinG} />
            )}
          </div>

          {/* Meal feed */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Recent meals</p>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-gray-50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : (
              <MealFeed meals={meals} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-xl px-3 py-3 text-center">
      <p className="text-base font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}
