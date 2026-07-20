"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
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
  totalProteinMin: number;
  totalProteinMax: number;
  totalCarbsMin: number;
  totalCarbsMax: number;
  totalFatMin: number;
  totalFatMax: number;
  totalFiberMin: number;
  totalFiberMax: number;
}

type MacroKey = "protein" | "carbs" | "fat" | "fiber";

const MACRO_META: Record<MacroKey, { label: string; short: string; unit: string; color: string }> = {
  protein: { label: "Protein", short: "Protein", unit: "g", color: "#9333ea" },
  carbs: { label: "Carbs", short: "Carbs", unit: "g", color: "#2563eb" },
  fat: { label: "Fat", short: "Fat", unit: "g", color: "#f97316" },
  fiber: { label: "Fiber", short: "Fiber", unit: "g", color: "#059669" },
};
const MACRO_KEYS: MacroKey[] = ["protein", "carbs", "fat", "fiber"];

function mealAvg(m: MacroMeal, key: MacroKey): number {
  switch (key) {
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
    for (const macroKey of MACRO_KEYS) {
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
}

/** The single unified macro section — replaces the old separate Protein
 * and Calories charts. Desktop shows four compact cards side by side, each
 * with its own mini chart; mobile shows four small pills plus one larger
 * detail chart for whichever macro is selected (Protein by default),
 * rather than stacking four full-height charts. */
export function MacronutrientSummary({ meals, days, targets }: Props) {
  const [selected, setSelected] = useState<MacroKey>("protein");
  const chartDays = Math.min(Math.max(days, 1), 30);
  const dayData = buildDayData(meals, chartDays);

  const averages = Object.fromEntries(
    MACRO_KEYS.map((key) => [key, averagePerDay(meals, key)])
  ) as Record<MacroKey, number>;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">Macronutrient summary</p>

      {/* Desktop / tablet: two cards per row (rather than cramming all four
          into one row) so each mini chart has enough width to stay legible
          at typical desktop sizes — four-across only kicked in readable
          once the viewport narrowed enough to switch to the mobile layout
          below, which defeated the point of a "desktop" layout. */}
      <div className="hidden sm:grid grid-cols-2 xl:grid-cols-4 gap-3">
        {MACRO_KEYS.map((key) => (
          <MacroCard key={key} macroKey={key} average={averages[key]} target={targets?.[key]} data={dayData} />
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
            />
          ))}
        </div>
        <MacroDetailChart macroKey={selected} data={dayData} target={targets?.[selected]} />
      </div>
    </div>
  );
}

function actualVsTargetOk(average: number, target?: number): boolean | null {
  if (!target) return null;
  return average >= target * 0.8;
}

function MacroCard({ macroKey, average, target, data }: { macroKey: MacroKey; average: number; target?: number; data: any[] }) {
  const meta = MACRO_META[macroKey];
  const ok = actualVsTargetOk(average, target);
  return (
    <div className="rounded-xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-semibold text-gray-600">{meta.label}</p>
        {ok !== null && (
          <span
            className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-[var(--color-status-good-dot)]" : "bg-[var(--color-status-steady-dot)]"}`}
            aria-hidden="true"
          />
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900 leading-tight">
        {average}
        <span className="text-sm font-medium text-gray-400">{meta.unit}/day</span>
      </p>
      {target ? (
        <p className="text-xs text-gray-400 mb-2">target {target}{meta.unit}</p>
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
            <Bar dataKey={macroKey} fill={meta.color} radius={[3, 3, 0, 0]} maxBarSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function MacroPill({
  macroKey, average, target, active, onClick,
}: { macroKey: MacroKey; average: number; target?: number; active: boolean; onClick: () => void }) {
  const meta = MACRO_META[macroKey];
  const ok = actualVsTargetOk(average, target);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-2 py-2 text-left transition-colors ${
        active ? "bg-[var(--color-dashboard-primary-light)] ring-1 ring-[var(--color-dashboard-primary)]/30" : "bg-gray-50"
      }`}
    >
      <div className="flex items-center gap-1 mb-0.5">
        <span className="text-[11px] font-semibold text-gray-600">{meta.short}</span>
        {ok !== null && (
          <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-[var(--color-status-good-dot)]" : "bg-[var(--color-status-steady-dot)]"}`} aria-hidden="true" />
        )}
      </div>
      <p className="text-sm font-bold text-gray-900 leading-none">
        {average}<span className="text-[10px] font-medium text-gray-400">{meta.unit}</span>
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

function MacroDetailChart({ macroKey, data, target }: { macroKey: MacroKey; data: any[]; target?: number }) {
  const meta = MACRO_META[macroKey];
  const max = Math.max(...data.map((d) => d[macroKey] as number), target ?? 0, 10);
  const scrollable = data.length > SCROLL_THRESHOLD;

  const chart = (
    <BarChart data={data} width={scrollable ? data.length * BAR_COLUMN_WIDTH : undefined} height={140} margin={{ top: 4, right: 0, left: -22, bottom: 0 }}>
      <CartesianGrid vertical={false} stroke="#f0f0f0" />
      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
      <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} domain={[0, max + Math.ceil(max * 0.2)]} />
      <Tooltip
        content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const d = payload[0].payload;
          return (
            <div className="bg-white border border-gray-100 rounded-xl px-3 py-2 shadow-lg text-xs">
              <p className="font-semibold text-gray-900">{d[macroKey]}{meta.unit}</p>
              <p className="text-gray-400">{d.mealCount} meal{d.mealCount !== 1 ? "s" : ""}</p>
            </div>
          );
        }}
      />
      {target && <ReferenceLine y={target} stroke={meta.color} strokeDasharray="4 3" strokeWidth={1.5} />}
      <Bar dataKey={macroKey} fill={meta.color} radius={[4, 4, 0, 0]} maxBarSize={28} />
    </BarChart>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-gray-700">{meta.label} ({meta.unit})</p>
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
