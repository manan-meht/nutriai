import Link from "next/link";
import { dateRangeLabel, filterByDateRange, type DashboardDateRange } from "@nutriai/dashboard-core";

import type { NutrientDay } from "@/lib/guidance/daily-totals";
import { NUTRIENTS, type NutrientKey } from "@/lib/guidance/meal-impact";
import type { GuidanceDashboard } from "@/lib/guidance/view";

import { formatDay } from "./GuidanceToday";

// The dashboard in Guidance mode: what was eaten today meal by meal, what
// each meal added, what is left, and how each day went against its target.
//
// Rendered inside ProfileDashboard for all three viewers (family, coach,
// the person on /my-progress), in the Midnight teal theme regardless of the
// dashboard's own light or dark styling: the block itself says the mode is
// on. History follows the dashboard's date selector. "Over" is amber and
// never red, as everywhere in Guidance.

const fmt = (n: number) => n.toLocaleString("en-US");
const unitOf = (key: NutrientKey) => NUTRIENTS.find((n) => n.key === key)!.unit;
const withUnit = (n: number, key: NutrientKey) => (unitOf(key) === "kcal" ? `${fmt(n)} kcal` : `${fmt(n)} g`);

function mealTime(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: timezone }).format(
      new Date(iso)
    );
  } catch {
    return "";
  }
}

function mealLabel(mealType: string | null): string {
  if (!mealType) return "Meal";
  return mealType.charAt(0).toUpperCase() + mealType.slice(1).replace(/_/g, " ");
}

/** "370 kcal left" / "8 g over" / "On target", one nutrient. */
function balance(day: NutrientDay, key: NutrientKey): { text: string; over: boolean } {
  if (day.over > 0) return { text: `${withUnit(day.over, key)} over`, over: true };
  if (day.remaining > 0) return { text: `${withUnit(day.remaining, key)} left`, over: false };
  return { text: "On target", over: false };
}

function Bar({ day }: { day: NutrientDay }) {
  const pct = day.target > 0 ? Math.min(100, (day.consumed / day.target) * 100) : 0;
  return (
    <div className="h-1.5 rounded-full bg-[var(--gm-track)] overflow-hidden" aria-hidden="true">
      <div
        className={`h-full rounded-full ${day.over > 0 ? "bg-[var(--gm-over)]" : "bg-[var(--gm-accent)]"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function Today({ guidance }: { guidance: GuidanceDashboard }) {
  const today = guidance.today;
  if (!today) {
    return <p className="text-sm text-[var(--gm-text-secondary)]">There&apos;s no target for today.</p>;
  }
  const { totals } = today;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold text-[var(--gm-text)]">Left for today</h3>
          <span className="text-xs text-[var(--gm-text-muted)]">{formatDay(guidance.date)}</span>
        </div>
        <dl className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-2">
          {NUTRIENTS.map(({ key, label }) => {
            const day = totals[key];
            const b = balance(day, key);
            return (
              <div
                key={key}
                className={`rounded-xl border px-3 py-2.5 ${
                  key === "calories" ? "col-span-2 sm:col-span-1" : ""
                } ${b.over ? "border-[var(--gm-over-border)] bg-[var(--gm-over-soft)]" : "border-[var(--gm-border)] bg-[var(--gm-card)]"}`}
              >
                <dt className="text-xs text-[var(--gm-text-secondary)]">{label}</dt>
                <dd className={`text-base font-semibold tabular-nums ${b.over ? "text-[var(--gm-over-text)]" : "text-[var(--gm-text)]"}`}>
                  {b.text}
                </dd>
                <dd className="text-xs text-[var(--gm-text-muted)] tabular-nums">
                  {day.isIncomplete && "at least "}
                  {fmt(day.consumed)} / {withUnit(day.target, key)}
                </dd>
              </div>
            );
          })}
        </dl>
        {totals.hasIncompleteData && (
          <p className="mt-2 text-xs text-[var(--gm-text-muted)]">
            Some meals are missing an estimate, so a few totals are a minimum and what&apos;s left may be less.
          </p>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-[var(--gm-text)]">Today&apos;s meals</h3>
        {today.meals.length === 0 ? (
          <p className="mt-1 text-sm text-[var(--gm-text-secondary)]">No meals logged yet today.</p>
        ) : (
          <ol className="mt-2 space-y-2">
            {today.meals.map(({ meal, values, after }) => (
              <li key={meal.id} className="rounded-xl border border-[var(--gm-border)] bg-[var(--gm-card)] px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-[var(--gm-text)]">{mealLabel(meal.mealType)}</span>
                  <span className="text-xs text-[var(--gm-text-muted)]">{mealTime(meal.loggedAt, guidance.timezone)}</span>
                </div>
                {meal.foods.length > 0 && (
                  <p className="mt-1 text-sm text-[var(--gm-text-secondary)]">
                    {meal.foods.map((f) => (f.quantity ? `${f.name} (${f.quantity})` : f.name)).join(", ")}
                  </p>
                )}
                <p className="mt-1.5 text-xs text-[var(--gm-text)] tabular-nums">
                  {NUTRIENTS.map(({ key, label }) => {
                    const v = values[key];
                    return v == null ? `${label.toLowerCase()} unknown` : key === "calories" ? withUnit(v, key) : `${fmt(v)} g ${label.toLowerCase()}`;
                  }).join(" · ")}
                </p>
                <p className="mt-1 text-xs text-[var(--gm-text-muted)]">
                  After this meal:{" "}
                  {(["calories", "protein"] as const).map((key, i) => {
                    const day = after[key];
                    // "1,120 kcal left", "8 g protein over": calories carry
                    // their unit as the name, protein needs saying.
                    const name = key === "protein" ? " protein" : "";
                    const text =
                      day.over > 0
                        ? `${withUnit(day.over, key)}${name} over`
                        : day.remaining > 0
                          ? `${withUnit(day.remaining, key)}${name} left`
                          : `${key === "protein" ? "protein" : "calories"} on target`;
                    return (
                      <span key={key} className={day.over > 0 ? "text-[var(--gm-over-text)]" : "text-[var(--gm-accent-text)]"}>
                        {i > 0 && " · "}
                        {text}
                      </span>
                    );
                  })}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function History({ guidance, dateRange }: { guidance: GuidanceDashboard; dateRange: DashboardDateRange }) {
  const days = filterByDateRange(guidance.history, dateRange);
  if (days.length === 0) return null;

  const avg = (key: NutrientKey, field: "consumed" | "target") =>
    Math.round(days.reduce((sum, d) => sum + d.totals[key][field], 0) / days.length);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-[var(--gm-text)]">Against target</h3>
        <span className="text-xs text-[var(--gm-text-muted)]">{dateRangeLabel(dateRange)}</span>
      </div>
      <p className="mt-1 text-xs text-[var(--gm-text-secondary)] tabular-nums">
        Average over {days.length} {days.length === 1 ? "day" : "days"}: {fmt(avg("calories", "consumed"))} /{" "}
        {fmt(avg("calories", "target"))} kcal · {fmt(avg("protein", "consumed"))} / {fmt(avg("protein", "target"))} g protein
      </p>
      <ol className="mt-2 divide-y divide-[var(--gm-border)] rounded-xl border border-[var(--gm-border)] bg-[var(--gm-card)]">
        {days.map(({ date, totals }) => (
          <li key={date} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-[var(--gm-text)]">{formatDay(date)}</span>
              <span className="text-xs text-[var(--gm-text-muted)]">
                {totals.mealCount} {totals.mealCount === 1 ? "meal" : "meals"}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {(["calories", "protein"] as const).map((key) => (
                <div key={key}>
                  <div className="flex justify-between text-xs tabular-nums">
                    <span className="text-[var(--gm-text-secondary)]">{key === "calories" ? "Calories" : "Protein"}</span>
                    <span className="text-[var(--gm-text)]">
                      {totals[key].isIncomplete && "≥ "}
                      {fmt(totals[key].consumed)} / {withUnit(totals[key].target, key)}
                    </span>
                  </div>
                  <div className="mt-1">
                    <Bar day={totals[key]} />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-[var(--gm-text-muted)] tabular-nums">
              {(["carbs", "fat", "fiber"] as const)
                .map(
                  (key) =>
                    `${NUTRIENTS.find((n) => n.key === key)!.label} ${totals[key].isIncomplete ? "≥ " : ""}${fmt(totals[key].consumed)} / ${fmt(totals[key].target)} g`
                )
                .join(" · ")}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function GuidanceDashboardSection({
  guidance,
  dateRange,
  manageHref,
}: {
  guidance: GuidanceDashboard;
  dateRange: DashboardDateRange;
  /** The Guidance screen, for Return to Tracking and the full view. */
  manageHref?: string;
}) {
  return (
    <section className="guidance-theme rounded-2xl bg-[var(--gm-page)] p-5 text-[var(--gm-text)] space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-[var(--gm-text)]">Nutrition Guidance</h2>
          <span className="rounded-full border border-[var(--gm-accent-border)] bg-[var(--gm-accent-soft)] px-2.5 py-0.5 text-xs font-medium text-[var(--gm-accent-text)]">
            Guidance on
          </span>
        </div>
        {manageHref && (
          <Link href={manageHref} className="text-sm font-medium text-[var(--gm-accent-text)] hover:underline">
            Manage
          </Link>
        )}
      </div>
      {guidance.isPreviewOnly && (
        <p className="rounded-xl border border-[var(--gm-over-border)] bg-[var(--gm-over-soft)] px-3 py-2 text-xs text-[var(--gm-over-text)]">
          Test version: these targets haven&apos;t been checked by a health professional yet.
        </p>
      )}
      <Today guidance={guidance} />
      <History guidance={guidance} dateRange={dateRange} />
    </section>
  );
}

/** Where the Guidance section goes, before it exists: for a coach client,
 * who only has Guidance, setting it up is the first thing to do, not a card
 * at the bottom of the page. */
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
        <Link
          href={href}
          className="shrink-0 rounded-xl bg-[var(--gm-accent)] px-4 py-2.5 text-center text-sm font-semibold text-[var(--gm-on-accent)] hover:bg-[var(--gm-accent-hover)] transition"
        >
          Set up targets →
        </Link>
      </div>
    </section>
  );
}
