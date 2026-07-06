"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AdultsContactDetails } from "@/app/(adults)/adults/dashboard/actions";
import { classifyMeal } from "@/lib/nutrition/food-classification";
import { applyHumanCorrection } from "@/lib/nutrition/human-corrections";
import { buildHabitDashboard } from "@/lib/nutrition/habit-insights";
import { recommendProteinGrams } from "@/lib/nutrition/protein-recommendation";
import { EditContactModal } from "@/components/adults/dashboard/EditContactModal";
import { InviteCard } from "@/components/shared/invites/InviteCard";
import { getOrCreateFamilyInvite, regenerateFamilyInvite, revokeFamilyInvite } from "@/app/(adults)/adults/dashboard/actions";
import {
  TrendCardGrid,
  MealTimelineSection,
  WeeklyFocusCard,
  HabitMomentumCard,
  FoodPatternSpectrumCard,
  WeeklyProgressBoard,
} from "@/components/shared/dashboard/HabitDashboardSections";

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
  const router = useRouter();
  const [showEdit, setShowEdit] = useState(false);
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

  // If the caregiver hasn't manually set a protein goal, fall back to a
  // general adult (or older-adult) recommendation based on weight/age/gender
  // rather than showing no target at all.
  const recommendedProteinG = recommendProteinGrams({
    weightKg: contact.weightKg,
    heightCm: contact.heightCm,
    age: contact.age,
    gender: contact.gender,
  });
  const proteinTarget = activeGoal?.targetProteinG ?? recommendedProteinG;
  const isRecommendedProtein = !activeGoal?.targetProteinG;
  const calTarget = activeGoal?.targetCaloriesMin;
  const proteinOk = proteinTarget ? avgProtein >= proteinTarget * 0.8 : null;
  const calOk = calTarget ? avgCalories >= calTarget * 0.8 : null;

  const classifiedMeals = meals.map((m) =>
    applyHumanCorrection(
      classifyMeal({ id: m.id, loggedAt: m.loggedAt, mealType: m.mealType, foods: m.foods, aiSummary: m.aiSummary }),
      m.humanCorrection
    )
  );
  const habitDashboard = buildHabitDashboard(classifiedMeals);

  return (
    <div className="min-h-screen bg-[var(--color-dashboard-surface)]">
      <header className="bg-[var(--color-dashboard-primary)] px-4 sm:px-6 py-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Link href="/adults/dashboard" className="text-white/70 hover:text-white transition-colors">
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex items-center gap-3 flex-1">
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-white">{initials}</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">{contact.fullName}</h1>
              <p className="text-xs text-white/70">
                {contact.relationship ? contact.relationship.charAt(0).toUpperCase() + contact.relationship.slice(1) : "Contact"}
                {contact.age ? `, ${contact.age} years old` : ""}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowEdit(true)}
            className="text-sm font-medium text-white/90 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg px-3 py-1.5 transition-colors"
          >
            Edit
          </button>
        </div>
      </header>

      {showEdit && (
        <EditContactModal
          contact={contact}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            router.refresh();
          }}
        />
      )}

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* WhatsApp-first invite — the caregiver shares this link
            themselves; the bot never messages first. Not shown for a
            caregiver's own self-tracked profile (handled by SelfSetupCard
            on the main dashboard instead). */}
        {contact.relationshipType !== "self" && (
          <InviteCard
            title={`Ask them to start Tistra on WhatsApp`}
            description={`Send ${contact.fullName.split(" ")[0]} this link — they message the bot, and you'll see them connected here right away.`}
            load={() => getOrCreateFamilyInvite(contact.id)}
            regenerate={() => regenerateFamilyInvite(contact.id)}
            revoke={() => revokeFamilyInvite(contact.id)}
          />
        )}

        {/* Habit-based insight cards */}
        <TrendCardGrid
          cards={[habitDashboard.proteinTrend, habitDashboard.balancedPlateTrend, habitDashboard.healthierDirectionTrend]}
        />

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
            sub={`target: ${proteinTarget}g${isRecommendedProtein ? " (recommended)" : ""}`}
            ok={proteinOk ?? undefined}
          />
          <HealthCard
            label="Avg calories/day"
            value={avgCalories > 0 ? `${avgCalories}` : "—"}
            sub={calTarget ? `target: ≥${calTarget}` : "kcal"}
            ok={calOk ?? undefined}
          />
        </div>

        {/* Goal */}
        <div className="bg-[var(--color-dashboard-primary-light)] rounded-2xl p-4">
          <p className="text-xs font-semibold text-[var(--color-dashboard-primary)] uppercase tracking-widest mb-2">Goal</p>
          <p className="font-semibold text-gray-900 mb-0.5">
            {activeGoal ? GOAL_LABELS[activeGoal.goalType] ?? activeGoal.goalType : "No goal set yet"}
          </p>
          {activeGoal?.description && <p className="text-sm text-gray-500 mb-2">{activeGoal.description}</p>}
          <div className="flex flex-wrap gap-3 text-sm">
            <GoalPill label="Protein" value={`${proteinTarget}g/day${isRecommendedProtein ? " (recommended)" : ""}`} />
            {activeGoal?.targetCaloriesMin && <GoalPill label="Min calories" value={`${activeGoal.targetCaloriesMin} kcal`} />}
            {activeGoal?.targetMealsPerDay && <GoalPill label="Meals/day" value={String(activeGoal.targetMealsPerDay)} />}
          </div>
          <button
            onClick={() => setShowEdit(true)}
            className="text-xs font-medium text-[var(--color-dashboard-primary)] underline mt-3"
          >
            Edit goal
          </button>
        </div>

        {/* Today's meal timeline */}
        <MealTimelineSection meals={classifiedMeals} />

        {/* Weekly focus habit */}
        <WeeklyFocusCard focus={habitDashboard.weeklyFocus} />

        {/* Habit Momentum + Food pattern spectrum */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <HabitMomentumCard momentum={habitDashboard.habitMomentum} />
          <FoodPatternSpectrumCard spectrum={habitDashboard.patternSpectrum} />
        </div>

        {/* Weekly progress board */}
        <WeeklyProgressBoard metrics={habitDashboard.weeklyProgress} />

        {/* Activity heatmap */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">Meal activity – last 30 days</p>
          <ActivityHeatmap meals={gymStyleMeals as any} workouts={[]} days={30} />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ProteinChart meals={gymStyleMeals as any} targetProteinG={proteinTarget} />
          <CalorieChart meals={gymStyleMeals as any} targetCaloriesMin={activeGoal?.targetCaloriesMin} targetCaloriesMax={activeGoal?.targetCaloriesMax} />
        </div>

        {/* Recent meals */}
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
                const emoji = MEAL_EMOJIS[meal.mealType] ?? "🍽️";
                return (
                  <div key={meal.id} className="flex items-start gap-3 bg-white rounded-xl border border-gray-100 p-3">
                    {meal.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not a local asset
                      <img
                        src={meal.imageUrl}
                        alt={`${meal.mealType} photo`}
                        className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                      />
                    ) : (
                      <span className="text-xl mt-0.5">{emoji}</span>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="text-sm font-medium text-gray-900 capitalize">{meal.mealType}</span>
                        <span className="text-xs text-gray-400 shrink-0">{time}</span>
                      </div>
                      <p className="text-xs text-gray-500 truncate">{meal.aiSummary ?? meal.foods.map((f: any) => f.name).join(", ")}</p>
                      <div className="flex gap-3 mt-1">
                        <span className="text-xs font-medium text-[var(--color-dashboard-primary)]">{avgProt}g protein</span>
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
    <div
      className={`rounded-2xl border p-4 ${
        ok === true
          ? "bg-[var(--color-status-good-bg)] border-transparent"
          : ok === false
            ? "bg-[var(--color-status-steady-bg)] border-transparent"
            : "bg-white border-gray-100"
      }`}
    >
      <p
        className={`text-2xl font-bold mb-0.5 ${
          ok === true ? "text-[var(--color-status-good-text)]" : ok === false ? "text-[var(--color-status-steady-text)]" : "text-gray-900"
        }`}
      >
        {value}
      </p>
      <p className="text-xs font-medium text-gray-600">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function GoalPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl px-3 py-2">
      <p className="text-xs text-[var(--color-dashboard-primary)]/70">{label}</p>
      <p className="text-sm font-semibold text-[var(--color-dashboard-primary)]">{value}</p>
    </div>
  );
}
