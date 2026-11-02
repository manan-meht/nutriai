import type { NutrientDay } from "@/lib/guidance/daily-totals";
import type { TodayProgress } from "@/lib/guidance/view";

// Today's intake against today's target. Three states per nutrient, as
// daily-totals.ts distinguishes them: a figure, a figure known to be a
// floor (some meal reported nothing), and no meals yet. "Over" is shown in
// the soft amber status colour, never red: a food target is not a debt,
// and going past one is not a failure. Colours are the Midnight teal
// tokens from .guidance-theme (globals.css).

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
        <span className="text-sm font-medium text-[var(--gm-text)]">{label}</span>
        <span className="text-sm text-[var(--gm-text-secondary)] tabular-nums">
          {day.isIncomplete && <span className="text-[var(--gm-text-muted)]">at least </span>}
          {day.consumed.toLocaleString("en-US")} / {day.target.toLocaleString("en-US")} {unit}
        </span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-[var(--gm-track)] overflow-hidden" aria-hidden="true">
        <div
          className={`h-full rounded-full ${day.over > 0 ? "bg-[var(--gm-over)]" : "bg-[var(--gm-accent)]"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between gap-3 text-xs">
        <span className={day.over > 0 ? "text-[var(--gm-over-text)]" : "text-[var(--gm-text-muted)]"}>{status}</span>
        {day.isIncomplete && (
          <span className="text-[var(--gm-text-muted)]">
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
      <section className="bg-[var(--gm-card)] border border-[var(--gm-border)] rounded-2xl p-5">
        <h2 className="text-base font-semibold text-[var(--gm-text)]">Today</h2>
        <p className="text-sm text-[var(--gm-text-secondary)] mt-1">There&apos;s no target for today yet. It starts on the day Guidance was turned on.</p>
      </section>
    );
  }

  const { totals, target } = today;

  return (
    <section className="bg-[var(--gm-card)] border border-[var(--gm-border)] rounded-2xl p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-[var(--gm-text)]">Today</h2>
        <span className="text-sm text-[var(--gm-text-muted)]">{formatDay(today.date)}</span>
      </div>
      <p className="text-sm text-[var(--gm-text-secondary)] mt-1">
        {totals.mealCount === 0
          ? "No meals logged yet today."
          : `${totals.mealCount} ${totals.mealCount === 1 ? "meal" : "meals"} logged today.`}
        {totals.hasIncompleteData && " Some meals are missing an estimate, so a few totals are a minimum."}
      </p>

      <ul className="mt-2 divide-y divide-[var(--gm-border)]">
        {ROWS.map((row) => (
          <NutrientRow key={row.key} label={row.label} unit={row.unit} day={totals[row.key]} />
        ))}
      </ul>

      <details className="mt-3 text-sm text-[var(--gm-text-secondary)]">
        <summary className="cursor-pointer text-[var(--gm-text)] font-medium">How these targets were set</summary>
        <p className="mt-2 whitespace-pre-line">{target.explanation}</p>
        <p className="mt-2 text-xs text-[var(--gm-text-muted)]">
          In effect since {formatDay(target.effectiveFrom)} · policy {target.policyVersion}
        </p>
      </details>
    </section>
  );
}
