"use client";

import type {
  ClassifiedMeal,
  TrendCard,
  WeeklyFocusHabit,
  HabitMomentum,
  PatternSpectrum,
  WeeklyProgressMetric,
  TrendMood,
} from "@nutriai/dashboard-core";

function moodClasses(mood: TrendMood) {
  switch (mood) {
    case "positive":
      return {
        bg: "bg-[var(--color-status-good-bg)]",
        text: "text-[var(--color-status-good-text)]",
        dot: "bg-[var(--color-status-good-dot)]",
        bar: "bg-[var(--color-status-good-dot)]",
        barFillPct: 100,
      };
    case "attention":
      return {
        bg: "bg-[var(--color-status-support-bg)]",
        text: "text-[var(--color-status-support-text)]",
        dot: "bg-[var(--color-status-support-dot)]",
        bar: "bg-[var(--color-status-support-dot)]",
        barFillPct: 25,
      };
    default:
      return {
        bg: "bg-[var(--color-status-steady-bg)]",
        text: "text-[var(--color-status-steady-text)]",
        dot: "bg-[var(--color-status-steady-dot)]",
        bar: "bg-[var(--color-status-steady-dot)]",
        barFillPct: 60,
      };
  }
}

const MEAL_LABELS: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  snack: "Snack",
  dinner: "Dinner",
};

const TREND_CARD_ICONS: Record<string, { icon: string; badge: string }> = {
  protein: { icon: "🥩", badge: "bg-[var(--color-dashboard-primary-light)] text-[var(--color-dashboard-primary)]" },
  balance: { icon: "🍽️", badge: "bg-[var(--color-status-good-bg)] text-[var(--color-status-good-text)]" },
  direction: { icon: "🧭", badge: "bg-[var(--color-status-steady-bg)] text-[var(--color-status-steady-text)]" },
};

/** Top-of-dashboard trend cards: protein, balanced plates, healthier direction. */
export function TrendCardGrid({ cards }: { cards: TrendCard[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {cards.map((card) => {
        const c = moodClasses(card.mood);
        const iconMeta = TREND_CARD_ICONS[card.key];
        return (
          <div key={card.key} className={`rounded-2xl p-4 ${c.bg}`}>
            <div className="flex items-center gap-2 mb-1.5">
              {iconMeta ? (
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${iconMeta.badge}`}>
                  {iconMeta.icon}
                </span>
              ) : (
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.dot}`} />
              )}
              <p className={`text-sm font-semibold ${c.text}`}>{card.title}</p>
            </div>
            <p className={`text-xs leading-relaxed ${c.text} opacity-90`}>{card.body}</p>
          </div>
        );
      })}
    </div>
  );
}

/** Today's meal timeline: breakfast -> lunch -> snack -> dinner. */
export function MealTimelineSection({ meals, timeZone = "UTC" }: { meals: ClassifiedMeal[]; timeZone?: string }) {
  // Pinned to an explicit IANA zone rather than toDateString()'s ambient
  // runtime-local zone — the server (edge, UTC) and the browser (the
  // contact's local zone) disagree on "today" near day boundaries
  // otherwise, producing different meal lists on SSR vs. hydration and
  // crashing React hydration for this whole section (error #418).
  const dateKey = (iso: string) =>
    new Date(iso).toLocaleDateString("en-CA", { timeZone });
  const today = dateKey(new Date().toISOString());
  const todaysMeals = meals.filter((m) => dateKey(m.loggedAt) === today);
  const order = ["breakfast", "lunch", "snack", "dinner"];
  const sorted = [...todaysMeals].sort(
    (a, b) => order.indexOf(a.mealType ?? "") - order.indexOf(b.mealType ?? "")
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <p className="text-xs font-semibold text-[var(--color-dashboard-primary)] uppercase tracking-widest mb-3">
        Today&apos;s meals
      </p>
      {sorted.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">No meals shared yet today.</p>
      ) : (
        <div className="space-y-3">
          {sorted.map((meal) => {
            const balanceMood: TrendMood =
              meal.mealBalanceStatus === "strong" ? "positive" : meal.mealBalanceStatus === "moderate" ? "neutral" : "attention";
            const c = moodClasses(balanceMood);
            const balanceLabel =
              meal.mealBalanceStatus === "strong" ? "Strong" : meal.mealBalanceStatus === "moderate" ? "Moderate" : "Needs support";
            return (
              <div key={meal.id} className="rounded-xl border border-gray-100 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-gray-900">{MEAL_LABELS[meal.mealType ?? ""] ?? "Meal"}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>{balanceLabel}</span>
                </div>
                <p className="text-xs text-gray-500 mb-2">{meal.foods.map((f) => f.name).join(", ") || "—"}</p>
                <div className="flex flex-wrap gap-2 mb-2">
                  <StatusChip label="Protein" status={meal.proteinAnchorStatus} />
                  <StatusChip label="Vegetable/fiber" status={meal.vegetableFiberStatus} />
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">{meal.suggestedNextStep}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusChip({ label, status }: { label: string; status: "missing" | "partial" | "present" }) {
  const mood: TrendMood = status === "present" ? "positive" : status === "partial" ? "neutral" : "attention";
  const c = moodClasses(mood);
  const statusLabel = status === "present" ? "Yes" : status === "partial" ? "Partial" : "Missing";
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>
      {label}: {statusLabel}
    </span>
  );
}

/** Weekly focus habit module. */
export function WeeklyFocusCard({ focus }: { focus: WeeklyFocusHabit | null }) {
  if (!focus) {
    return (
      <div className="bg-[var(--color-dashboard-primary-light)] rounded-2xl p-4">
        <p className="text-xs font-semibold text-[var(--color-dashboard-primary)] uppercase tracking-widest mb-1">This week&apos;s focus</p>
        <p className="text-sm text-gray-600">Keep sharing meals for a few more days so Tistra can suggest a focus habit.</p>
      </div>
    );
  }
  const pct = Math.min(100, Math.round((focus.currentCount / focus.targetCount) * 100));
  return (
    <div className="bg-[var(--color-dashboard-primary-light)] rounded-2xl p-4">
      <p className="text-xs font-semibold text-[var(--color-dashboard-primary)] uppercase tracking-widest mb-1">This week&apos;s focus</p>
      <p className="font-semibold text-gray-900 mb-2">{focus.title}</p>
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 rounded-full bg-white overflow-hidden">
          <div className="h-full rounded-full bg-[var(--color-dashboard-primary)]" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-sm font-semibold text-[var(--color-dashboard-primary)] whitespace-nowrap">
          {focus.currentCount} of {focus.targetCount} done
        </span>
      </div>
    </div>
  );
}

/** Habit Momentum — consistency-based, deliberately not called a "health score". */
export function HabitMomentumCard({ momentum }: { momentum: HabitMomentum }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-[var(--color-dashboard-primary)] uppercase tracking-widest">Habit Momentum</p>
        <span className="text-2xl font-bold text-[var(--color-dashboard-primary)]">{momentum.score}%</span>
      </div>
      <p className="text-sm text-gray-700 mb-1">{momentum.headline}</p>
      <p className="text-xs text-gray-500">{momentum.focus}</p>
    </div>
  );
}

/** Food pattern spectrum — visual, non-judgmental gradient. */
export function FoodPatternSpectrumCard({ spectrum }: { spectrum: PatternSpectrum }) {
  const steps: { key: PatternSpectrum["position"]; label: string }[] = [
    { key: "needs_support", label: "Needs support" },
    { key: "getting_stronger", label: "Getting stronger" },
    { key: "healthier_pattern", label: "Healthier pattern" },
  ];
  const activeIndex = steps.findIndex((s) => s.key === spectrum.position);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <p className="text-xs font-semibold text-[var(--color-dashboard-primary)] uppercase tracking-widest mb-3">Food pattern spectrum</p>
      <div className="flex items-center gap-1 mb-3">
        {steps.map((step, i) => (
          <div
            key={step.key}
            className={`flex-1 h-2 rounded-full ${i <= activeIndex ? "bg-[var(--color-dashboard-primary)]" : "bg-gray-100"}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-xs text-gray-500 mb-3">
        {steps.map((step) => (
          <span key={step.key} className={step.key === spectrum.position ? "font-semibold text-[var(--color-dashboard-primary)]" : ""}>
            {step.label}
          </span>
        ))}
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">{spectrum.note}</p>
    </div>
  );
}

/** Weekly progress board summary metrics. */
export function WeeklyProgressBoard({ metrics }: { metrics: WeeklyProgressMetric[] }) {
  if (metrics.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <p className="text-xs font-semibold text-[var(--color-dashboard-primary)] uppercase tracking-widest mb-2">Weekly progress</p>
        <p className="text-sm text-gray-400">Share a few meals on WhatsApp and Tistra will start showing trends.</p>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <p className="text-xs font-semibold text-[var(--color-dashboard-primary)] uppercase tracking-widest mb-3">Weekly progress</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {metrics.map((m) => {
          const c = moodClasses(m.mood);
          return (
            <div key={m.label} className="rounded-xl border border-gray-100 px-3 py-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm text-gray-800">{m.label}</p>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>{m.changeLabel}</span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mb-1">
                <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${c.barFillPct}%` }} />
              </div>
              <p className="text-xs text-gray-500">{m.thisWeekLabel}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
