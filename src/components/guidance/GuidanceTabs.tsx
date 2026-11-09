"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";

import type { NutritionGoal } from "@nutriai/health-scoring";

import {
  compare,
  datesBetween,
  daysIn,
  nutrientStats,
  periodFor,
  summarizeDays,
  type DaySummary,
  type DayStatus,
  type PeriodKind,
} from "@/lib/guidance/aggregation";
import { localDate, type NutrientDay } from "@/lib/guidance/daily-totals";
import { mealValues, NUTRIENTS, type NutrientKey } from "@/lib/guidance/meal-impact";
import type { GuidanceDashboard, GuidanceMealRow } from "@/lib/guidance/view";

import { formatDay } from "./GuidanceToday";

// Guidance mode's dashboard: two tabs, Today and Progress.
//
// Today says what to do next and where the day stands. Progress says how
// the week or month is going against the target, from one aggregation
// service (lib/guidance/aggregation.ts) so no two numbers disagree. Detail
// sits behind expanders so the main screen stays short.
//
// Phase 1 of the redesign: everything here works from data Tistra already
// records. Next-meal suggestions, the weekly habit and vitamins and
// minerals come in later phases. Until then their places say so plainly,
// rather than showing illustrative numbers.

export type GuidanceViewer = { kind: "self" } | { kind: "family"; name: string } | { kind: "coach"; name: string };

const fmt = (n: number) => n.toLocaleString("en-US");
const unitOf = (key: NutrientKey) => NUTRIENTS.find((n) => n.key === key)!.unit;
const labelOf = (key: NutrientKey) => (key === "calories" ? "Energy" : NUTRIENTS.find((n) => n.key === key)!.label);
const amount = (n: number, key: NutrientKey) => (unitOf(key) === "kcal" ? `${fmt(n)} kcal` : `${fmt(n)} g`);
/** Energy is rounded to 10 kcal so it doesn't look measured. Grams stay
 * whole: rounding them to 5 made two averages and their difference
 * disagree on screen ("50 g … 5 g more than 50 g"). */
const roughly = (n: number, key: NutrientKey) => (key === "calories" ? Math.round(n / 10) * 10 : Math.round(n));

const card = "rounded-2xl border border-[var(--gm-border)] bg-[var(--gm-card)] p-5";
const primaryAction =
  "inline-flex items-center justify-center rounded-xl bg-[var(--gm-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--gm-on-accent)] hover:bg-[var(--gm-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--gm-card)] transition";
const quietButton =
  "text-sm font-medium text-[var(--gm-accent-text)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)] rounded";

function timeIn(iso: string, timezone: string, opts: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: timezone }).format(new Date(iso));
  } catch {
    return "";
  }
}

function mealLabel(mealType: string | null): string {
  if (!mealType) return "Meal";
  return mealType.charAt(0).toUpperCase() + mealType.slice(1).replace(/_/g, " ");
}

/** Which meal is next, by the person's own clock. */
function nextMealSlot(generatedAt: string, timezone: string): string {
  const hour = Number(timeIn(generatedAt, timezone, { hour: "numeric", hour12: false }));
  if (!Number.isFinite(hour) || hour < 10) return "Breakfast";
  if (hour < 15) return "Lunch";
  if (hour < 18) return "Snack";
  return "Dinner";
}

function Bar({ day }: { day: NutrientDay }) {
  const pct = day.target > 0 ? Math.min(100, (day.consumed / day.target) * 100) : 0;
  return (
    <div className="h-2 rounded-full bg-[var(--gm-track)] overflow-hidden" aria-hidden="true">
      <div
        className={`h-full rounded-full ${day.over > 0 ? "bg-[var(--gm-over)]" : "bg-[var(--gm-accent)]"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function NutrientRow({ day, nutrient }: { day: NutrientDay; nutrient: NutrientKey }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-[var(--gm-text)]">{labelOf(nutrient)}</span>
        <span className="tabular-nums text-[var(--gm-text-secondary)]">
          {day.isIncomplete && "at least "}
          {fmt(day.consumed)} / {amount(day.target, nutrient)}
        </span>
      </div>
      <div className="mt-1.5">
        <Bar day={day} />
      </div>
    </div>
  );
}

// ─── Today ─────────────────────────────────────────────────────────────────

function NextMealCard({ guidance, viewer }: { guidance: GuidanceDashboard; viewer: GuidanceViewer }) {
  const totals = guidance.today?.totals;
  const title = viewer.kind === "self" ? "Your next meal" : `${viewer.name}'s next meal`;
  const slot = nextMealSlot(guidance.generatedAt, guidance.timezone);

  let body: ReactNode;
  if (!totals) {
    body = <p className="text-sm text-[var(--gm-text-secondary)]">There&apos;s no target for today, so there&apos;s nothing to plan against yet.</p>;
  } else if (totals.calories.remaining === 0) {
    body = <p className="text-sm text-[var(--gm-text-secondary)]">Today&apos;s energy target has been reached.</p>;
  } else {
    const energyLeft = totals.calories.remaining / totals.calories.target;
    const proteinLeft = totals.protein.remaining / totals.protein.target;
    body = (
      <>
        <p className="text-lg font-semibold text-[var(--gm-text)]">
          About {fmt(roughly(totals.calories.remaining, "calories"))} kcal and {fmt(roughly(totals.protein.remaining, "protein"))} g protein left today
        </p>
        {proteinLeft > energyLeft + 0.1 && (
          <p className="mt-1 text-sm text-[var(--gm-text-secondary)]">
            Protein has the most room left, so a meal built around a protein source fits best.
          </p>
        )}
        {totals.hasIncompleteData && (
          <p className="mt-1 text-xs text-[var(--gm-text-muted)]">Some meals are missing an estimate, so what&apos;s left may be less.</p>
        )}
      </>
    );
  }

  return (
    <section className={`${card} border-[var(--gm-accent-border)]`} aria-labelledby="next-meal-title">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="next-meal-title" className="text-xs font-medium uppercase tracking-wide text-[var(--gm-accent-text)]">
          {title}
        </h3>
        <span className="text-xs text-[var(--gm-text-muted)]">{slot}</span>
      </div>
      <div className="mt-2">{body}</div>
      <p className="mt-3 text-xs text-[var(--gm-text-muted)]">
        Specific meal suggestions, with portions, aren&apos;t available yet.
      </p>
    </section>
  );
}

function TodaySoFar({ guidance, viewer }: { guidance: GuidanceDashboard; viewer: GuidanceViewer }) {
  const totals = guidance.today?.totals;
  if (!totals) return null;
  const count = totals.mealCount;
  return (
    <section className={card} aria-labelledby="today-so-far-title">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="today-so-far-title" className="text-base font-semibold text-[var(--gm-text)]">
          Today so far
        </h3>
        <span className="text-xs text-[var(--gm-text-muted)]">
          {count === 0 ? "No meals logged yet" : `${count} ${count === 1 ? "meal" : "meals"} logged`} · day in progress
        </span>
      </div>
      <div className="mt-4 space-y-4">
        <NutrientRow day={totals.protein} nutrient="protein" />
        <NutrientRow day={totals.calories} nutrient="calories" />
      </div>
      <details className="mt-4 group">
        <summary className="cursor-pointer text-sm font-medium text-[var(--gm-text-secondary)] hover:text-[var(--gm-text)]">
          All nutrients
        </summary>
        <div className="mt-3 space-y-4">
          {(["carbs", "fat", "fiber"] as const).map((key) => (
            <NutrientRow key={key} day={totals[key]} nutrient={key} />
          ))}
        </div>
      </details>
      <div className="mt-5">
        {viewer.kind === "self" && guidance.logMealHref ? (
          <a href={guidance.logMealHref} target="_blank" rel="noopener noreferrer" className={primaryAction}>
            Log a meal
          </a>
        ) : (
          <p className="text-sm text-[var(--gm-text-secondary)]">
            {viewer.kind === "self"
              ? "Log a meal by sending a photo to Tistra on WhatsApp."
              : `${viewer.name} logs meals by sending a photo to Tistra on WhatsApp.`}
          </p>
        )}
      </div>
    </section>
  );
}

function MealDetail({ meal }: { meal: GuidanceMealRow }) {
  const values = mealValues(meal);
  return (
    <div className="space-y-1.5">
      {meal.foods.length > 0 && (
        <p className="text-sm text-[var(--gm-text-secondary)]">
          {meal.foods.map((f) => (f.quantity ? `${f.name} (${f.quantity})` : f.name)).join(", ")}
        </p>
      )}
      <p className="text-xs tabular-nums text-[var(--gm-text)]">
        {NUTRIENTS.map(({ key }) => {
          const v = values[key];
          return `${labelOf(key)} ${v == null ? "unknown" : `~${amount(roughly(v, key), key)}`}`;
        }).join(" · ")}
      </p>
    </div>
  );
}

function RecentMeal({ guidance, onShowAll }: { guidance: GuidanceDashboard; onShowAll: () => void }) {
  const meal = guidance.meals[0];
  if (!meal) return null;
  const values = mealValues(meal);
  const when = timeIn(meal.loggedAt, guidance.timezone, { weekday: "short", hour: "numeric", minute: "2-digit", hour12: true });
  return (
    <section className={card} aria-labelledby="recent-meal-title">
      <h3 id="recent-meal-title" className="sr-only">
        Recent meal
      </h3>
      <details>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block text-sm font-medium text-[var(--gm-text)]">
              {mealLabel(meal.mealType)} <span className="font-normal text-[var(--gm-text-muted)]">· {when}</span>
            </span>
            <span className="block text-xs tabular-nums text-[var(--gm-text-secondary)]">
              {values.calories == null ? "Energy unknown" : `~${fmt(roughly(values.calories, "calories"))} kcal`} ·{" "}
              {values.protein == null ? "protein unknown" : `~${fmt(roughly(values.protein, "protein"))} g protein`}
            </span>
          </span>
          <span className="text-xs text-[var(--gm-text-muted)]">Details</span>
        </summary>
        <div className="mt-3 space-y-2">
          <MealDetail meal={meal} />
          <p className="text-xs text-[var(--gm-text-muted)]">Estimated from what was logged; portions are approximate.</p>
        </div>
      </details>
      <button type="button" onClick={onShowAll} className={`mt-3 ${quietButton}`}>
        All meals
      </button>
    </section>
  );
}

// ─── Progress ──────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<DayStatus, string> = {
  complete: "Complete",
  partial: "Partial",
  unlogged: "Not logged",
  in_progress: "In progress",
};

function rangeLabel(start: string, end: string, today: string): string {
  return `${formatDay(start)} – ${end === today ? `today (${formatDay(end)})` : formatDay(end)}`;
}

function AssessmentCard({
  summaries,
  guidance,
  periodKind,
}: {
  summaries: DaySummary[];
  guidance: GuidanceDashboard;
  periodKind: PeriodKind;
}) {
  const [nutrient, setNutrient] = useState<"protein" | "calories" | "fiber">("protein");
  const period = periodFor(periodKind, guidance.date);
  const days = daysIn(summaries, period).sort((a, b) => a.date.localeCompare(b.date));
  const stats = nutrientStats(days, nutrient);
  const comparison = compare(stats, nutrientStats(daysIn(summaries, period.previous), nutrient));
  const unit = unitOf(nutrient);
  const name = labelOf(nutrient).toLowerCase();
  const thisPeriod = periodKind === "week" ? "this week" : "this month";
  const lastPeriod = periodKind === "week" ? "last week" : "last month";

  const maxValue = Math.max(1, ...days.map((d) => Math.max(d.totals[nutrient].consumed, d.totals[nutrient].target)));
  const byDate = new Map(days.map((d) => [d.date, d]));
  const groupId = useId();

  return (
    <section className={card} aria-labelledby={`${groupId}-title`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id={`${groupId}-title`} className="text-base font-semibold text-[var(--gm-text)]">
          Against target
        </h3>
        <div role="group" aria-label="Nutrient" className="flex rounded-xl border border-[var(--gm-border)] p-0.5">
          {(["protein", "calories", "fiber"] as const).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={nutrient === key}
              onClick={() => setNutrient(key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)] ${
                nutrient === key ? "bg-[var(--gm-accent-soft)] text-[var(--gm-accent-text)]" : "text-[var(--gm-text-secondary)] hover:text-[var(--gm-text)]"
              }`}
            >
              {key === "fiber" ? "Fibre" : labelOf(key)}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-3 text-sm text-[var(--gm-text)]">
        {stats.average == null || stats.averageTarget == null
          ? `No complete days ${thisPeriod} yet to assess ${name}.`
          : `${labelOf(nutrient)} averaged about ${amount(roughly(stats.average, nutrient), nutrient)} a day on ${stats.usableDays} complete ${
              stats.usableDays === 1 ? "day" : "days"
            }, against a target of ${amount(stats.averageTarget, nutrient)}.`}
      </p>
      <p className="mt-1 text-sm text-[var(--gm-text-secondary)]">
        {comparison.kind === "insufficient"
          ? `Not enough complete days to compare with ${lastPeriod}: it needs ${comparison.required} on each side (${thisPeriod} ${comparison.currentDays}, ${lastPeriod} ${comparison.previousDays}).`
          : comparison.delta === 0
            ? `The same as ${lastPeriod} (${comparison.previousDays} complete days).`
            : `About ${amount(Math.abs(roughly(comparison.delta, nutrient)), nutrient)} ${comparison.delta > 0 ? "more" : "less"} a day than ${lastPeriod} (${amount(
                roughly(comparison.previous, nutrient),
                nutrient
              )} over ${comparison.previousDays} complete days).`}
      </p>

      {days.length > 0 && (
        <div className="mt-4">
          {/* The whole week or month: days not reached yet are empty slots,
              and days before Guidance started have no target to show. */}
          <div
            role="img"
            aria-label={`${labelOf(nutrient)} per day ${thisPeriod}, against the daily target. Daily values are listed in the table below.`}
            className="flex h-32 items-end gap-1"
          >
            {datesBetween(period.start, period.lastDay).map((date) => {
              const d = byDate.get(date);
              if (!d) return <div key={date} className="h-full flex-1" title={`${formatDay(date)}: ${date > guidance.date ? "upcoming" : "no target"}`} />;
              const day = d.totals[nutrient];
              const h = (day.consumed / maxValue) * 100;
              const t = (day.target / maxValue) * 100;
              const muted = d.status === "partial" || d.status === "in_progress" || day.isIncomplete;
              return (
                <div key={date} className="relative flex h-full flex-1 items-end" title={`${formatDay(date)}: ${STATUS_LABEL[d.status]}`}>
                  <div
                    className="absolute left-0 right-0 border-t border-dashed border-[var(--gm-text-muted)]"
                    style={{ bottom: `${t}%` }}
                    aria-hidden="true"
                  />
                  {d.status === "unlogged" ? (
                    <div className="w-full rounded-sm border border-dashed border-[var(--gm-border-strong)]" style={{ height: "6%" }} />
                  ) : (
                    <div
                      className={`w-full rounded-sm ${day.over > 0 ? "bg-[var(--gm-over)]" : "bg-[var(--gm-accent)]"} ${muted ? "opacity-40" : ""}`}
                      style={{ height: `${Math.max(2, h)}%` }}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-[var(--gm-text-muted)]">
            <span>{formatDay(period.start)}</span>
            <span>{formatDay(period.lastDay)}</span>
          </div>
          <p className="mt-2 text-xs text-[var(--gm-text-muted)]">
            Dashed line: daily target ({unit}). Faded bars are partial or still in progress; dashed outlines weren&apos;t logged.{" "}
            {stats.counts.complete} complete · {stats.counts.partial} partial · {stats.counts.unlogged} not logged
            {stats.counts.in_progress > 0 ? " · today in progress" : ""}. A day is complete with {guidance.expectedMealsPerDay}+ meals logged
            {guidance.expectedMealsIsDefault ? " (the usual default)" : " (their usual number)"}.
          </p>
          <table className="sr-only">
            <caption>{labelOf(nutrient)} per day</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Intake</th>
                <th scope="col">Target</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date}>
                  <td>{formatDay(d.date)}</td>
                  <td>{d.status === "unlogged" ? "Not logged" : `${d.totals[nutrient].isIncomplete ? "at least " : ""}${amount(d.totals[nutrient].consumed, nutrient)}`}</td>
                  <td>{amount(d.totals[nutrient].target, nutrient)}</td>
                  <td>{STATUS_LABEL[d.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const WEIGHT_GOALS: NutritionGoal[] = ["reduce_weight", "reduce_body_fat", "gain_muscle", "body_recomposition", "maintain_weight"];

function GoalCard({ guidance, viewer, periodKind }: { guidance: GuidanceDashboard; viewer: GuidanceViewer; periodKind: PeriodKind }) {
  // Weight is the one goal measure the product records. Goals it doesn't
  // speak to (improving nutrition, healthy ageing) get no card rather than
  // a made-up score.
  if (!guidance.goals.some((g) => WEIGHT_GOALS.includes(g))) return null;
  const period = periodFor(periodKind, guidance.date);
  const readings = guidance.weights.filter((w) => {
    const d = localDate(w.measuredAt, guidance.timezone);
    return d >= period.start && d <= period.end;
  });
  const first = readings[0];
  const last = readings[readings.length - 1];
  const when = (iso: string) => timeIn(iso, guidance.timezone, { day: "numeric", month: "short" });

  return (
    <section className={card} aria-labelledby="goal-title">
      <h3 id="goal-title" className="text-base font-semibold text-[var(--gm-text)]">
        Weight
      </h3>
      {readings.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--gm-text-secondary)]">
          No weight readings {periodKind === "week" ? "this week" : "this month"}.{" "}
          {viewer.kind === "coach" ? "Add one in the biomarker log below." : "Weight is updated from the profile details."}
        </p>
      ) : readings.length === 1 ? (
        <p className="mt-2 text-sm text-[var(--gm-text)]">
          {first.weightKg.toFixed(1)} kg on {when(first.measuredAt)}. One reading isn&apos;t enough to show a change.
        </p>
      ) : (
        <p className="mt-2 text-sm text-[var(--gm-text)]">
          {first.weightKg.toFixed(1)} kg ({when(first.measuredAt)}) to {last.weightKg.toFixed(1)} kg ({when(last.measuredAt)}),{" "}
          {last.weightKg === first.weightKg
            ? "no change"
            : `${Math.abs(last.weightKg - first.weightKg).toFixed(1)} kg ${last.weightKg > first.weightKg ? "up" : "down"}`}{" "}
          over {readings.length} readings.
        </p>
      )}
      <p className="mt-2 text-xs text-[var(--gm-text-muted)]">
        Weight varies from day to day, and food records alone don&apos;t show a change in health.
      </p>
    </section>
  );
}

/** Days shown at a time in the history, so a long history stays short. */
const HISTORY_PAGE = 7;

function DailyDetails({
  summaries,
  guidance,
  open,
  onToggle,
}: {
  summaries: DaySummary[];
  guidance: GuidanceDashboard;
  open: boolean;
  onToggle: (open: boolean) => void;
}) {
  // The whole history since Guidance started, not just the selected
  // period: this is where "All meals" leads.
  const [shown, setShown] = useState(HISTORY_PAGE);
  const all = [...summaries].sort((a, b) => b.date.localeCompare(a.date));
  const days = all.slice(0, shown);
  const mealsOn = (date: string) => guidance.meals.filter((m) => localDate(m.loggedAt, guidance.timezone) === date);

  return (
    <details
      id="guidance-daily-details"
      className={card}
      open={open}
      onToggle={(e) => onToggle((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer text-base font-semibold text-[var(--gm-text)]">Daily details and meal history</summary>
      <ol className="mt-4 space-y-4">
        {days.map((d) => (
          <li key={d.date} className="border-t border-[var(--gm-border)] pt-4 first:border-t-0 first:pt-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-[var(--gm-text)]">{formatDay(d.date)}</span>
              <span className="text-xs text-[var(--gm-text-muted)]">
                {STATUS_LABEL[d.status]} · {d.totals.mealCount} {d.totals.mealCount === 1 ? "meal" : "meals"}
              </span>
            </div>
            {d.status === "unlogged" ? (
              <p className="mt-1 text-xs text-[var(--gm-text-secondary)]">Nothing logged. This isn&apos;t counted as zero intake.</p>
            ) : (
              <>
                <p className="mt-1 text-xs tabular-nums text-[var(--gm-text-secondary)]">
                  {NUTRIENTS.map(({ key }) => {
                    const day = d.totals[key];
                    return `${labelOf(key)} ${day.isIncomplete ? "≥ " : ""}${fmt(day.consumed)} / ${amount(day.target, key)}`;
                  }).join(" · ")}
                </p>
                <ul className="mt-2 space-y-2">
                  {mealsOn(d.date).map((m) => (
                    <li key={m.id} className="rounded-xl bg-[var(--gm-raised)] px-3 py-2">
                      <p className="text-xs font-medium text-[var(--gm-text)]">
                        {mealLabel(m.mealType)}{" "}
                        <span className="font-normal text-[var(--gm-text-muted)]">
                          · logged {timeIn(m.loggedAt, guidance.timezone, { hour: "numeric", minute: "2-digit", hour12: true })}
                        </span>
                      </p>
                      <div className="mt-1">
                        <MealDetail meal={m} />
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </li>
        ))}
      </ol>
      {all.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + HISTORY_PAGE)} className={`mt-4 ${quietButton}`}>
          Show earlier days
        </button>
      )}
      <p className="mt-4 text-xs text-[var(--gm-text-muted)]">
        All values are estimates from logged meals. Days before Guidance started aren&apos;t shown.
      </p>
    </details>
  );
}

// ─── Shell ─────────────────────────────────────────────────────────────────

type Tab = "today" | "progress";

export function GuidanceTabs({
  guidance,
  viewer,
  manageHref,
}: {
  guidance: GuidanceDashboard;
  viewer: GuidanceViewer;
  /** The Guidance screen: targets, and Return to Tracking where allowed. */
  manageHref?: string;
}) {
  const [tab, setTab] = useState<Tab>("today");
  const [periodKind, setPeriodKind] = useState<PeriodKind>("week");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ today: null, progress: null });
  const id = useId();
  const summaries = summarizeDays(guidance.history, guidance.date, guidance.expectedMealsPerDay);
  const period = periodFor(periodKind, guidance.date);

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next: Tab = tab === "today" ? "progress" : "today";
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  function showAllMeals() {
    setTab("progress");
    setDetailsOpen(true);
    // After the Progress panel renders.
    requestAnimationFrame(() => document.getElementById("guidance-daily-details")?.scrollIntoView({ block: "start" }));
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[var(--gm-text)]">
          {viewer.kind === "self" ? "Your nutrition" : `${viewer.name}'s nutrition`}
        </h2>
        {manageHref && (
          <Link href={manageHref} className={quietButton}>
            {viewer.kind === "coach" ? "Targets" : "Manage"}
          </Link>
        )}
      </div>
      {guidance.isPreviewOnly && (
        <p className="rounded-xl border border-[var(--gm-over-border)] bg-[var(--gm-over-soft)] px-3 py-2 text-xs text-[var(--gm-over-text)]">
          Test version: these targets haven&apos;t been checked by a health professional yet.
        </p>
      )}

      <div role="tablist" aria-label="Guidance" className="flex gap-1 rounded-xl border border-[var(--gm-border)] bg-[var(--gm-card)] p-1">
        {(["today", "progress"] as const).map((t) => (
          <button
            key={t}
            ref={(el) => {
              tabRefs.current[t] = el;
            }}
            id={`${id}-tab-${t}`}
            role="tab"
            type="button"
            aria-selected={tab === t}
            aria-controls={`${id}-panel-${t}`}
            tabIndex={tab === t ? 0 : -1}
            onClick={() => setTab(t)}
            onKeyDown={onTabKey}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)] ${
              tab === t ? "bg-[var(--gm-raised)] text-[var(--gm-text)]" : "text-[var(--gm-text-secondary)] hover:text-[var(--gm-text)]"
            }`}
          >
            {t === "today" ? "Today" : "Progress"}
          </button>
        ))}
      </div>

      {tab === "today" ? (
        <div id={`${id}-panel-today`} role="tabpanel" aria-labelledby={`${id}-tab-today`} className="space-y-4">
          <NextMealCard guidance={guidance} viewer={viewer} />
          <TodaySoFar guidance={guidance} viewer={viewer} />
          <RecentMeal guidance={guidance} onShowAll={showAllMeals} />
        </div>
      ) : (
        <div id={`${id}-panel-progress`} role="tabpanel" aria-labelledby={`${id}-tab-progress`} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="group" aria-label="Period" className="flex rounded-xl border border-[var(--gm-border)] p-0.5">
              {(["week", "month"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={periodKind === k}
                  onClick={() => setPeriodKind(k)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)] ${
                    periodKind === k ? "bg-[var(--gm-accent-soft)] text-[var(--gm-accent-text)]" : "text-[var(--gm-text-secondary)] hover:text-[var(--gm-text)]"
                  }`}
                >
                  {k === "week" ? "This week" : "This month"}
                </button>
              ))}
            </div>
            <span className="text-xs text-[var(--gm-text-muted)]">
              {rangeLabel(period.start, period.end, guidance.date)} · {guidance.timezone.replace(/_/g, " ")} time
            </span>
          </div>
          <AssessmentCard summaries={summaries} guidance={guidance} periodKind={periodKind} />
          <GoalCard guidance={guidance} viewer={viewer} periodKind={periodKind} />
          <section className={card} aria-labelledby="micros-title">
            <h3 id="micros-title" className="text-base font-semibold text-[var(--gm-text)]">
              Vitamins and minerals
            </h3>
            <p className="mt-2 text-sm text-[var(--gm-text-secondary)]">
              Not estimated yet. Logged meals currently give energy, protein, carbs, fat and fibre.
            </p>
          </section>
          <DailyDetails summaries={summaries} guidance={guidance} open={detailsOpen} onToggle={setDetailsOpen} />
        </div>
      )}
    </div>
  );
}

/** Where the Guidance view goes, before it exists: for a coach client, who
 * only has Guidance, setting it up is the first thing to do, not a card at
 * the bottom of the page. */
export function GuidanceSetupPrompt({ href, personName }: { href: string; personName: string }) {
  return (
    <section className="guidance-theme rounded-2xl bg-[var(--gm-page)] p-5 text-[var(--gm-text)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-[var(--gm-text)]">Set up {personName}&apos;s daily targets</h2>
          <p className="mt-1 text-sm text-[var(--gm-text-secondary)]">
            A few health questions, then recommended calorie and macro targets you can fine-tune.
          </p>
        </div>
        <Link href={href} className={`shrink-0 text-center ${primaryAction}`}>
          Set up targets →
        </Link>
      </div>
    </section>
  );
}
