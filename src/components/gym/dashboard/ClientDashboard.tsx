"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { ClientDetails } from "@/app/(gym)/gym/dashboard/actions";
import { MealFeed } from "./MealFeed";
import { BiomarkerSection } from "./BiomarkerSection";
import { ProgressInsights } from "@/components/shared/ProgressInsights";
import { computeInsights } from "@/lib/insights";
import { InviteCard } from "@/components/shared/invites/InviteCard";
import { getOrCreateCoachClientInvite, regenerateCoachClientInvite, revokeCoachClientInvite, markCoachClientInviteLinkOpened } from "@/app/(gym)/gym/dashboard/actions";
import { DateRangeSelector } from "@/components/shared/dashboard/DateRangeSelector";
import {
  DEFAULT_DASHBOARD_DATE_RANGE,
  dateRangeLabel,
  filterByDateRange,
  getDateRangeDayCount,
  type DashboardDateRange,
} from "@/lib/dashboard/date-range";
import { classifyMeal } from "@/lib/nutrition/food-classification";
import { applyHumanCorrection } from "@/lib/nutrition/human-corrections";
import { buildHabitDashboard } from "@/lib/nutrition/habit-insights";
import {
  TrendCardGrid,
  MealTimelineSection,
  WeeklyFocusCard,
  HabitMomentumCard,
  FoodPatternSpectrumCard,
  WeeklyProgressBoard,
} from "@/components/shared/dashboard/HabitDashboardSections";

const ActivityHeatmap = dynamic(() => import("./ActivityHeatmap").then((m) => m.ActivityHeatmap), { ssr: false });
const MacronutrientSummary = dynamic(() => import("@/components/shared/dashboard/MacronutrientSummary").then((m) => m.MacronutrientSummary), { ssr: false });

const GOAL_LABELS: Record<string, string> = {
  weight_loss: "Weight loss", muscle_gain: "Muscle gain", fat_loss: "Fat loss",
  maintenance: "Maintenance", strength: "Strength", endurance: "Endurance", custom: "Custom",
};

export function ClientDashboard({ client, meals, workouts, biomarkers }: ClientDetails) {
  const [dateRange, setDateRange] = useState<DashboardDateRange>(DEFAULT_DASHBOARD_DATE_RANGE);
  // Multiple goals can be selected when adding a client — numeric targets
  // are shared and read off the first, but the header badge and goal card
  // below list every selected goal's title.
  const activeGoals = client.goals.filter((g) => g.status === "active");
  const activeGoal = activeGoals[0];
  const initials = client.fullName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  // Macronutrient summary uses the date-range selector below (matching the
  // adults/family dashboard); the top stat row intentionally stays a fixed
  // "this week" window since its cards are explicitly labeled as such.
  const mealsInRange = filterByDateRange(meals, dateRange);
  const earliestMealAt = meals.length ? new Date(meals[meals.length - 1].loggedAt) : undefined;
  const rangeDays = getDateRangeDayCount(dateRange, new Date(), earliestMealAt);

  // 7-day stats
  const since7 = new Date(); since7.setDate(since7.getDate() - 7);
  const meals7d = meals.filter((m) => new Date(m.loggedAt) >= since7);
  const workouts7d = workouts.filter((w) => new Date(w.loggedAt) >= since7);
  const daysActive7d = new Set([
    ...meals7d.map((m) => m.loggedAt.slice(0, 10)),
    ...workouts7d.map((w) => w.loggedAt.slice(0, 10)),
  ]).size;

  const avgProtein = meals7d.length
    ? Math.round(meals7d.reduce((s, m) => s + (m.totalProteinMin + m.totalProteinMax) / 2, 0) / 7)
    : 0;
  const avgCalories = meals7d.length
    ? Math.round(meals7d.reduce((s, m) => s + (m.totalCaloriesMin + m.totalCaloriesMax) / 2, 0) / 7)
    : 0;

  const proteinTarget = activeGoal?.targetProteinG;
  const insights = computeInsights(meals, {
    targetProteinG: activeGoal?.targetProteinG,
    targetCaloriesMin: activeGoal?.targetCaloriesMin,
    product: "gym",
  });
  const proteinPct = proteinTarget && avgProtein ? Math.round((avgProtein / proteinTarget) * 100) : null;

  // Habit dashboard — same trend cards / weekly focus / habit momentum /
  // food pattern spectrum / meal timeline the adults/family dashboard has,
  // built off the same generic classifyMeal + human-corrections pipeline
  // (gym's actions.ts now fetches corrections too, see getClientDetails).
  // Kept alongside the existing gym-specific ProgressInsights below rather
  // than replacing it — that's a different, pre-existing feature.
  const classifiedMeals = meals.map((m) =>
    applyHumanCorrection(
      classifyMeal({ id: m.id, loggedAt: m.loggedAt, mealType: m.mealType, foods: m.foods, aiSummary: m.aiSummary }),
      m.humanCorrection
    )
  );
  const habitDashboard = buildHabitDashboard(classifiedMeals);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <header className="bg-white border-b border-gray-100 px-4 sm:px-6 py-4 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/gym/dashboard" className="text-gray-400 hover:text-gray-700 transition-colors">
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex items-center gap-3 flex-1">
            <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-purple-700">{initials}</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900 leading-tight">{client.fullName}</h1>
              <p className="text-xs text-gray-400">{client.whatsappNumber}</p>
            </div>
          </div>
          {activeGoals.length > 0 && (
            <span className="hidden sm:block text-xs font-medium bg-purple-50 text-purple-700 px-3 py-1.5 rounded-full">
              {activeGoals.map((g) => GOAL_LABELS[g.goalType] ?? g.goalType).join(" · ")}
            </span>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* WhatsApp-first invite — the coach shares this link themselves;
            the bot never messages the client first. Hidden once the client
            is clearly already connected (sending meals) — otherwise a
            client whose invite was never formally "claimed" (e.g. test
            data seeded with a phone number directly, bypassing the
            JOIN COACHCLIENT flow) keeps showing a stale "Pending — waiting
            for them to message" even while actively being tracked. Mirrors
            the same mealCount-based guard already used on the adults
            dashboard's ContactDashboard. */}
        {client.mealCount === 0 && (
          <InviteCard
            title="Invite client on WhatsApp"
            description={`Send ${client.fullName.split(" ")[0]} this link — once they message the bot, they'll show up connected here.`}
            load={() => getOrCreateCoachClientInvite(client.id)}
            regenerate={() => regenerateCoachClientInvite(client.id)}
            revoke={() => revokeCoachClientInvite(client.id)}
            onLinkOpened={() => markCoachClientInviteLinkOpened(client.id)}
          />
        )}

        {/* Habit-based insight cards — kept near the top, mirroring the
            adults/family dashboard, so the "so what" is visible before the
            raw numbers below. */}
        <TrendCardGrid
          cards={[habitDashboard.proteinTrend, habitDashboard.balancedPlateTrend, habitDashboard.healthierDirectionTrend]}
        />

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon="🍽️" iconColor="purple" label="Meals this week" value={String(meals7d.length)} sub={`of ${activeGoal?.targetMealsPerDay ? activeGoal.targetMealsPerDay * 7 : "—"} target`} />
          <StatCard
            icon="🌱"
            iconColor="green"
            label="Avg protein/day"
            value={`${avgProtein}g`}
            sub={proteinPct !== null ? `${proteinPct}% of target` : "no target set"}
            highlight={proteinPct !== null && proteinPct >= 80}
          />
          <StatCard icon="🔥" iconColor="orange" label="Avg calories/day" value={avgCalories > 0 ? String(avgCalories) : "—"} sub="kcal" />
          <StatCard icon="💪" iconColor="blue" label="Active days" value={`${daysActive7d}/7`} sub={`${workouts7d.length} workout${workouts7d.length !== 1 ? "s" : ""}`} />
        </div>

        {/* Progress insights */}
        {insights && <ProgressInsights insights={insights} variant="gym" />}

        {/* Goal card */}
        {activeGoal && (
          <div className="bg-purple-50 rounded-2xl p-4 flex flex-wrap gap-4 items-start">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-purple-600 uppercase tracking-widest mb-1">
                {activeGoals.length > 1 ? "Active goals" : "Active goal"}
              </p>
              <p className="font-semibold text-gray-900">{activeGoals.map((g) => g.title).join(" · ")}</p>
              {activeGoal.description && <p className="text-sm text-gray-500 mt-0.5">{activeGoal.description}</p>}
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              {activeGoal.targetProteinG && <GoalStat label="Protein" value={`${activeGoal.targetProteinG}g/day`} />}
              {activeGoal.targetCaloriesMin && activeGoal.targetCaloriesMax && (
                <GoalStat label="Calories" value={`${activeGoal.targetCaloriesMin}–${activeGoal.targetCaloriesMax}`} />
              )}
              {activeGoal.targetWeightKg && <GoalStat label="Target weight" value={`${activeGoal.targetWeightKg}kg`} />}
              {activeGoal.deadline && (
                <GoalStat label="Deadline" value={new Date(activeGoal.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} />
              )}
            </div>
          </div>
        )}

        {/* Today's meal timeline */}
        <MealTimelineSection meals={classifiedMeals} />

        {/* Weekly focus habit */}
        <WeeklyFocusCard focus={habitDashboard.weeklyFocus} />

        {/* Habit Momentum + Food pattern spectrum */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <HabitMomentumCard momentum={habitDashboard.habitMomentum} />
          <FoodPatternSpectrumCard spectrum={habitDashboard.patternSpectrum} />
        </div>

        {/* Activity heatmap */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">Last 30 days</p>
          <ActivityHeatmap meals={meals} workouts={workouts} days={30} />
        </div>

        {/* Macronutrient summary — same unified component the adults/family
            dashboard uses (protein, carbs, fat, and fiber), replacing the
            old separate Protein/Calorie/Carbs+Fat charts so both products
            show the same breakdown instead of gym missing fiber entirely. */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-gray-400">Showing {dateRangeLabel(dateRange).toLowerCase()}</p>
          <DateRangeSelector value={dateRange} onChange={setDateRange} />
        </div>
        <MacronutrientSummary
          meals={mealsInRange}
          days={rangeDays}
          targets={{ protein: activeGoal?.targetProteinG }}
        />

        {/* Weekly / range progress board */}
        <WeeklyProgressBoard metrics={habitDashboard.weeklyProgress} />

        {/* Workouts */}
        {workouts.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Recent workouts</p>
            <div className="space-y-2">
              {workouts.slice(0, 5).map((w) => (
                <div key={w.id} className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 px-4 py-3">
                  <span className="text-xl">💪</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{w.description ?? w.workoutType ?? "Workout"}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(w.loggedAt).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                      {w.durationMinutes ? ` · ${w.durationMinutes} min` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Biomarkers */}
        <BiomarkerSection
          clientId={client.id}
          heightCm={client.heightCm}
          trackedBiomarkers={client.trackedBiomarkers}
          biomarkers={biomarkers}
        />

        {/* Meal feed */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Recent meals</p>
          <MealFeed meals={meals} />
        </div>
      </main>
    </div>
  );
}

const GYM_ICON_BADGE_CLASSES: Record<"purple" | "green" | "orange" | "blue", string> = {
  purple: "bg-purple-50 text-purple-600",
  green: "bg-green-50 text-green-700",
  orange: "bg-orange-50 text-orange-600",
  blue: "bg-blue-50 text-blue-600",
};

function StatCard({
  icon, iconColor, label, value, sub, highlight,
}: { icon?: string; iconColor?: "purple" | "green" | "orange" | "blue"; label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${highlight ? "bg-green-50 border-green-100" : "bg-white border-gray-100"}`}>
      {icon && (
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm mb-2 ${GYM_ICON_BADGE_CLASSES[iconColor ?? "purple"]}`}>
          {icon}
        </div>
      )}
      <p className={`text-2xl font-bold mb-0.5 ${highlight ? "text-green-700" : "text-gray-900"}`}>{value}</p>
      <p className="text-xs font-medium text-gray-600">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function GoalStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-purple-500">{label}</p>
      <p className="text-sm font-semibold text-purple-900">{value}</p>
    </div>
  );
}
