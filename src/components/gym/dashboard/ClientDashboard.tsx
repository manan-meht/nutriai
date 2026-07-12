"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ClientDetails } from "@/app/(gym)/gym/dashboard/actions";
import { BiomarkerSection } from "./BiomarkerSection";
import { ProgressInsights } from "@/components/shared/ProgressInsights";
import { computeInsights } from "@/lib/insights";
import { InviteCard } from "@/components/shared/invites/InviteCard";
import { getOrCreateCoachClientInvite, regenerateCoachClientInvite, revokeCoachClientInvite, markCoachClientInviteLinkOpened } from "@/app/(gym)/gym/dashboard/actions";
import { DateRangeSelector } from "@/components/shared/dashboard/DateRangeSelector";
import { FoodBalanceScoreCard } from "@/components/shared/dashboard/FoodBalanceScoreCard";
import { FOOD_BALANCE_SCORE_ENABLED } from "@/lib/billing/feature-flags";
import { EditClientModal } from "./EditClientModal";
import { NUTRITION_GOAL_LABELS } from "@/lib/food-balance/goal-options";
import { MealPhotoModal } from "@/components/shared/dashboard/MealPhotoModal";
import {
  DEFAULT_DASHBOARD_DATE_RANGE,
  dateRangeLabel,
  filterByDateRange,
  getDateRangeDayCount,
  type DashboardDateRange,
} from "@nutriai/dashboard-core";
import { proteinTargetG, calculateEnergyTargetRange, type FoodBalanceUserProfile } from "@nutriai/health-scoring";

const ActivityHeatmap = dynamic(() => import("./ActivityHeatmap").then((m) => m.ActivityHeatmap), { ssr: false });
const MacronutrientSummary = dynamic(() => import("@/components/shared/dashboard/MacronutrientSummary").then((m) => m.MacronutrientSummary), { ssr: false });

export function ClientDashboard({ client, meals, workouts, biomarkers }: ClientDetails) {
  const router = useRouter();
  const [dateRange, setDateRange] = useState<DashboardDateRange>(DEFAULT_DASHBOARD_DATE_RANGE);
  const [showEdit, setShowEdit] = useState(false);
  const initials = client.fullName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  // Food Balance Score profile — replaces the old gym_client_goals manual
  // targets. Protein/calorie targets below are computed from this (via
  // @nutriai/health-scoring) rather than typed in by hand.
  const foodBalanceProfile: FoodBalanceUserProfile | undefined = client.primaryNutritionGoal
    ? {
        goal: client.primaryNutritionGoal as FoodBalanceUserProfile["goal"],
        dateOfBirth: client.dateOfBirth,
        age: client.age,
        heightCm: client.heightCm,
        currentWeightKg: client.weightKg,
        metabolicEquationSex: client.metabolicEquationSex as FoodBalanceUserProfile["metabolicEquationSex"],
        activityLevel: client.activityLevel as FoodBalanceUserProfile["activityLevel"],
        resistanceTraining: client.resistanceTrainingStatus as FoodBalanceUserProfile["resistanceTraining"],
        targetWeightKg: client.targetWeightKg,
      }
    : undefined;
  const proteinRange = foodBalanceProfile ? proteinTargetG(foodBalanceProfile) : null;
  const energyRange = foodBalanceProfile ? calculateEnergyTargetRange(foodBalanceProfile, foodBalanceProfile.goal) : null;

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
  const daysLoggedIn7d = new Set(meals7d.map((m) => m.loggedAt.slice(0, 10))).size;

  const avgProtein = meals7d.length
    ? Math.round(meals7d.reduce((s, m) => s + (m.totalProteinMin + m.totalProteinMax) / 2, 0) / 7)
    : 0;
  const avgCalories = meals7d.length
    ? Math.round(meals7d.reduce((s, m) => s + (m.totalCaloriesMin + m.totalCaloriesMax) / 2, 0) / 7)
    : 0;

  const proteinTarget = proteinRange ? Math.round((proteinRange.lower + proteinRange.upper) / 2) : undefined;
  const calTarget = energyRange ? Math.round(energyRange.lowerKcal) : undefined;
  const insights = computeInsights(meals, {
    targetProteinG: proteinTarget,
    targetCaloriesMin: calTarget,
    product: "gym",
  });
  const proteinPct = proteinTarget && avgProtein ? Math.round((avgProtein / proteinTarget) * 100) : null;

  const [modalPhoto, setModalPhoto] = useState<{ url: string; label: string } | null>(null);

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
          <button
            onClick={() => setShowEdit(true)}
            className="text-sm font-medium text-gray-500 hover:text-gray-800 bg-gray-50 hover:bg-gray-100 rounded-lg px-3 py-1.5 transition-colors"
          >
            Edit
          </button>
        </div>
      </header>

      {showEdit && (
        <EditClientModal
          client={client}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            router.refresh();
          }}
        />
      )}

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

        {/* Section 1 — greeting + date-range selector, with the goal shown
            inline (no separate goal card) — mirrors ContactDashboard.tsx on
            the adults product exactly. */}
        <div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900 leading-tight">Hi, {client.fullName.split(" ")[0]} 👋</h2>
              <p className="text-xs text-gray-400">Showing {dateRangeLabel(dateRange).toLowerCase()}</p>
            </div>
            <DateRangeSelector value={dateRange} onChange={setDateRange} />
          </div>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs font-semibold text-purple-700 bg-purple-50 rounded-full px-3 py-1">
              🎯 {client.primaryNutritionGoal ? NUTRITION_GOAL_LABELS[client.primaryNutritionGoal] ?? client.primaryNutritionGoal : "No goal set yet"}
            </span>
            <button onClick={() => setShowEdit(true)} className="text-xs font-medium text-gray-400 underline">
              Edit
            </button>
          </div>
        </div>

        {/* Section 2 — Food Balance Score, recommendations included inside
            the card itself once they're available. */}
        {FOOD_BALANCE_SCORE_ENABLED && <FoodBalanceScoreCard clientId={client.id} />}

        {/* Section 3 — Macronutrient summary (protein, carbs, fat, fiber). */}
        <MacronutrientSummary
          meals={mealsInRange}
          days={rangeDays}
          targets={{ protein: proteinTarget }}
        />

        {/* Section 4 — key metric cards (same 3-card set as the adults
            dashboard; the gym-only "Active days" card moved out to keep
            these two dashboards in parity). */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard icon="🍽️" iconColor="purple" label="Meals logged" value={String(meals7d.length)} sub={`${daysLoggedIn7d} of 7 days`} />
          <StatCard
            icon="🌱"
            iconColor="green"
            label="Avg protein/day"
            value={avgProtein > 0 ? `${avgProtein}g` : "—"}
            sub={proteinTarget ? `target: ${proteinTarget}g` : "no target set"}
            highlight={proteinPct !== null && proteinPct >= 80}
          />
          <StatCard icon="🔥" iconColor="orange" label="Avg calories/day" value={avgCalories > 0 ? String(avgCalories) : "—"} sub={calTarget ? `target: ≥${calTarget}` : "kcal"} />
        </div>

        {/* Progress insights — gym-only, kept as supplementary content. */}
        {insights && <ProgressInsights insights={insights} variant="gym" />}

        {/* Section 5 — activity heatmap. */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">Meal activity – last 30 days</p>
          <ActivityHeatmap meals={meals} workouts={workouts} days={30} />
        </div>

        {/* Section 6 — recent meals; tapping a meal's photo opens it in a
            modal (MealPhotoModal), same as the adults dashboard. */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Recent meals</p>
          {meals.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm bg-white rounded-2xl border border-gray-100">
              No meals shared yet — they just need to send a WhatsApp photo!
            </div>
          ) : (
            <div className="space-y-3">
              {meals.slice(0, 10).map((meal) => {
                const avgProt = Math.round((meal.totalProteinMin + meal.totalProteinMax) / 2);
                const avgCal = Math.round((meal.totalCaloriesMin + meal.totalCaloriesMax) / 2);
                const time = new Date(meal.loggedAt).toLocaleString("en-IN", {
                  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
                });
                return (
                  <div key={meal.id} className="flex items-start gap-3 bg-white rounded-xl border border-gray-100 p-3">
                    {meal.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not a local asset
                      <img
                        src={meal.imageUrl}
                        alt={`${meal.mealType} photo`}
                        onClick={() => setModalPhoto({ url: meal.imageUrl!, label: meal.mealType })}
                        className="w-12 h-12 rounded-lg object-cover flex-shrink-0 cursor-pointer"
                      />
                    ) : (
                      <span className="text-xl mt-0.5">🍽️</span>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="text-sm font-medium text-gray-900 capitalize">{meal.mealType}</span>
                        <span className="text-xs text-gray-400 shrink-0">{time}</span>
                      </div>
                      <p className="text-xs text-gray-500 truncate">{meal.aiSummary ?? meal.foods.map((f: any) => f.name).join(", ")}</p>
                      <div className="flex gap-3 mt-1">
                        <span className="text-xs font-medium text-purple-700">{avgProt}g protein</span>
                        <span className="text-xs text-gray-400">{avgCal} kcal</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Workouts — gym-only, kept as supplementary content. */}
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

        {/* Biomarkers — gym-only, kept as supplementary content. */}
        <BiomarkerSection
          clientId={client.id}
          heightCm={client.heightCm}
          trackedBiomarkers={client.trackedBiomarkers}
          biomarkers={biomarkers}
        />
      </main>

      {modalPhoto && <MealPhotoModal url={modalPhoto.url} label={modalPhoto.label} onClose={() => setModalPhoto(null)} />}
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
