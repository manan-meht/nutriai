import type { NutrientDay } from "@/lib/guidance/daily-totals";
import { NUTRIENTS, type NutrientKey } from "@/lib/guidance/meal-impact";

// Shared pieces of the Guidance screens: the card and button styles, number
// formatting, and the progress bar. Colours are the .guidance-theme tokens
// in globals.css (charcoal and lavender).

export type GuidanceViewer = { kind: "self" } | { kind: "family"; name: string } | { kind: "coach"; name: string };

/** "your" for someone looking at their own profile, else "Kamlesh's". */
export const possessive = (viewer: GuidanceViewer) => (viewer.kind === "self" ? "your" : `${viewer.name}'s`);
export const Possessive = (viewer: GuidanceViewer) => (viewer.kind === "self" ? "Your" : `${viewer.name}'s`);

export const card = "rounded-2xl border border-[var(--gm-border)] bg-[var(--gm-card)] p-5 sm:p-6";
export const eyebrow = "text-xs font-semibold uppercase tracking-wider";
export const primaryAction =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--gm-accent)] px-5 py-2.5 text-sm font-semibold text-[var(--gm-on-accent)] hover:bg-[var(--gm-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--gm-page)] disabled:opacity-60 transition";
export const quietButton =
  "inline-flex items-center gap-1 text-sm font-medium text-[var(--gm-accent-text)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)] rounded disabled:opacity-60";

export const fmt = (n: number) => n.toLocaleString("en-US");
export const unitOf = (key: NutrientKey) => NUTRIENTS.find((n) => n.key === key)!.unit;
export const labelOf = (key: NutrientKey) =>
  key === "calories" ? "Energy" : key === "fiber" ? "Fibre" : NUTRIENTS.find((n) => n.key === key)!.label;
export const amount = (n: number, key: NutrientKey) => (unitOf(key) === "kcal" ? `${fmt(n)} kcal` : `${fmt(n)} g`);
/** Energy is rounded to 10 kcal so it doesn't look measured. Grams stay
 * whole: rounding them to 5 made two averages and their difference
 * disagree on screen ("50 g … 5 g more than 50 g"). */
export const roughly = (n: number, key: NutrientKey) => (key === "calories" ? Math.round(n / 10) * 10 : Math.round(n));
/** Energy carries a "~": it's an estimate from a photo, never a measurement. */
export const estimate = (n: number, key: NutrientKey) => (key === "calories" ? `~${fmt(roughly(n, key))}` : fmt(roughly(n, key)));

export function timeIn(iso: string, timezone: string, opts: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: timezone }).format(new Date(iso));
  } catch {
    return "";
  }
}

/** "8:10 am", in the person's timezone. */
export function clockTime(iso: string, timezone: string): string {
  return timeIn(iso, timezone, { hour: "numeric", minute: "2-digit", hour12: true }).replace(/\s?([ap])\.?m\.?/i, " $1m").toLowerCase();
}

export function mealLabel(mealType: string | null): string {
  if (!mealType) return "Meal";
  return mealType.charAt(0).toUpperCase() + mealType.slice(1).replace(/_/g, " ");
}

/** "Paratha, egg bhurji & milk". */
export function foodsTitle(foods: Array<{ name: string }>): string {
  const names = foods.map((f) => f.name.charAt(0).toUpperCase() + f.name.slice(1));
  if (names.length === 0) return "Logged meal";
  const lower = names.map((n, i) => (i === 0 ? n : n.charAt(0).toLowerCase() + n.slice(1)));
  return lower.length === 1 ? lower[0] : `${lower.slice(0, -1).join(", ")} & ${lower[lower.length - 1]}`;
}

const day = (date: string) => new Date(`${date}T12:00:00Z`);
const part = (date: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(day(date));

/** "Monday, 9 November". From the date alone, so server and browser agree. */
export function longDate(date: string): string {
  return `${part(date, { weekday: "long" })}, ${part(date, { day: "numeric", month: "long" })}`;
}

/** "2–8 November", or "26 October – 1 November" across months. */
export function rangeText(start: string, end: string): string {
  if (start.slice(0, 7) === end.slice(0, 7)) {
    return `${part(start, { day: "numeric" })}–${part(end, { day: "numeric", month: "long" })}`;
  }
  return `${part(start, { day: "numeric", month: "long" })} – ${part(end, { day: "numeric", month: "long" })}`;
}

export const weekdayShort = (date: string) => part(date, { weekday: "short" });
export const dayOfMonth = (date: string) => part(date, { day: "numeric" });

/** Going over is only worth a different colour for energy: more protein or
 * fibre than the target isn't something to flag. Soft amber, never red. */
export const overIsNotable = (key: NutrientKey) => key === "calories";

export function Bar({ day: d, nutrient }: { day: NutrientDay; nutrient: NutrientKey }) {
  const pct = d.target > 0 ? Math.min(100, (d.consumed / d.target) * 100) : 0;
  return (
    <div className="h-2.5 rounded-full bg-[var(--gm-track)] overflow-hidden" aria-hidden="true">
      <div
        className={`h-full rounded-full ${d.over > 0 && overIsNotable(nutrient) ? "bg-[var(--gm-over)]" : "bg-[var(--gm-accent)]"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function NutrientRow({ day: d, nutrient }: { day: NutrientDay; nutrient: NutrientKey }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium text-[var(--gm-text)]">{labelOf(nutrient)}</span>
        <span className="tabular-nums text-[var(--gm-text)]">
          {d.isIncomplete && <span className="text-[var(--gm-text-secondary)]">at least </span>}
          {estimate(d.consumed, nutrient)} / {amount(d.target, nutrient)}
        </span>
      </div>
      <div className="mt-2">
        <Bar day={d} nutrient={nutrient} />
      </div>
    </div>
  );
}

export function Chevron({ direction = "right", className = "" }: { direction?: "right" | "down" | "up"; className?: string }) {
  const rotate = direction === "down" ? "rotate-90" : direction === "up" ? "-rotate-90" : "";
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      className={`shrink-0 transition-transform ${rotate} ${className}`}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
    </svg>
  );
}

export const Arrow = () => <span aria-hidden="true">→</span>;
