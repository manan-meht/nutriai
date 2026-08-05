"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

/** Minimal meal shape this section needs — deliberately decoupled from the
 * gym/adults MealLog types so it can be fed either without an `as any`
 * cast, as long as the caller maps totals onto these field names. */
export interface MacroMeal {
  loggedAt: string;
  totalCaloriesMin: number;
  totalCaloriesMax: number;
  totalProteinMin: number;
  totalProteinMax: number;
  totalCarbsMin: number;
  totalCarbsMax: number;
  totalFatMin: number;
  totalFatMax: number;
  totalFiberMin: number;
  totalFiberMax: number;
}

type MacroKey = "calories" | "protein" | "carbs" | "fat" | "fiber";

const MACRO_META: Record<MacroKey, { label: string; short: string; unit: string; color: string }> = {
  calories: { label: "Calories", short: "Calories", unit: "kcal", color: "#6750A4" },
  protein: { label: "Protein", short: "Protein", unit: "g", color: "#9333ea" },
  carbs: { label: "Carbs", short: "Carbs", unit: "g", color: "#2563eb" },
  fat: { label: "Fat", short: "Fat", unit: "g", color: "#f97316" },
  fiber: { label: "Fiber", short: "Fiber", unit: "g", color: "#059669" },
};
const MACRO_KEYS: MacroKey[] = ["protein", "carbs", "fat", "fiber"];
// Calories gets its own card above the four-macro grid (see
// MacronutrientSummary's render), but shares the same day-data/averaging
// helpers below, so it's included here for those, not in MACRO_KEYS.
const ALL_KEYS: MacroKey[] = ["calories", ...MACRO_KEYS];

function mealAvg(m: MacroMeal, key: MacroKey): number {
  switch (key) {
    case "calories": return (m.totalCaloriesMin + m.totalCaloriesMax) / 2;
    case "protein": return (m.totalProteinMin + m.totalProteinMax) / 2;
    case "carbs": return (m.totalCarbsMin + m.totalCarbsMax) / 2;
    case "fat": return (m.totalFatMin + m.totalFatMax) / 2;
    case "fiber": return (m.totalFiberMin + m.totalFiberMax) / 2;
  }
}

function buildDayData(meals: MacroMeal[], days: number) {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-IN", { weekday: "short" });
    const dayMeals = meals.filter((m) => m.loggedAt.slice(0, 10) === key);
    const entry: Record<string, number | string> = { label, mealCount: dayMeals.length };
    for (const macroKey of ALL_KEYS) {
      entry[macroKey] = dayMeals.length ? Math.round(dayMeals.reduce((s, m) => s + mealAvg(m, macroKey), 0)) : 0;
    }
    return entry;
  });
}

// Averages over the days a meal was actually logged, not every day in the
// selected range — otherwise someone who only logged meals on 5 of the
// last 90 days would see an average diluted by 85 zero days, making
// "Last 90 days" look like they're barely eating anything.
function averagePerDay(meals: MacroMeal[], key: MacroKey): number {
  if (!meals.length) return 0;
  const distinctDaysLogged = new Set(meals.map((m) => m.loggedAt.slice(0, 10))).size;
  const total = meals.reduce((s, m) => s + mealAvg(m, key), 0);
  return Math.round(total / distinctDaysLogged);
}

interface Props {
  meals: MacroMeal[];
  /** Number of days in the currently selected date range — used both to
   * compute the "average per day" figures and to size the detail chart.
   * Capped internally for chart display so a "This year"/"All time"
   * selection doesn't try to render hundreds of daily bars. */
  days: number;
  targets?: Partial<Record<MacroKey, number>>;
  /** Opts into dark: classes — only ProfileDashboard's family_admin/
   * participant callers set this (see ProfileDashboardTheme.
   * enableDarkMode); the gym/coach caller doesn't. */
  dm?: boolean;
}

/** The single unified macro section — replaces the old separate Protein
 * and Calories charts. Desktop shows four compact cards side by side, each
 * with its own mini chart; mobile shows four small pills plus one larger
 * detail chart for whichever macro is selected (Protein by default),
 * rather than stacking four full-height charts. */
export function MacronutrientSummary({ meals, days, targets, dm }: Props) {
  const [selected, setSelected] = useState<MacroKey>("protein");
  const chartDays = Math.min(Math.max(days, 1), 30);
  const dayData = buildDayData(meals, chartDays);
  // The mini bar charts have no x-axis, so without this someone can easily
  // mistake the bars for "today" or forget what window they're looking at.
  const rangeLabel = chartDays === 1 ? "Today" : `Last ${chartDays} days`;

  const averages = Object.fromEntries(
    ALL_KEYS.map((key) => [key, averagePerDay(meals, key)])
  ) as Record<MacroKey, number>;

  return (
    <>
      {/* Total calories gets its own card, matching the macro cards' style
          (average, target reference line, mini chart) — kept separate from
          the four-macro grid below rather than a fifth grid column, so it
          reads as the headline number rather than one more equal-weight
          macro. */}
      <div className={`bg-white rounded-2xl border border-gray-100 p-4 mb-4 ${dm ? "dark:bg-[var(--color-dashboard-dark-card)] dark:border-white/10" : ""}`}>
        <div className="flex items-center justify-between mb-4">
          <p className={`text-xs font-semibold text-gray-500 uppercase tracking-widest ${dm ? "dark:text-gray-400" : ""}`}>Total calories</p>
          <p className={`text-xs text-gray-400 ${dm ? "dark:text-gray-500" : ""}`}>{rangeLabel}</p>
        </div>
        <MacroCard macroKey="calories" average={averages.calories} target={targets?.calories} data={dayData} dm={dm} />
      </div>

      <div className={`bg-white rounded-2xl border border-gray-100 p-4 ${dm ? "dark:bg-[var(--color-dashboard-dark-card)] dark:border-white/10" : ""}`}>
        <div className="flex items-center justify-between mb-4">
          <p className={`text-xs font-semibold text-gray-500 uppercase tracking-widest ${dm ? "dark:text-gray-400" : ""}`}>Macronutrient summary</p>
          <p className={`text-xs text-gray-400 ${dm ? "dark:text-gray-500" : ""}`}>{rangeLabel}</p>
        </div>

      {/* Desktop / tablet: two cards per row (rather than cramming all four
          into one row) so each mini chart has enough width to stay legible
          at typical desktop sizes — four-across only kicked in readable
          once the viewport narrowed enough to switch to the mobile layout
          below, which defeated the point of a "desktop" layout. */}
      <div className="hidden sm:grid grid-cols-2 xl:grid-cols-4 gap-3">
        {MACRO_KEYS.map((key) => (
          <MacroCard key={key} macroKey={key} average={averages[key]} target={targets?.[key]} data={dayData} dm={dm} />
        ))}
      </div>

      {/* Mobile: compact pills first, one detail chart for the selected macro below */}
      <div className="sm:hidden">
        <div className="grid grid-cols-4 gap-2 mb-4">
          {MACRO_KEYS.map((key) => (
            <MacroPill
              key={key}
              macroKey={key}
              average={averages[key]}
              target={targets?.[key]}
              active={key === selected}
              onClick={() => setSelected(key)}
              dm={dm}
            />
          ))}
        </div>
        <MacroDetailChart macroKey={selected} data={dayData} target={targets?.[selected]} dm={dm} />
      </div>
      </div>
    </>
  );
}

function actualVsTargetOk(average: number, target?: number): boolean | null {
  if (!target) return null;
  return average >= target * 0.8;
}

function MacroCard({ macroKey, average, target, data, dm }: { macroKey: MacroKey; average: number; target?: number; data: any[]; dm?: boolean }) {
  const meta = MACRO_META[macroKey];
  const ok = actualVsTargetOk(average, target);
  return (
    <div className={`rounded-xl border border-gray-100 p-4 ${dm ? "dark:border-white/10" : ""}`}>
      <div className="flex items-center justify-between mb-1">
        <p className={`text-sm font-semibold text-gray-600 ${dm ? "dark:text-gray-300" : ""}`}>{meta.label}</p>
        {ok !== null && (
          <span
            className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-[var(--color-status-good-dot)]" : "bg-[var(--color-status-steady-dot)]"}`}
            aria-hidden="true"
          />
        )}
      </div>
      <p className={`text-2xl font-bold text-gray-900 leading-tight ${dm ? "dark:text-white" : ""}`}>
        {average}
        <span className={`text-sm font-medium text-gray-400 ${dm ? "dark:text-gray-500" : ""}`}>{meta.unit}/day</span>
      </p>
      {target ? (
        <p className={`text-xs text-gray-400 mb-2 ${dm ? "dark:text-gray-500" : ""}`}>target {target}{meta.unit}</p>
      ) : (
        <p className="text-xs text-gray-400 mb-2">&nbsp;</p>
      )}
      <div className="h-20 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            {/* Without an explicit YAxis, Recharts scales the domain from
                the Bar values alone — a target above the tallest bar would
                place the ReferenceLine outside the chart entirely. Hidden
                axis, but its domain still has to include the target. */}
            <YAxis hide domain={[0, (dataMax: number) => Math.max(dataMax, target ?? 0) * 1.15]} />
            {target && <ReferenceLine y={target} stroke={meta.color} strokeDasharray="4 3" strokeWidth={1.5} />}
            {/* minPointSize keeps every day's column visible (a faint nub)
                even at value 0, so a week with only 1-2 logged days doesn't
                look like the other 5-6 days don't exist — the underlying
                value/tooltip is untouched, only the rendered bar height.
                The zero-value nubs are then dimmed via Cell so they read as
                "no data" rather than "a tiny amount was logged". */}
            <Bar dataKey={macroKey} radius={[3, 3, 0, 0]} maxBarSize={14} minPointSize={3}>
              {data.map((d, i) => (
                <Cell key={i} fill={meta.color} fillOpacity={(d[macroKey] as number) > 0 ? 1 : 0.25} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function MacroPill({
  macroKey, average, target, active, onClick, dm,
}: { macroKey: MacroKey; average: number; target?: number; active: boolean; onClick: () => void; dm?: boolean }) {
  const meta = MACRO_META[macroKey];
  const ok = actualVsTargetOk(average, target);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-2 py-2 text-left transition-colors ${
        active
          ? "bg-[var(--color-dashboard-primary-light)] ring-1 ring-[var(--color-dashboard-primary)]/30"
          : `bg-gray-50 ${dm ? "dark:bg-white/5" : ""}`
      }`}
    >
      <div className="flex items-center gap-1 mb-0.5">
        <span className={`text-[11px] font-semibold text-gray-600 ${dm ? "dark:text-gray-300" : ""}`}>{meta.short}</span>
        {ok !== null && (
          <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-[var(--color-status-good-dot)]" : "bg-[var(--color-status-steady-dot)]"}`} aria-hidden="true" />
        )}
      </div>
      <p className={`text-sm font-bold text-gray-900 leading-none ${dm ? "dark:text-white" : ""}`}>
        {average}<span className={`text-[10px] font-medium text-gray-400 ${dm ? "dark:text-gray-500" : ""}`}>{meta.unit}</span>
      </p>
    </button>
  );
}

// Fixed per-day width rather than stretching every bar to fill the card —
// at a 30-day range, ResponsiveContainer squeezing 30 bars into one
// screen-width chart made both the bars and the day-of-week labels
// illegible. Past this many days, the chart switches to a fixed bar width
// inside a horizontally scrollable container instead of shrinking further.
const BAR_COLUMN_WIDTH = 36;
const SCROLL_THRESHOLD = 10;

function MacroDetailChart({ macroKey, data, target, dm }: { macroKey: MacroKey; data: any[]; target?: number; dm?: boolean }) {
  const meta = MACRO_META[macroKey];
  const max = Math.max(...data.map((d) => d[macroKey] as number), target ?? 0, 10);
  const scrollable = data.length > SCROLL_THRESHOLD;
  // Recharts SVG props can't take a Tailwind dark: class — this component
  // doesn't know the OS color scheme, only whether its caller opted into
  // dark mode at all (dm), so it can't react live to a scheme change
  // without a remount. Acceptable here: ProfileDashboardTheme.
  // enableDarkMode is static per role, not a live toggle.
  const axisColor = dm ? "#71717a" : "#9ca3af";
  const gridColor = dm ? "rgba(255,255,255,0.08)" : "#f0f0f0";

  const chart = (
    <BarChart data={data} width={scrollable ? data.length * BAR_COLUMN_WIDTH : undefined} height={140} margin={{ top: 4, right: 0, left: -22, bottom: 0 }}>
      <CartesianGrid vertical={false} stroke={gridColor} />
      <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
      <YAxis tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} domain={[0, max + Math.ceil(max * 0.2)]} />
      <Tooltip
        content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const d = payload[0].payload;
          return (
            <div className={`bg-white border border-gray-100 rounded-xl px-3 py-2 shadow-lg text-xs ${dm ? "dark:bg-[var(--color-dashboard-dark-card)] dark:border-white/10" : ""}`}>
              <p className={`font-semibold text-gray-900 ${dm ? "dark:text-white" : ""}`}>{d[macroKey]}{meta.unit}</p>
              <p className={`text-gray-400 ${dm ? "dark:text-gray-500" : ""}`}>{d.mealCount} meal{d.mealCount !== 1 ? "s" : ""}</p>
            </div>
          );
        }}
      />
      {target && <ReferenceLine y={target} stroke={meta.color} strokeDasharray="4 3" strokeWidth={1.5} />}
      <Bar dataKey={macroKey} radius={[4, 4, 0, 0]} maxBarSize={28} minPointSize={3}>
        {data.map((d, i) => (
          <Cell key={i} fill={meta.color} fillOpacity={(d[macroKey] as number) > 0 ? 1 : 0.25} />
        ))}
      </Bar>
    </BarChart>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className={`text-sm font-semibold text-gray-700 ${dm ? "dark:text-gray-300" : ""}`}>{meta.label} ({meta.unit})</p>
        {target && <span className="text-xs font-medium" style={{ color: meta.color }}>Target: {target}{meta.unit}</span>}
      </div>
      {scrollable ? (
        <div className="overflow-x-auto">{chart}</div>
      ) : (
        <ResponsiveContainer width="100%" height={140}>
          {chart}
        </ResponsiveContainer>
      )}
    </div>
  );
}
