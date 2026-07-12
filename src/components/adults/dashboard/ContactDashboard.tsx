"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AdultsContactDetails } from "@/app/(adults)/adults/dashboard/actions";
import {
  classifyMeal,
  applyHumanCorrection,
  buildHabitDashboard,
  recommendProteinGrams,
  DEFAULT_DASHBOARD_DATE_RANGE,
  dateRangeLabel,
  filterByDateRange,
  getDateRangeDayCount,
  type DashboardDateRange,
} from "@nutriai/dashboard-core";
import { EditContactModal } from "@/components/adults/dashboard/EditContactModal";
import { InviteCard } from "@/components/shared/invites/InviteCard";
import { DateRangeSelector } from "@/components/shared/dashboard/DateRangeSelector";
import { FoodBalanceScoreCard } from "@/components/shared/dashboard/FoodBalanceScoreCard";
import { FOOD_BALANCE_SCORE_ENABLED } from "@/lib/billing/feature-flags";
import {
  TrendCardGrid,
  MealTimelineSection,
  WeeklyFocusCard,
  HabitMomentumCard,
  FoodPatternSpectrumCard,
  WeeklyProgressBoard,
} from "@/components/shared/dashboard/HabitDashboardSections";

const ActivityHeatmap = dynamic(() => import("@/components/gym/dashboard/ActivityHeatmap").then((m) => m.ActivityHeatmap), { ssr: false });
const MacronutrientSummary = dynamic(() => import("@/components/shared/dashboard/MacronutrientSummary").then((m) => m.MacronutrientSummary), { ssr: false });

const GOAL_LABELS: Record<string, string> = {
  eat_enough: "Eat enough food", enough_protein: "Enough protein", increase_protein: "More protein",
  reduce_carbs: "Fewer carbs", balanced_meals: "Balanced meals", weight_gain: "Weight gain",
  hydration: "Hydration", custom: "Custom",
};

const MEAL_EMOJIS: Record<string, string> = { breakfast: "🌅", lunch: "☀️", dinner: "🌙", snack: "🍎" };

/** Plain fetch instead of a Server Action — Server Actions on this
 * deployment (Cloudflare Pages via @cloudflare/next-on-pages) intermittently
 * fail with "Server Action ... was not found on the server" because
 * different edge instances serving the same deployment can disagree on the
 * action's encryption key/manifest. A regular HTTP route sidesteps that
 * mechanism entirely. */
async function fetchInviteJson(url: string, init?: RequestInit): Promise<any> {
  try {
    const res = await fetch(url, init);
    const json = await res.json().catch(() => null);
    if (!json) return { error: "Couldn't reach the server. Please try again." };
    return json;
  } catch {
    return { error: "Couldn't reach the server. Please try again." };
  }
}

export function ContactDashboard({ contact, meals }: AdultsContactDetails) {
  const router = useRouter();
  const [showEdit, setShowEdit] = useState(false);
  const [dateRange, setDateRange] = useState<DashboardDateRange>(DEFAULT_DASHBOARD_DATE_RANGE);
  // Multiple goals can be selected when adding a contact (each becomes its
  // own row) — numeric targets (protein/calories/meals) are shared across
  // all of them and only ever read off the first, but the display below
  // lists every selected goal's title so nothing picked looks dropped.
  const activeGoals = contact.goals.filter((g) => g.status === "active");
  const activeGoal = activeGoals[0];
  const initials = contact.fullName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  const mealsInRange = filterByDateRange(meals, dateRange);
  const earliestMealAt = meals.length ? new Date(meals[meals.length - 1].loggedAt) : undefined;
  const rangeDays = getDateRangeDayCount(dateRange, new Date(), earliestMealAt);
  const daysLoggedInRange = new Set(mealsInRange.map((m) => m.loggedAt.slice(0, 10))).size;

  const avgProtein = mealsInRange.length
    ? Math.round(mealsInRange.reduce((s, m) => s + (m.totalProteinMin + m.totalProteinMax) / 2, 0) / rangeDays)
    : 0;
  const avgCalories = mealsInRange.length
    ? Math.round(mealsInRange.reduce((s, m) => s + (m.totalCaloriesMin + m.totalCaloriesMax) / 2, 0) / rangeDays)
    : 0;

  // Adapt meals type for shared components (gym meal logs shape) — used by
  // ActivityHeatmap, which is typed against the gym MealLog shape.
  // AdultsMealLog is already structurally assignable to MacronutrientSummary's
  // MacroMeal, so no adapter is needed there.
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

        {/* Food Balance Score — deliberately first, above the invite card,
            per the feature's "prominent card at the top of the dashboard"
            requirement. Behind a feature flag; the card itself also
            renders nothing while the flag is off (404 from the API). */}
        {FOOD_BALANCE_SCORE_ENABLED && <FoodBalanceScoreCard contactId={contact.id} />}

        {/* WhatsApp-first invite — the caregiver shares this link
            themselves; the bot never messages first. Not shown for a
            caregiver's own self-tracked profile (handled by SelfSetupCard
            on the main dashboard instead). */}
        {contact.relationshipType !== "self" && contact.mealCount === 0 && !contact.inviteAcceptedAt && (
          <InviteCard
            title={`Ask them to start Tistra on WhatsApp`}
            description={`Send ${contact.fullName.split(" ")[0]} this link — they message the bot, and you'll see them connected here right away.`}
            load={() => fetchInviteJson(`/api/adults/invites/family/${contact.id}`)}
            regenerate={() => fetchInviteJson(`/api/adults/invites/family/${contact.id}`, { method: "PATCH" })}
            revoke={() => fetchInviteJson(`/api/adults/invites/family/${contact.id}`, { method: "DELETE" })}
            onLinkOpened={() => fetchInviteJson(`/api/adults/invites/family/${contact.id}`, { method: "POST" })}
          />
        )}

        {/* Greeting + global date-range selector — everything below that's
            range-aware (metric cards, macro summary) reflects this. */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900 leading-tight">Hi, {contact.fullName.split(" ")[0]} 👋</h2>
            <p className="text-xs text-gray-400">Showing {dateRangeLabel(dateRange).toLowerCase()}</p>
          </div>
          <DateRangeSelector value={dateRange} onChange={setDateRange} />
        </div>

        {/* Habit-based insight cards — kept near the top so mobile users see
            the "so what" before the raw numbers below. */}
        <TrendCardGrid
          cards={[habitDashboard.proteinTrend, habitDashboard.balancedPlateTrend, habitDashboard.healthierDirectionTrend]}
        />

        {/* Key metric cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <HealthCard
            icon="🍽️"
            iconColor="purple"
            label="Meals logged"
            value={`${mealsInRange.length}`}
            sub={`${daysLoggedInRange} of ${rangeDays} day${rangeDays === 1 ? "" : "s"}`}
            ok={rangeDays <= 1 ? undefined : daysLoggedInRange / rangeDays >= 0.7}
          />
          <HealthCard
            icon="🌱"
            iconColor="green"
            label="Avg protein/day"
            value={avgProtein > 0 ? `${avgProtein}g` : "—"}
            sub={`target: ${proteinTarget}g${isRecommendedProtein ? " (recommended)" : ""}`}
            ok={proteinOk ?? undefined}
          />
          <HealthCard
            icon="🔥"
            iconColor="orange"
            label="Avg calories/day"
            value={avgCalories > 0 ? `${avgCalories}` : "—"}
            sub={calTarget ? `target: ≥${calTarget}` : "kcal"}
            ok={calOk ?? undefined}
          />
        </div>

        {/* Goal */}
        <div className="bg-[var(--color-dashboard-primary-light)] rounded-2xl p-4">
          <p className="text-xs font-semibold text-[var(--color-dashboard-primary)] uppercase tracking-widest mb-2">
            {activeGoals.length > 1 ? "Goals" : "Goal"}
          </p>
          <p className="font-semibold text-gray-900 mb-0.5">
            {activeGoals.length > 0
              ? activeGoals.map((g) => GOAL_LABELS[g.goalType] ?? g.goalType).join(" · ")
              : "No goal set yet"}
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
        <MealTimelineSection meals={classifiedMeals} timeZone={contact.timezone} />

        {/* Weekly focus habit */}
        <WeeklyFocusCard focus={habitDashboard.weeklyFocus} />

        {/* Habit Momentum + Food pattern spectrum */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <HabitMomentumCard momentum={habitDashboard.habitMomentum} />
          <FoodPatternSpectrumCard spectrum={habitDashboard.patternSpectrum} />
        </div>

        {/* Single unified macro section — protein, carbs, fat, fiber.
            Replaces the old separate Protein/Calories charts; calories
            stays as the top-level metric card above instead of being
            duplicated here. */}
        <MacronutrientSummary
          meals={mealsInRange}
          days={rangeDays}
          targets={{ protein: proteinTarget }}
        />

        {/* Weekly / range progress board */}
        <WeeklyProgressBoard metrics={habitDashboard.weeklyProgress} />

        {/* Activity heatmap — kept at a fixed 30-day window regardless of
            the date-range selector above, since a 90-day/1-year heatmap
            grid stops being scannable at this card size. */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">Meal activity – last 30 days</p>
          <ActivityHeatmap meals={gymStyleMeals as any} workouts={[]} days={30} />
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
                  timeZone: contact.timezone,
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

const ICON_BADGE_CLASSES: Record<"purple" | "green" | "orange" | "blue", string> = {
  purple: "bg-[var(--color-dashboard-primary-light)] text-[var(--color-dashboard-primary)]",
  green: "bg-[var(--color-status-good-bg)] text-[var(--color-status-good-text)]",
  orange: "bg-[var(--color-status-steady-bg)] text-[var(--color-status-steady-text)]",
  blue: "bg-blue-50 text-blue-600",
};

function HealthCard({
  icon, iconColor, label, value, sub, ok,
}: { icon?: string; iconColor?: "purple" | "green" | "orange" | "blue"; label: string; value: string; sub?: string; ok?: boolean }) {
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
      {icon && (
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm mb-2 ${ICON_BADGE_CLASSES[iconColor ?? "purple"]}`}>
          {icon}
        </div>
      )}
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
