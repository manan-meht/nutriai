"use client";

import React, { useEffect, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  recommendProteinGrams,
  DEFAULT_DASHBOARD_DATE_RANGE,
  dateRangeLabel,
  filterByDateRange,
  getDateRangeDayCount,
  type DashboardDateRange,
} from "@nutriai/dashboard-core";
import { proteinTargetG, calculateEnergyTargetRange, type FoodBalanceUserProfile } from "@nutriai/health-scoring";
import { InviteCard } from "@/components/shared/invites/InviteCard";
import { DateRangeSelector } from "@/components/shared/dashboard/DateRangeSelector";
import { FoodBalanceScoreCard } from "@/components/shared/dashboard/FoodBalanceScoreCard";
import { ShareCardsDashboardSection } from "@/components/shared/dashboard/ShareCardsDashboardSection";
import { FOOD_BALANCE_SCORE_ENABLED } from "@/lib/billing/feature-flags";
import { NUTRITION_GOAL_LABELS } from "@/lib/food-balance/goal-options";
import { metabolicSexFromGender } from "@/lib/food-balance/adapter";
import { MealPhotoModal } from "@/components/shared/dashboard/MealPhotoModal";
import { buildMealShareData, type MealShareData } from "@/lib/meal-share/types";
import { ProgressInsights } from "@/components/shared/ProgressInsights";
import { computeInsights } from "@/lib/insights";
import type { ViewerRole, DashboardPermissions } from "@/lib/dashboard/permissions";
import { permissionsForRole } from "@/lib/dashboard/permissions";
import type { ProfileDashboardData } from "@/lib/dashboard/profile-dashboard-types";
import type { MacroTargets } from "@nutriai/health-scoring";

const ActivityHeatmap = dynamic(() => import("@/components/gym/dashboard/ActivityHeatmap").then((m) => m.ActivityHeatmap), { ssr: false });
const MacronutrientSummary = dynamic(() => import("@/components/shared/dashboard/MacronutrientSummary").then((m) => m.MacronutrientSummary), { ssr: false });

const MEAL_EMOJIS: Record<string, string> = { breakfast: "🌅", lunch: "☀️", dinner: "🌙", snack: "🍎" };

/** Visual identity only — every *section* below is shared across roles;
 * this is just the color/copy/sizing tokens that differ (adults uses
 * CSS-var theming, gym uses hardcoded purple/gray Tailwind classes, matching
 * each product's existing look so this merge doesn't reskin either one). */
export interface ProfileDashboardTheme {
  headerBgClassName: string;
  headerTextClassName: string;
  headerSubTextClassName: string;
  headerButtonClassName: string;
  avatarBgClassName: string;
  avatarTextClassName: string;
  goalBadgeClassName: string;
  proteinTextClassName: string;
  pageBgClassName: string;
  containerMaxWidthClassName: string;
}

/** Copy that should read differently depending on who's looking —
 * "Participant view should feel like 'my health dashboard'; family/coach
 * view should feel like 'I am supporting this person.'" (see the greeting
 * and empty-state strings in particular). */
export interface ProfileDashboardCopy {
  greeting: (firstName: string) => string;
  editLabel: string;
  noMealsMessage: string;
  inviteTitle: (firstName: string) => string;
  inviteDescription: (firstName: string) => string;
}

export interface ProfileDashboardInviteConfig {
  load: () => Promise<any>;
  regenerate: () => Promise<any>;
  revoke: () => Promise<any>;
  onLinkOpened: () => Promise<any>;
}

export interface ProfileDashboardProps {
  role: ViewerRole;
  /** Defaults to permissionsForRole(role) — override only for a one-off
   * exception (e.g. a coach viewing a read-only archived client). */
  permissions?: DashboardPermissions;
  data: ProfileDashboardData;
  /** Omit for a viewer with no natural "back" destination — e.g. the
   * participant's own view, which is the top of their experience. */
  backHref?: string;
  theme: ProfileDashboardTheme;
  copy: ProfileDashboardCopy;
  /** Omit entirely (rather than passing null) to never show an invite
   * card for this role — e.g. the participant's own view. */
  invite?: ProfileDashboardInviteConfig;
  /** Rendered when the Edit affordance is used (gated on
   * permissions.canManageGoal) — the modal body itself stays
   * product-specific (EditContactModal vs EditClientModal have different
   * fields), so it's injected rather than built into this component. */
  renderEditModal?: (args: { onClose: () => void; onSaved: () => void }) => ReactNode;
  /** Product-specific content that isn't part of the shared section set
   * (e.g. the coach product's biomarkers section) — rendered inside the
   * same <main> container, after workouts/recent meals. */
  extraSections?: ReactNode;
}

export function ProfileDashboard({
  role,
  permissions = permissionsForRole(role),
  data,
  backHref,
  theme,
  copy,
  invite,
  renderEditModal,
  extraSections,
}: ProfileDashboardProps) {
  const { profile, meals, workouts, biomarkers } = data;
  const [showEdit, setShowEdit] = useState(false);
  const [dateRange, setDateRange] = useState<DashboardDateRange>(DEFAULT_DASHBOARD_DATE_RANGE);
  const [modalPhoto, setModalPhoto] = useState<{ url: string; label: string; shareData: MealShareData | null } | null>(null);
  const MEALS_PAGE_SIZE = 10;
  const [visibleMealCount, setVisibleMealCount] = useState(MEALS_PAGE_SIZE);
  const [activeMacroTargets, setActiveMacroTargets] = useState<MacroTargets | null>(null);
  const [macroTargetsRefreshKey, setMacroTargetsRefreshKey] = useState(0);
  const firstName = profile.fullName.split(" ")[0];
  const initials = profile.fullName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  const foodBalanceProfile: FoodBalanceUserProfile | undefined = profile.nutritionGoals && profile.nutritionGoals.length > 0
    ? {
        goals: profile.nutritionGoals as FoodBalanceUserProfile["goals"],
        dateOfBirth: profile.dateOfBirth,
        age: profile.age,
        heightCm: profile.heightCm,
        currentWeightKg: profile.weightKg,
        metabolicEquationSex: metabolicSexFromGender(profile.gender),
        activityLevel: profile.activityLevel as FoodBalanceUserProfile["activityLevel"],
        resistanceTraining: profile.resistanceTrainingStatus as FoodBalanceUserProfile["resistanceTraining"],
        targetWeightKg: profile.targetWeightKg,
      }
    : undefined;

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

  // Active macro targets (calories/protein/carbs/fat/fiber) — fetched from
  // the same contact/client route FoodBalanceScoreCard reads, since that's
  // where Tistra's recommendation vs. a user's saved override is resolved
  // (see resolveMacroTargets in src/lib/food-balance/adapter.ts). Falls
  // back to the older protein/calorie-only heuristics while loading or if
  // the feature flag is off, so this dashboard never regresses to "no
  // target at all".
  useEffect(() => {
    let cancelled = false;
    const path = role === "coach" ? `/api/gym/clients/${profile.id}` : `/api/adults/contacts/${profile.id}`;
    fetch(path)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { activeMacroTargets?: MacroTargets } | null) => {
        if (!cancelled && data?.activeMacroTargets) setActiveMacroTargets(data.activeMacroTargets);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [profile.id, role, macroTargetsRefreshKey]);

  const recommendedProteinG = recommendProteinGrams({
    weightKg: profile.weightKg,
    heightCm: profile.heightCm,
    age: profile.age,
    gender: profile.gender,
  });
  const proteinRange = foodBalanceProfile ? proteinTargetG(foodBalanceProfile) : null;
  const fallbackProteinTarget = proteinRange ? Math.round((proteinRange.lower + proteinRange.upper) / 2) : recommendedProteinG;
  const isRecommendedProtein = !proteinRange && !activeMacroTargets;
  const energyRange = foodBalanceProfile ? calculateEnergyTargetRange(foodBalanceProfile, foodBalanceProfile.goals) : null;
  const fallbackCalTarget = energyRange ? Math.round(energyRange.lowerKcal) : undefined;

  const proteinTarget = activeMacroTargets ? activeMacroTargets.protein.target : fallbackProteinTarget;
  const calTarget = activeMacroTargets ? activeMacroTargets.calories.target : fallbackCalTarget;
  const carbTarget = activeMacroTargets?.carbs.target;
  const fatTarget = activeMacroTargets?.fat.target;
  const fiberTarget = activeMacroTargets?.fiber.target;
  const proteinOk = proteinTarget ? avgProtein >= proteinTarget * 0.8 : null;
  const calOk = calTarget ? avgCalories >= calTarget * 0.8 : null;

  // ActivityHeatmap/computeInsights are typed against the gym product's
  // MealLog/WorkoutLog shapes (clientId-keyed) — structurally compatible
  // except for that one key name, so adapt rather than widen their types.
  const heatmapMeals = meals.map((m) => ({ ...m, clientId: m.profileId }));
  const insights = computeInsights(meals, { targetProteinG: proteinTarget, targetCaloriesMin: calTarget, product: role === "coach" ? "gym" : "adults" });

  const showInvite = !!invite && profile.relationshipType !== "self" && profile.mealCount === 0 && !profile.inviteAcceptedAt;

  // Health-markers completeness nudge — these are the fields Food Balance
  // Score / macro targets actually use to personalize (see
  // @nutriai/health-scoring's FoodBalanceUserProfile); missing any of them
  // means those features fall back to broader, less personalized ranges.
  const missingHealthFields = [
    !profile.age && "age",
    !profile.gender && "gender",
    !profile.weightKg && "weight",
    !profile.heightCm && "height",
    (!profile.activityLevel || profile.activityLevel === "unknown") && "activity level",
  ].filter((f): f is string => Boolean(f));

  return (
    <div className={`min-h-screen ${theme.pageBgClassName}`}>
      <header className={`${theme.headerBgClassName} px-4 sm:px-6 py-4 sticky top-0 z-10`}>
        <div className={`${theme.containerMaxWidthClassName} mx-auto flex items-center gap-3`}>
          {backHref && (
            <Link href={backHref} className={`${theme.headerSubTextClassName} hover:opacity-80 transition-opacity`}>
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
          )}
          <div className="flex items-center gap-3 flex-1">
            <div className={`w-9 h-9 rounded-full ${theme.avatarBgClassName} flex items-center justify-center flex-shrink-0`}>
              <span className={`text-sm font-bold ${theme.avatarTextClassName}`}>{initials}</span>
            </div>
            <div>
              <h1 className={`text-base font-bold ${theme.headerTextClassName} leading-tight`}>{profile.fullName}</h1>
              <p className={`text-xs ${theme.headerSubTextClassName}`}>
                {profile.relationship ? profile.relationship.charAt(0).toUpperCase() + profile.relationship.slice(1) : profile.whatsappNumber}
                {profile.age ? `, ${profile.age} years old` : ""}
              </p>
            </div>
          </div>
          {permissions.canManageGoal && (
            <button onClick={() => setShowEdit(true)} className={theme.headerButtonClassName}>
              {copy.editLabel}
            </button>
          )}
        </div>
      </header>

      {showEdit && renderEditModal?.({
        onClose: () => setShowEdit(false),
        onSaved: () => {
          setShowEdit(false);
          setMacroTargetsRefreshKey((k) => k + 1);
        },
      })}

      <main className={`${theme.containerMaxWidthClassName} mx-auto px-4 sm:px-6 py-6 space-y-6`}>

        {/* Health-markers completeness nudge — shown above everything else
            so it's the first thing a caregiver/participant sees when
            something's missing. */}
        {missingHealthFields.length > 0 && permissions.canManageGoal && (
          <div className="flex items-start justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm text-amber-800">
              Add {joinWithAnd(missingHealthFields)} so Tistra can give more accurate insights.
            </p>
            <button
              onClick={() => setShowEdit(true)}
              className="shrink-0 text-xs font-semibold text-amber-800 underline whitespace-nowrap"
            >
              Add details
            </button>
          </div>
        )}

        {/* WhatsApp-first invite — omitted entirely for roles that pass no
            `invite` prop (e.g. the participant's own view). */}
        {showInvite && invite && (
          <InviteCard
            title={copy.inviteTitle(firstName)}
            description={copy.inviteDescription(firstName)}
            load={invite.load}
            regenerate={invite.regenerate}
            revoke={invite.revoke}
            onLinkOpened={invite.onLinkOpened}
          />
        )}

        {/* Section 1 — greeting + date-range selector, goal shown inline. */}
        <div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900 leading-tight">{copy.greeting(firstName)}</h2>
              <p className="text-xs text-gray-400">Showing {dateRangeLabel(dateRange).toLowerCase()}</p>
            </div>
            <DateRangeSelector value={dateRange} onChange={setDateRange} />
          </div>
          <div className="flex items-center gap-2 mt-3">
            <span className={`text-xs font-semibold ${theme.goalBadgeClassName} rounded-full px-3 py-1`}>
              🎯 {profile.nutritionGoals && profile.nutritionGoals.length > 0
                ? profile.nutritionGoals.map((g) => NUTRITION_GOAL_LABELS[g] ?? g).join(", ")
                : "No goal set yet"}
            </span>
            {permissions.canManageGoal && (
              <button onClick={() => setShowEdit(true)} className="text-xs font-medium text-gray-400 underline">
                Edit
              </button>
            )}
          </div>
        </div>

        {/* Section 2 — Food Balance Score / insights. */}
        {FOOD_BALANCE_SCORE_ENABLED && permissions.canViewDetailedNutrition && (
          <FoodBalanceScoreCard {...(role === "coach" ? { clientId: profile.id } : { contactId: profile.id })} />
        )}

        {/* Section 2b — "Your wins" shareable accomplishment cards. */}
        {FOOD_BALANCE_SCORE_ENABLED && permissions.canViewDetailedNutrition && (
          <ShareCardsDashboardSection {...(role === "coach" ? { clientId: profile.id } : { contactId: profile.id })} />
        )}

        {/* Section 3 — macronutrient summary. */}
        {permissions.canViewDetailedNutrition && (
          <MacronutrientSummary
            meals={mealsInRange}
            days={rangeDays}
            targets={{ protein: proteinTarget, carbs: carbTarget, fat: fatTarget, fiber: fiberTarget }}
          />
        )}

        {/* Section 4 — key metric cards. */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <MetricCard
            icon="🍽️"
            iconColor="purple"
            label="Meals logged"
            value={`${mealsInRange.length}`}
            sub={`${daysLoggedInRange} of ${rangeDays} day${rangeDays === 1 ? "" : "s"}`}
            ok={rangeDays <= 1 ? undefined : daysLoggedInRange / rangeDays >= 0.7}
          />
          <MetricCard
            icon="🌱"
            iconColor="green"
            label="Avg protein/day"
            value={avgProtein > 0 ? `${avgProtein}g` : "—"}
            sub={`target: ${proteinTarget}g${isRecommendedProtein ? " (recommended)" : ""}`}
            ok={proteinOk ?? undefined}
          />
          <MetricCard
            icon="🔥"
            iconColor="orange"
            label="Avg calories/day"
            value={avgCalories > 0 ? `${avgCalories}` : "—"}
            sub={calTarget ? `target: ≥${calTarget}` : "kcal"}
            ok={calOk ?? undefined}
          />
        </div>

        {/* Section 5 — progress summary. */}
        {insights && <ProgressInsights insights={insights} variant={role === "coach" ? "gym" : "adults"} />}

        {/* Section 6 — meal activity heatmap (fixed 30-day window). */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">Meal activity – last 30 days</p>
          <ActivityHeatmap meals={heatmapMeals as any} workouts={(workouts as any) ?? []} days={30} />
        </div>

        {/* Section 7 — recent meals. */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Recent meals</p>
          {meals.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm bg-white rounded-2xl border border-gray-100">
              {copy.noMealsMessage}
            </div>
          ) : (
            <div className="space-y-3">
              {meals.slice(0, visibleMealCount).map((meal) => {
                const avgProt = Math.round((meal.totalProteinMin + meal.totalProteinMax) / 2);
                const avgCal = Math.round((meal.totalCaloriesMin + meal.totalCaloriesMax) / 2);
                const time = new Date(meal.loggedAt).toLocaleString("en-IN", {
                  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
                  timeZone: profile.timezone,
                });
                const emoji = MEAL_EMOJIS[meal.mealType] ?? "🍽️";
                return (
                  <div key={meal.id} className="flex items-start gap-3 bg-white rounded-xl border border-gray-100 p-3">
                    {meal.imageUrl && permissions.canViewMealPhotos ? (
                      // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not a local asset
                      <img
                        src={meal.imageUrl}
                        alt={`${meal.mealType} photo`}
                        onClick={() => setModalPhoto({ url: meal.imageUrl!, label: meal.mealType, shareData: buildMealShareData(meal) })}
                        className="w-12 h-12 rounded-lg object-cover flex-shrink-0 cursor-pointer"
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
                        <span className={`text-xs font-medium ${theme.proteinTextClassName}`}>{avgProt}g protein</span>
                        <span className="text-xs text-gray-400">{avgCal} kcal</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {visibleMealCount < meals.length && (
            <button
              onClick={() => setVisibleMealCount((c) => c + MEALS_PAGE_SIZE)}
              className="w-full mt-3 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Show more
            </button>
          )}
        </div>

        {/* Workouts — gym-only, present only when the caller supplies them. */}
        {workouts && workouts.length > 0 && (
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

        {extraSections}
      </main>

      {modalPhoto && permissions.canViewMealPhotos && (
        <MealPhotoModal
          url={modalPhoto.url}
          label={modalPhoto.label}
          shareData={modalPhoto.shareData}
          onClose={() => setModalPhoto(null)}
          // Self vs. family must be derived from *this contact's*
          // relationshipType, not the generic viewer `role` — role is
          // fixed per-route ("family_admin" for the whole adults
          // dashboard, including a caregiver's own self-tracked contact),
          // so using it here mislabeled a caregiver's own meals as
          // "My family member ..." instead of a pronoun-free self caption.
          audience={role === "coach" ? "coach" : profile.relationshipType === "self" ? "self" : "family"}
          relationship={profile.relationship}
        />
      )}
    </div>
  );
}

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

const ICON_BADGE_CLASSES: Record<"purple" | "green" | "orange" | "blue", string> = {
  purple: "bg-purple-50 text-purple-600",
  green: "bg-green-50 text-green-700",
  orange: "bg-orange-50 text-orange-600",
  blue: "bg-blue-50 text-blue-600",
};

function MetricCard({
  icon, iconColor, label, value, sub, ok,
}: { icon?: string; iconColor?: "purple" | "green" | "orange" | "blue"; label: string; value: string; sub?: string; ok?: boolean }) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        ok === true ? "bg-green-50 border-green-100" : ok === false ? "bg-orange-50 border-orange-100" : "bg-white border-gray-100"
      }`}
    >
      {icon && (
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm mb-2 ${ICON_BADGE_CLASSES[iconColor ?? "purple"]}`}>
          {icon}
        </div>
      )}
      <p className={`text-2xl font-bold mb-0.5 ${ok === true ? "text-green-700" : ok === false ? "text-orange-700" : "text-gray-900"}`}>
        {value}
      </p>
      <p className="text-xs font-medium text-gray-600">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}
