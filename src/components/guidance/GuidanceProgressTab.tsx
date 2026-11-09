"use client";

import { useId, useState, useSyncExternalStore, type ReactNode } from "react";

import type { NutritionGoal } from "@nutriai/health-scoring";

import {
  compare,
  datesBetween,
  daysIn,
  nutrientStats,
  periodFor,
  type DaySummary,
  type DayStatus,
  type PeriodKind,
} from "@/lib/guidance/aggregation";
import { localDate } from "@/lib/guidance/daily-totals";
import { NUTRIENTS, type NutrientKey } from "@/lib/guidance/meal-impact";
import type { GuidanceActions } from "@/lib/guidance/bound-actions";
import { MAIN_SLOTS, slotOfMealType } from "@/lib/guidance/day-plan";
import type { GuidanceDashboard } from "@/lib/guidance/view";

import { HabitProgressCard } from "./GuidanceHabitCards";
import { MealDetail } from "./GuidanceTodayTab";
import { useGuidanceAction } from "./use-guidance-action";
import { formatDay } from "./GuidanceToday";
import {
  amount,
  Arrow,
  card,
  Chevron,
  clockTime,
  dayOfMonth,
  estimate,
  eyebrow,
  fmt,
  labelOf,
  mealLabel,
  overIsNotable,
  Possessive,
  quietButton,
  rangeText,
  roughly,
  timeIn,
  unitOf,
  weekdayShort,
  type GuidanceViewer,
} from "./ui";

// The Progress tab. Every number on it comes from lib/guidance/aggregation
// (one service), so the headline, the stats and the chart can't disagree.

const STATUS_LABEL: Record<DayStatus, string> = {
  complete: "Complete",
  partial: "Partial",
  unlogged: "Not logged",
  in_progress: "In progress",
};

type ChartNutrient = "protein" | "calories" | "fiber";

/** The person's timezone, named only when the viewer's own differs, so a
 * family member abroad knows which "day" the dates mean. The server can't
 * know the viewer's timezone, so it renders none and the browser fills it
 * in after hydration. */
const noSubscription = () => () => {};
function useTimezoneNote(timezone: string): string | null {
  const viewerTimezone = useSyncExternalStore(
    noSubscription,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null
  );
  if (!viewerTimezone || viewerTimezone === timezone) return null;
  try {
    const name = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, timeZoneName: "long" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value;
    return name ?? timezone.replace(/_/g, " ");
  } catch {
    return timezone.replace(/_/g, " ");
  }
}

function PeriodToggle({ value, onChange }: { value: PeriodKind; onChange: (k: PeriodKind) => void }) {
  return (
    <div role="group" aria-label="Period" className="grid grid-cols-2 rounded-xl border border-[var(--gm-border-strong)] p-1">
      {(["week", "month"] as const).map((k) => (
        <button
          key={k}
          type="button"
          aria-pressed={value === k}
          onClick={() => onChange(k)}
          className={`rounded-lg px-5 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)] ${
            value === k ? "bg-[var(--gm-accent)] text-[var(--gm-on-accent)]" : "text-[var(--gm-text-secondary)] hover:text-[var(--gm-text)]"
          }`}
        >
          {k === "week" ? "This week" : "This month"}
        </button>
      ))}
    </div>
  );
}

function headlineFor(days: DaySummary[], today: string, viewer: GuidanceViewer, periodKind: PeriodKind): string {
  const past = days.filter((d) => d.date < today);
  const complete = past.filter((d) => d.status === "complete").length;
  const who = viewer.kind === "self" ? "You're" : `${viewer.name} is`;
  if (past.length === 0) return periodKind === "week" ? "The week has just started" : "The month has just started";
  if (complete === 0) return "No complete days yet";
  if (complete >= 3 && complete / past.length >= 0.7) return `${who} building consistency`;
  return `${complete} complete ${complete === 1 ? "day" : "days"} so far`;
}

function AssessmentCard({
  summaries,
  guidance,
  viewer,
  periodKind,
}: {
  summaries: DaySummary[];
  guidance: GuidanceDashboard;
  viewer: GuidanceViewer;
  periodKind: PeriodKind;
}) {
  const [nutrient, setNutrient] = useState<ChartNutrient>("protein");
  const [howOpen, setHowOpen] = useState(false);
  const id = useId();
  const period = periodFor(periodKind, guidance.date);
  const days = daysIn(summaries, period).sort((a, b) => a.date.localeCompare(b.date));
  const stats = nutrientStats(days, nutrient);
  const comparison = compare(stats, nutrientStats(daysIn(summaries, period.previous), nutrient));
  const name = labelOf(nutrient).toLowerCase();
  const lastPeriod = periodKind === "week" ? "last week" : "last month";
  const unit = unitOf(nutrient);

  const sentence =
    stats.average == null
      ? `No fully logged days ${periodKind === "week" ? "this week" : "this month"} to assess ${name} yet.`
      : comparison.kind === "insufficient"
        ? `${labelOf(nutrient)} averaged ${amount(roughly(stats.average, nutrient), nutrient)} on fully logged days. There aren't enough complete days to compare with ${lastPeriod} yet.`
        : comparison.delta === 0
          ? `${labelOf(nutrient)} held steady on fully logged days, compared with ${lastPeriod}.`
          : `${labelOf(nutrient)} ${comparison.delta > 0 ? "rose" : "fell"} on fully logged days, compared with ${lastPeriod}.`;

  // One target line when the target was the same all period; a dash per day
  // when it changed, so no day is compared with someone else's target.
  const targets = new Set(days.map((d) => d.totals[nutrient].target));
  const singleTarget = targets.size === 1 ? [...targets][0] : null;
  const maxValue = Math.max(1, ...days.map((d) => Math.max(d.totals[nutrient].consumed, d.totals[nutrient].target))) * 1.08;
  const byDate = new Map(days.map((d) => [d.date, d]));
  const slots = datesBetween(period.start, period.lastDay);
  const narrow = slots.length > 7;

  return (
    <section className={card} aria-labelledby={`${id}-title`}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:gap-10">
        <div>
          <h2 id={`${id}-title`} className="text-2xl font-bold tracking-tight text-[var(--gm-text)] sm:text-3xl">
            {headlineFor(days, guidance.date, viewer, periodKind)}
          </h2>
          <p className="mt-2 text-[var(--gm-text-secondary)] sm:text-lg">{sentence}</p>
          <dl className="mt-6 grid grid-cols-2 divide-x divide-[var(--gm-border-strong)]">
            <div className="pr-4">
              <dt className="sr-only">Average {name}</dt>
              <dd className="text-3xl font-bold tabular-nums text-[var(--gm-text)] sm:text-4xl">
                {stats.average == null ? "–" : amount(roughly(stats.average, nutrient), nutrient)}
              </dd>
              <dd className="mt-1 text-sm text-[var(--gm-text-secondary)]">
                average {name} · {stats.usableDays} complete {stats.usableDays === 1 ? "day" : "days"}
              </dd>
            </div>
            <div className="pl-4 sm:pl-6">
              <dt className="sr-only">Change from {lastPeriod}</dt>
              <dd className="text-3xl font-bold tabular-nums text-[var(--gm-text)] sm:text-4xl">
                {comparison.kind === "insufficient"
                  ? "–"
                  : `${comparison.delta > 0 ? "+" : comparison.delta < 0 ? "−" : "±"}${amount(Math.abs(roughly(comparison.delta, nutrient)), nutrient)}`}
              </dd>
              <dd className="mt-1 text-sm text-[var(--gm-text-secondary)]">
                {comparison.kind === "insufficient"
                  ? `vs ${lastPeriod}: needs ${comparison.required} complete days in each`
                  : `vs ${lastPeriod} (${amount(roughly(comparison.previous, nutrient), nutrient)}, ${comparison.previousDays} days)`}
              </dd>
            </div>
          </dl>
        </div>

        <div>
          <div role="group" aria-label="Nutrient" className="inline-grid grid-cols-3 rounded-xl border border-[var(--gm-border-strong)] p-1">
            {(["protein", "calories", "fiber"] as const).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={nutrient === key}
                onClick={() => setNutrient(key)}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)] sm:px-6 ${
                  nutrient === key ? "bg-[var(--gm-accent)] text-[var(--gm-on-accent)]" : "text-[var(--gm-text-secondary)] hover:text-[var(--gm-text)]"
                }`}
              >
                {labelOf(key)}
              </button>
            ))}
          </div>

          <div className="mt-4">
            <p className="text-right text-xs text-[var(--gm-text-secondary)]">
              {singleTarget != null ? `Target ${amount(singleTarget, nutrient)}` : `Daily target (${unit}), which changed this ${periodKind}`}
            </p>
            <div
              role="img"
              aria-label={`${labelOf(nutrient)} per day, ${rangeText(period.start, period.lastDay)}, against the daily target. The values are in the daily details below.`}
              className="relative mt-1 h-40 border-b border-[var(--gm-border-strong)]"
            >
              {singleTarget != null && (
                <div
                  aria-hidden="true"
                  className="absolute left-0 right-0 border-t-2 border-dashed border-[var(--gm-text-secondary)]"
                  style={{ bottom: `${(singleTarget / maxValue) * 100}%` }}
                />
              )}
              <div className="absolute inset-0 grid items-end gap-1 sm:gap-2" style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))` }}>
                {slots.map((date) => {
                  const d = byDate.get(date);
                  if (!d) return <div key={date} className="h-full" />;
                  const day = d.totals[nutrient];
                  const h = Math.max(3, (day.consumed / maxValue) * 100);
                  const fill = day.over > 0 && overIsNotable(nutrient) ? "var(--gm-over)" : "var(--gm-accent)";
                  return (
                    <div key={date} className="relative flex h-full items-end" title={`${formatDay(date)}: ${STATUS_LABEL[d.status]}`}>
                      {singleTarget == null && (
                        <div
                          aria-hidden="true"
                          className="absolute left-0 right-0 border-t-2 border-dashed border-[var(--gm-text-secondary)]"
                          style={{ bottom: `${(day.target / maxValue) * 100}%` }}
                        />
                      )}
                      {d.status === "unlogged" ? (
                        <div className="flex h-[45%] w-full items-center justify-center rounded-md border border-dashed border-[var(--gm-text-muted)] text-center text-[10px] leading-tight text-[var(--gm-text-secondary)]">
                          {!narrow && (
                            <span>
                              Not
                              <br />
                              logged
                            </span>
                          )}
                        </div>
                      ) : d.status === "complete" && !day.isIncomplete ? (
                        <div className="w-full rounded-t-md" style={{ height: `${h}%`, background: fill }} />
                      ) : d.status === "in_progress" ? (
                        <div className="w-full rounded-t-md border-2 border-dashed" style={{ height: `${h}%`, borderColor: fill }} />
                      ) : (
                        <div
                          className="w-full rounded-t-md"
                          style={{
                            height: `${h}%`,
                            background: `repeating-linear-gradient(135deg, ${fill} 0 3px, transparent 3px 7px)`,
                            boxShadow: `inset 0 0 0 1px ${fill}`,
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div
              aria-hidden="true"
              className="mt-2 grid gap-1 text-center text-xs text-[var(--gm-text-secondary)] sm:gap-2"
              style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))` }}
            >
              {slots.map((date, i) => (
                <span key={date} className={date === guidance.date ? "font-semibold text-[var(--gm-text)]" : ""}>
                  {narrow ? (i % 7 === 0 ? dayOfMonth(date) : "") : date === guidance.date ? "Today" : weekdayShort(date)}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 text-sm text-[var(--gm-text-secondary)]">
            <p>
              {stats.counts.complete} complete · {stats.counts.partial} partial · {stats.counts.unlogged} not logged
              {stats.counts.in_progress > 0 ? " · today in progress" : ""}
            </p>
            <button type="button" aria-expanded={howOpen} onClick={() => setHowOpen((o) => !o)} className={quietButton}>
              How we calculate this <Arrow />
            </button>
          </div>
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
                  <td>
                    {d.status === "unlogged"
                      ? "Not logged"
                      : `${d.totals[nutrient].isIncomplete ? "at least " : ""}${amount(roughly(d.totals[nutrient].consumed, nutrient), nutrient)}`}
                  </td>
                  <td>{amount(d.totals[nutrient].target, nutrient)}</td>
                  <td>{STATUS_LABEL[d.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {howOpen && (
        <div className="mt-6 space-y-2 border-t border-[var(--gm-border)] pt-4 text-sm text-[var(--gm-text-secondary)]">
          <p>
            A day is <strong className="text-[var(--gm-text)]">complete</strong> when {guidance.expectedMealsPerDay} or more meals are
            logged ({guidance.expectedMealsIsDefault ? "the usual default" : "the usual number from setup"}) and every meal has an
            estimate for {name}. Solid bars are complete days, striped bars are partial, and dashed boxes weren&apos;t logged.
          </p>
          <p>
            Averages use complete days only. Partial days and days with nothing logged are shown but not averaged, and a missing log is
            never counted as zero. Today is still in progress, so it&apos;s outlined and left out of every comparison.
          </p>
          <p>
            A comparison needs at least 3 complete days in each period; with fewer it says so instead of showing a change. All values are
            estimates from meal photos.
          </p>
        </div>
      )}
    </section>
  );
}

const GOAL_LABEL: Record<NutritionGoal, string> = {
  reduce_weight: "Lose weight",
  reduce_body_fat: "Reduce body fat",
  gain_muscle: "Build muscle",
  body_recomposition: "Body recomposition",
  maintain_weight: "Maintain weight",
  improve_nutrition: "Improve nutrition",
  healthy_aging: "Healthy ageing",
};
const WEIGHT_GOALS: NutritionGoal[] = ["reduce_weight", "reduce_body_fat", "gain_muscle", "body_recomposition", "maintain_weight"];

function hasGoalCard(guidance: GuidanceDashboard): boolean {
  return guidance.goals.some((g) => WEIGHT_GOALS.includes(g) || g === "healthy_aging");
}

function GoalCard({ guidance, viewer, periodKind }: { guidance: GuidanceDashboard; viewer: GuidanceViewer; periodKind: PeriodKind }) {
  const weightGoal = guidance.goals.find((g) => WEIGHT_GOALS.includes(g));
  if (!weightGoal) {
    // Strength and function aren't measured anywhere in Tistra, so there's
    // nothing to add and no button: an honest note, not a dead control.
    if (!guidance.goals.includes("healthy_aging")) return null;
    return (
      <section className={card} aria-labelledby="goal-title">
        <p className={`${eyebrow} text-[var(--gm-text-secondary)]`}>{Possessive(viewer)} goal · Healthy ageing</p>
        <h2 id="goal-title" className="mt-2 text-xl font-bold tracking-tight text-[var(--gm-text)] sm:text-2xl">
          Track what matters to {viewer.kind === "self" ? "you" : viewer.name}
        </h2>
        <p className="mt-3 text-[var(--gm-text-secondary)]">
          Strength and everyday function aren&apos;t measured in Tistra yet, so this goal&apos;s progress isn&apos;t shown here. The
          nutrition habits above are what Tistra can follow.
        </p>
      </section>
    );
  }

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
      <p className={`${eyebrow} text-[var(--gm-text-secondary)]`}>
        {Possessive(viewer)} goal · {GOAL_LABEL[weightGoal]}
      </p>
      <h2 id="goal-title" className="mt-2 text-xl font-bold tracking-tight text-[var(--gm-text)] sm:text-2xl">
        Weight
      </h2>
      {readings.length === 0 ? (
        <p className="mt-3 text-[var(--gm-text-secondary)]">
          No weight readings {periodKind === "week" ? "this week" : "this month"}.{" "}
          {viewer.kind === "coach" ? "Add one in the biomarker log." : "Weight is updated from the profile details."}
        </p>
      ) : readings.length === 1 ? (
        <p className="mt-3 text-[var(--gm-text)]">
          <span className="text-3xl font-bold tabular-nums">{first.weightKg.toFixed(1)} kg</span>
          <span className="mt-1 block text-sm text-[var(--gm-text-secondary)]">
            on {when(first.measuredAt)}. One reading isn&apos;t enough to show a change.
          </span>
        </p>
      ) : (
        <p className="mt-3 text-[var(--gm-text)]">
          <span className="text-3xl font-bold tabular-nums">
            {last.weightKg === first.weightKg
              ? "No change"
              : `${last.weightKg > first.weightKg ? "+" : "−"}${Math.abs(last.weightKg - first.weightKg).toFixed(1)} kg`}
          </span>
          <span className="mt-1 block text-sm text-[var(--gm-text-secondary)]">
            {first.weightKg.toFixed(1)} kg on {when(first.measuredAt)} to {last.weightKg.toFixed(1)} kg on {when(last.measuredAt)},{" "}
            {readings.length} readings
          </span>
        </p>
      )}
      <p className="mt-3 text-xs text-[var(--gm-text-muted)]">
        Weight varies from day to day, and food records alone don&apos;t show a change in health.
      </p>
    </section>
  );
}

/** Days shown at a time in the history, so a long history stays short. */
const HISTORY_PAGE = 7;

/** For a recent past day: the main meals with nothing logged can be marked
 * skipped, and a skip can be taken back. */
function DaySkips({ date, guidance, actions }: { date: string; guidance: GuidanceDashboard; actions?: GuidanceActions }) {
  const { run, pending, error } = useGuidanceAction();
  const weekAgo = new Date(Date.parse(`${guidance.date}T12:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
  if (!actions || date >= guidance.date || date < weekAgo) return null;
  const logged = new Set(
    guidance.meals.filter((m) => localDate(m.loggedAt, guidance.timezone) === date).map((m) => slotOfMealType(m.mealType))
  );
  const skipped = new Set(guidance.skips.filter((s) => s.date === date).map((s) => s.slot));
  const open = MAIN_SLOTS.filter((s) => !logged.has(s));
  if (open.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      {open.map((slot) =>
        skipped.has(slot) ? (
          <span key={slot} className="text-[var(--gm-text-secondary)]">
            {mealLabel(slot)} skipped ·{" "}
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => actions.setMealSkipped({ date, slot, skipped: false }))}
              className={quietButton}
            >
              Undo
            </button>
          </span>
        ) : (
          <button
            key={slot}
            type="button"
            disabled={pending}
            onClick={() => run(() => actions.setMealSkipped({ date, slot, skipped: true }))}
            className={quietButton}
          >
            Mark {slot} skipped
          </button>
        )
      )}
      {error && (
        <span role="alert" className="text-[var(--gm-error-text)]">
          {error}
        </span>
      )}
    </div>
  );
}

function DailyDetails({
  summaries,
  guidance,
  open,
  onToggle,
  actions,
}: {
  summaries: DaySummary[];
  guidance: GuidanceDashboard;
  open: boolean;
  onToggle: (open: boolean) => void;
  actions?: GuidanceActions;
}) {
  // The whole history since Guidance started, not just the selected
  // period: this is where "View meal history" leads.
  const [shown, setShown] = useState(HISTORY_PAGE);
  const all = [...summaries].sort((a, b) => b.date.localeCompare(a.date));
  const days = all.slice(0, shown);
  const mealsOn = (date: string) => guidance.meals.filter((m) => localDate(m.loggedAt, guidance.timezone) === date);

  return (
    <section id="guidance-daily-details" className={`${card} scroll-mt-28`} aria-labelledby="daily-details-title">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="daily-details-body"
        onClick={() => onToggle(!open)}
        className="flex w-full items-center justify-between gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]"
      >
        <span>
          <span id="daily-details-title" className="block text-xl font-bold tracking-tight text-[var(--gm-text)]">
            Daily details &amp; meal history
          </span>
          <span className="mt-0.5 block text-sm text-[var(--gm-text-secondary)]">Meals, nutrients and logging history</span>
        </span>
        <Chevron direction={open ? "up" : "down"} className="text-[var(--gm-text-secondary)]" />
      </button>
      {open && (
        <div id="daily-details-body">
          <ol className="mt-5 space-y-4">
            {days.map((d) => (
              <li key={d.date} className="border-t border-[var(--gm-border)] pt-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-[var(--gm-text)]">{formatDay(d.date)}</span>
                  <span className="text-sm text-[var(--gm-text-secondary)]">
                    {STATUS_LABEL[d.status]} · {d.totals.mealCount} {d.totals.mealCount === 1 ? "meal" : "meals"}
                    {d.skipped > 0 ? ` · ${d.skipped} skipped` : ""}
                  </span>
                </div>
                <DaySkips date={d.date} guidance={guidance} actions={actions} />
                {d.status === "unlogged" ? (
                  <p className="mt-1 text-sm text-[var(--gm-text-secondary)]">Nothing logged. This isn&apos;t counted as zero intake.</p>
                ) : (
                  <>
                    <p className="mt-1 text-sm tabular-nums text-[var(--gm-text-secondary)]">
                      {NUTRIENTS.map(({ key }) => {
                        const day = d.totals[key as NutrientKey];
                        return `${labelOf(key)} ${day.isIncomplete ? "≥ " : ""}${estimate(day.consumed, key)} / ${amount(day.target, key)}`;
                      }).join(" · ")}
                    </p>
                    <ul className="mt-3 space-y-2">
                      {mealsOn(d.date).map((m) => (
                        <li key={m.id} className="rounded-xl bg-[var(--gm-raised)] px-4 py-3">
                          <p className="text-sm font-medium text-[var(--gm-accent-text)]">
                            {mealLabel(m.mealType)} · {clockTime(m.loggedAt, guidance.timezone)}
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
            All values are estimates from logged meals ({fmt(guidance.meals.length)} since Guidance started). Earlier days aren&apos;t
            shown.
          </p>
        </div>
      )}
    </section>
  );
}

export function GuidanceProgressTab({
  guidance,
  viewer,
  summaries,
  detailsOpen,
  onDetailsToggle,
  actions,
  micronutrientCard,
}: {
  guidance: GuidanceDashboard;
  viewer: GuidanceViewer;
  summaries: DaySummary[];
  detailsOpen: boolean;
  onDetailsToggle: (open: boolean) => void;
  actions?: GuidanceActions;
  micronutrientCard?: ReactNode;
}) {
  const [periodKind, setPeriodKind] = useState<PeriodKind>("week");
  const period = periodFor(periodKind, guidance.date);
  const tzNote = useTimezoneNote(guidance.timezone);
  const habitCard = guidance.nextSteps ? <HabitProgressCard habit={guidance.nextSteps.habit} viewer={viewer} actions={actions} /> : null;
  const goal = hasGoalCard(guidance) ? <GoalCard guidance={guidance} viewer={viewer} periodKind={periodKind} /> : null;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--gm-text)] sm:text-5xl">{Possessive(viewer)} progress</h1>
          <p className="mt-1 text-lg text-[var(--gm-text-secondary)] sm:text-2xl">Small changes, becoming habits.</p>
        </div>
        <div className="w-full sm:w-auto">
          <PeriodToggle value={periodKind} onChange={setPeriodKind} />
          <p className="mt-2 text-sm text-[var(--gm-text-secondary)] sm:text-right">
            {rangeText(period.start, period.lastDay)}
            {tzNote ? ` · ${tzNote}` : ""}
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <AssessmentCard summaries={summaries} guidance={guidance} viewer={viewer} periodKind={periodKind} />
        {(habitCard || goal) && (
          <div className={`grid gap-4 ${habitCard && goal ? "lg:grid-cols-2" : ""}`}>
            {habitCard}
            {goal}
          </div>
        )}
        {micronutrientCard ?? (
          <section className={card} aria-labelledby="micros-title">
            <p className={`${eyebrow} text-[var(--gm-text-secondary)]`}>Vitamins &amp; minerals</p>
            <h2 id="micros-title" className="mt-2 text-xl font-bold tracking-tight text-[var(--gm-text)]">
              Not estimated yet
            </h2>
            <p className="mt-2 text-[var(--gm-text-secondary)]">
              Meal photos currently give energy, protein, carbs, fat and fibre. Vitamins and minerals aren&apos;t estimated yet.
            </p>
          </section>
        )}
        <DailyDetails summaries={summaries} guidance={guidance} open={detailsOpen} onToggle={onDetailsToggle} actions={actions} />
        <p className="text-sm italic text-[var(--gm-text-muted)]">Missing logs aren&apos;t counted as zero intake.</p>
      </div>
    </>
  );
}
