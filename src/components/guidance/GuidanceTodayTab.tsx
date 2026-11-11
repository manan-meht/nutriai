"use client";

import { useState } from "react";

import type { GuidanceActions } from "@/lib/guidance/bound-actions";
import { MAIN_SLOTS } from "@/lib/guidance/meal-slots";

import { localDate } from "@/lib/guidance/daily-totals";
import { mealValues, NUTRIENTS, type NutrientKey } from "@/lib/guidance/meal-impact";
import type { GuidanceDashboard, GuidanceMealRow } from "@/lib/guidance/view";

import { GuidanceNextMeal } from "./GuidanceNextMeal";
import { HabitTodayCard } from "./GuidanceHabitCards";
import { useGuidanceAction } from "./use-guidance-action";
import {
  Arrow,
  card,
  Chevron,
  clockTime,
  estimate,
  eyebrow,
  fmt,
  foodsTitle,
  labelOf,
  longDate,
  mealLabel,
  NutrientRow,
  possessive,
  Possessive,
  primaryAction,
  quietButton,
  roughly,
  timeIn,
  type GuidanceViewer,
} from "./ui";

// The Today tab: what to do next, and where the day stands. The next-meal
// card is the one light surface on the page, so it reads first.

/** Which meal is next, by the person's own clock. */
export function nextMealSlot(generatedAt: string, timezone: string): "breakfast" | "lunch" | "snack" | "dinner" {
  const hour = Number(timeIn(generatedAt, timezone, { hour: "numeric", hour12: false }));
  if (!Number.isFinite(hour) || hour < 10) return "breakfast";
  if (hour < 15) return "lunch";
  if (hour < 18) return "snack";
  return "dinner";
}

function greeting(guidance: GuidanceDashboard, viewer: GuidanceViewer, firstName: string): { title: string; subtitle: string } {
  if (viewer.kind !== "self") {
    return { title: `${viewer.name}'s day`, subtitle: `Let's make ${viewer.name}'s next meal count.` };
  }
  const hour = Number(timeIn(guidance.generatedAt, guidance.timezone, { hour: "numeric", hour12: false }));
  const part = !Number.isFinite(hour) || hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  return { title: `Good ${part}, ${firstName}`, subtitle: "Let's make your next meal count." };
}

export function MealDetail({ meal }: { meal: GuidanceMealRow }) {
  const values = mealValues(meal);
  return (
    <div className="space-y-2">
      {meal.foods.length > 0 && (
        <ul className="space-y-0.5 text-sm text-[var(--gm-text-secondary)]">
          {meal.foods.map((f, i) => (
            <li key={i}>
              {f.name}
              {f.quantity ? <span className="text-[var(--gm-text-muted)]"> · {f.quantity}</span> : null}
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm tabular-nums text-[var(--gm-text)]">
        {NUTRIENTS.map(({ key }) => {
          const v = values[key];
          return `${labelOf(key)} ${v == null ? "unknown" : `${estimate(v, key)}${key === "calories" ? " kcal" : " g"}`}`;
        }).join(" · ")}
      </p>
    </div>
  );
}

/** The hero card: the next meal, planned or suggested. */
function NextMealCard({ guidance, viewer, actions }: { guidance: GuidanceDashboard; viewer: GuidanceViewer; actions?: GuidanceActions }) {
  const totals = guidance.today?.totals;
  const next = guidance.nextSteps?.nextMeal ?? null;
  const slot = next?.slot ?? nextMealSlot(guidance.generatedAt, guidance.timezone);
  const shown = next?.plan?.suggestion ?? (next?.suggestions.kind === "options" ? next.suggestions.options[0] : null);

  let headline: string;
  let subline: string;
  if (!totals || !next) {
    headline = "No target for today";
    subline = "There's nothing to plan against until a target is set.";
  } else if (shown) {
    headline = next.plan ? `${mealLabel(slot)} is planned` : shown.headline;
    subline = next.isTomorrow ? "Today's meals are done, so this is for tomorrow." : shown.reason;
  } else {
    headline = totals.calories.remaining === 0 ? "Today's energy target is reached" : "No suggestion right now";
    subline = `About ${fmt(roughly(totals.calories.remaining, "calories"))} kcal and ${fmt(roughly(totals.protein.remaining, "protein"))} g protein left today.`;
  }

  return (
    <section
      aria-labelledby="next-meal-title"
      className="rounded-2xl bg-[var(--gm-hero)] p-5 text-[var(--gm-hero-text)] sm:p-7 lg:col-start-1"
    >
      <p className={`${eyebrow} text-[var(--gm-hero-accent)]`}>
        {Possessive(viewer)} next meal · {slot}
        {next?.isTomorrow ? " · tomorrow" : ""}
      </p>
      <h2 id="next-meal-title" className="mt-2 text-2xl font-bold tracking-tight sm:text-4xl">
        {headline}
      </h2>
      <p className="mt-1 text-[var(--gm-hero-text-secondary)] sm:text-lg">{subline}</p>
      {next && <GuidanceNextMeal key={`${next.date}:${next.slot}`} nextMeal={next} actions={actions} />}
    </section>
  );
}

/** Today's main meals whose time has passed with nothing logged: "Skipped
 * it" makes the day complete without adding anything to it. */
function SkipPrompts({ guidance, actions }: { guidance: GuidanceDashboard; actions?: GuidanceActions }) {
  const { run, pending, error } = useGuidanceAction();
  const prompts = guidance.nextSteps?.skipPrompts ?? [];
  const skipped = guidance.skips.filter((s) => s.date === guidance.date && MAIN_SLOTS.includes(s.slot));
  if (!actions || (prompts.length === 0 && skipped.length === 0)) return null;
  return (
    <div className="mt-5 space-y-2 border-t border-[var(--gm-border)] pt-4">
      {prompts.map((slot) => (
        <div key={slot} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-[var(--gm-text-secondary)]">No {slot} logged.</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => actions.setMealSkipped({ date: guidance.date, slot, skipped: true }))}
            className={quietButton}
          >
            Mark as skipped
          </button>
        </div>
      ))}
      {skipped.map((s) => (
        <div key={s.slot} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-[var(--gm-text-secondary)]">{mealLabel(s.slot)} skipped.</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => actions.setMealSkipped({ date: guidance.date, slot: s.slot, skipped: false }))}
            className={quietButton}
          >
            Undo
          </button>
        </div>
      ))}
      {error && (
        <p role="alert" className="text-sm text-[var(--gm-error-text)]">
          {error}
        </p>
      )}
    </div>
  );
}

function TodaySoFar({ guidance, actions }: { guidance: GuidanceDashboard; actions?: GuidanceActions }) {
  const [open, setOpen] = useState(false);
  const totals = guidance.today?.totals;
  if (!totals) return null;
  const count = totals.mealCount;
  return (
    <section className={`${card} lg:col-start-2`} aria-labelledby="today-so-far-title">
      <h2 id="today-so-far-title" className="text-2xl font-bold tracking-tight text-[var(--gm-text)]">
        Today so far
      </h2>
      <p className="mt-1 text-[var(--gm-text-secondary)]">
        {count === 0 ? "No meals logged yet" : `${count} ${count === 1 ? "meal" : "meals"} logged`} · day in progress
      </p>
      <div className="mt-5 space-y-5">
        <NutrientRow day={totals.protein} nutrient="protein" />
        <NutrientRow day={totals.calories} nutrient="calories" />
        {open &&
          (["carbs", "fat", "fiber"] as const satisfies readonly NutrientKey[]).map((key) => (
            <NutrientRow key={key} day={totals[key]} nutrient={key} />
          ))}
      </div>
      <p className="mt-5 text-sm italic text-[var(--gm-text-muted)]">
        Based on logged meals{totals.hasIncompleteData ? "; some are missing an estimate" : ""}
      </p>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={`mt-3 ${quietButton}`}>
        {open ? "Fewer nutrients" : "All nutrients"} <Arrow />
      </button>
      <SkipPrompts guidance={guidance} actions={actions} />
    </section>
  );
}

function RecentMeal({ guidance }: { guidance: GuidanceDashboard }) {
  const [open, setOpen] = useState(false);
  const meal = guidance.meals[0];
  if (!meal) return null;
  const values = mealValues(meal);
  const today = guidance.date;
  const when =
    localDate(meal.loggedAt, guidance.timezone) === today
      ? clockTime(meal.loggedAt, guidance.timezone)
      : `${timeIn(meal.loggedAt, guidance.timezone, { weekday: "short" })} ${clockTime(meal.loggedAt, guidance.timezone)}`;
  return (
    <section className={`${card} lg:col-start-2`} aria-label="Most recent meal">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]"
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium text-[var(--gm-accent-text)]">
            {mealLabel(meal.mealType)} · {when}
          </span>
          <span className="mt-1 block truncate font-semibold text-[var(--gm-text)]">{foodsTitle(meal.foods)}</span>
          <span className="mt-1 block text-sm tabular-nums text-[var(--gm-text-secondary)]">
            {values.protein == null ? "Protein unknown" : `${fmt(values.protein)} g protein`} ·{" "}
            {values.calories == null ? "energy unknown" : `${estimate(values.calories, "calories")} kcal`}
          </span>
        </span>
        <Chevron direction={open ? "down" : "right"} className="text-[var(--gm-text-secondary)]" />
      </button>
      {open && (
        <div className="mt-4 border-t border-[var(--gm-border)] pt-4">
          <MealDetail meal={meal} />
          <p className="mt-2 text-xs text-[var(--gm-text-muted)]">Estimated from the photo; portions are approximate.</p>
        </div>
      )}
    </section>
  );
}

export function GuidanceTodayTab({
  guidance,
  viewer,
  firstName,
  onShowHistory,
  actions,
}: {
  guidance: GuidanceDashboard;
  viewer: GuidanceViewer;
  /** The tracked person's first name, for the greeting when it's their own view. */
  firstName: string;
  onShowHistory: () => void;
  /** Absent for a read-only view: the cards show, the buttons don't. */
  actions?: GuidanceActions;
}) {
  const { title, subtitle } = greeting(guidance, viewer, firstName);
  const canLog = viewer.kind === "self" && guidance.logMealHref;
  return (
    <>
      <div>
        <p className="text-[var(--gm-text-secondary)]">{longDate(guidance.date)}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[var(--gm-text)] sm:text-5xl">{title}</h1>
        <p className="mt-1 text-lg text-[var(--gm-accent-text)] sm:text-2xl">{subtitle}</p>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <NextMealCard guidance={guidance} viewer={viewer} actions={actions} />
        <TodaySoFar guidance={guidance} actions={actions} />
        {guidance.nextSteps && <HabitTodayCard habit={guidance.nextSteps.habit} actions={actions} />}
        <RecentMeal guidance={guidance} />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-end gap-x-6 gap-y-3">
        {!canLog && (
          <p className="mr-auto text-sm text-[var(--gm-text-secondary)]">
            {viewer.kind === "self"
              ? "Log a meal by sending a photo to Tistra on WhatsApp."
              : `${viewer.name} logs meals by sending a photo to Tistra on WhatsApp.`}
          </p>
        )}
        {guidance.meals.length > 0 && (
          <button type="button" onClick={onShowHistory} className={quietButton}>
            View {viewer.kind === "self" ? "meal" : `${possessive(viewer)} meal`} history <Arrow />
          </button>
        )}
        {canLog && (
          <a href={guidance.logMealHref!} target="_blank" rel="noopener noreferrer" className={`hidden sm:inline-flex ${primaryAction}`}>
            <span aria-hidden="true">+</span> Log a meal
          </a>
        )}
      </div>
    </>
  );
}
