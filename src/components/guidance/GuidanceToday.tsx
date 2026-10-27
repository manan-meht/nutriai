import type { NutrientDay } from "@/lib/guidance/daily-totals";
import type { TodayProgress } from "@/lib/guidance/view";

// Today's intake against today's target. Three states per nutrient, as
// daily-totals.ts distinguishes them: a figure, a figure known to be a
// floor (some meal reported nothing), and no meals yet. "Over" is shown in
// the soft amber status colour, never red: a food target is not a debt,
// and going past one is not a failure.

const ROWS: Array<{ key: "calories" | "protein" | "carbs" | "fat" | "fiber"; label: string; unit: string }> = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "carbs", label: "Carbs", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" },
  { key: "fiber", label: "Fiber", unit: "g" },
];

/** YYYY-MM-DD as a readable day. Formatted in UTC from noon so the date
 * cannot shift, and with a fixed locale so the server and browser render
 * the same text. */
export function formatDay(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`)
  );
}

function NutrientRow({ label, unit, day }: { label: string; unit: string; day: NutrientDay }) {
  const pct = day.target > 0 ? Math.min(100, (day.consumed / day.target) * 100) : 0;
  const status =
    day.over > 0
      ? `${day.over.toLocaleString("en-US")} ${unit} over`
      : day.remaining > 0
        ? `${day.remaining.toLocaleString("en-US")} ${unit} left`
        : "On target";

  return (
    <li className="py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-gray-900">{label}</span>
        <span className="text-sm text-gray-700 tabular-nums">
          {day.isIncomplete && <span className="text-gray-500">at least </span>}
          {day.consumed.toLocaleString("en-US")} / {day.target.toLocaleString("en-US")} {unit}
        </span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-[var(--color-fbs-ring-track)] overflow-hidden" aria-hidden="true">
        <div
          className={`h-full rounded-full ${day.over > 0 ? "bg-[var(--color-status-steady-dot)]" : "bg-[var(--color-dashboard-primary)]"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between gap-3 text-xs">
        <span className={day.over > 0 ? "text-[var(--color-status-steady-text)]" : "text-gray-500"}>{status}</span>
        {day.isIncomplete && (
          <span className="text-gray-500">
            {day.mealsMissingData} {day.mealsMissingData === 1 ? "meal" : "meals"} had no {label.toLowerCase()} estimate
          </span>
        )}
      </div>
    </li>
  );
}

export function GuidanceToday({ today }: { today: TodayProgress | null }) {
  if (!today) {
    return (
      <section className="bg-white border border-gray-100 rounded-2xl p-5">
        <h2 className="text-base font-semibold text-gray-900">Today</h2>
        <p className="text-sm text-gray-500 mt-1">There&apos;s no target for today yet. It starts on the day Guidance was turned on.</p>
      </section>
    );
  }

  const { totals, target } = today;

  return (
    <section className="bg-white border border-gray-100 rounded-2xl p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900">Today</h2>
        <span className="text-sm text-gray-500">{formatDay(today.date)}</span>
      </div>
      <p className="text-sm text-gray-500 mt-1">
        {totals.mealCount === 0
          ? "No meals logged yet today."
          : `${totals.mealCount} ${totals.mealCount === 1 ? "meal" : "meals"} logged today.`}
        {totals.hasIncompleteData && " Some meals are missing an estimate, so a few totals are a minimum."}
      </p>

      <ul className="mt-2 divide-y divide-gray-100">
        {ROWS.map((row) => (
          <NutrientRow key={row.key} label={row.label} unit={row.unit} day={totals[row.key]} />
        ))}
      </ul>

      <details className="mt-3 text-sm text-gray-600">
        <summary className="cursor-pointer text-gray-900 font-medium">How these targets were set</summary>
        <p className="mt-2 whitespace-pre-line">{target.explanation}</p>
        <p className="mt-2 text-xs text-gray-500">
          In effect since {formatDay(target.effectiveFrom)} · policy {target.policyVersion}
        </p>
      </details>
    </section>
  );
}
