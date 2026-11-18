// The Guidance screens' formatting and wording, without React.
//
// Mirrors the web app's src/components/guidance/ui.tsx (number and date
// formatting) and the text decisions inside its GuidanceTodayTab,
// GuidanceProgressTab, GuidanceHabitCards and GuidanceMicronutrients, plus
// the pure helpers they import (mealValues from lib/guidance/meal-impact.ts,
// nutrientValue and localDate from daily-totals.ts, slotOfMealType from
// meal-slots.ts). Keep in sync by hand when that copy changes.
//
// Two deliberate differences from the web, both for Hermes rather than
// behaviour: dates that are already YYYY-MM-DD are named from fixed English
// tables (the web formats them in UTC with en-GB, which gives the same
// strings), and a moment in the person's timezone is read with
// formatToParts rather than relying on the en-CA locale's date shape.
//
// Dependency-free and imported by relative path, so the repo's root jest
// config can test it (it maps "@/" to the web app's src).

import { periodFor, type Comparison, type DaySummary, type NutrientStats, type PeriodKind } from './guidance-aggregation';
import type {
  AssessmentStatus,
  ConfirmedMealRow,
  DailyTotals,
  GuidanceDashboard,
  HabitProgress,
  MealSlot,
  MicronutrientAssessment,
  MicronutrientPeriodView,
  NutrientDay,
  NutrientKey,
} from './guidance-types';

// ─── Nutrients and meals ────────────────────────────────────────────────────

export const GUIDANCE_NUTRIENTS: Array<{ key: NutrientKey; label: string; unit: 'kcal' | 'g' }> = [
  { key: 'calories', label: 'Calories', unit: 'kcal' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
  { key: 'fiber', label: 'Fiber', unit: 'g' },
];

export const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'snack', 'dinner'];
/** The meals a skip can be confirmed for. Snacks are optional by nature. */
export const MAIN_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];

export function slotOfMealType(mealType: string | null): MealSlot | null {
  return mealType === 'breakfast' || mealType === 'lunch' || mealType === 'snack' || mealType === 'dinner' ? mealType : null;
}

/** One meal's value for a nutrient, or null when it genuinely has none. A
 * single-sided range is not averaged against zero. */
export function nutrientValue(min: number | null, max: number | null): number | null {
  if (min == null && max == null) return null;
  if (min == null) return max;
  if (max == null) return min;
  return (min + max) / 2;
}

/** One meal's own value per nutrient, rounded, or null when the meal
 * reported nothing for it: never zero standing in for unknown. */
export function mealValues(m: ConfirmedMealRow): Record<NutrientKey, number | null> {
  const round = (v: number | null) => (v == null ? null : Math.round(v));
  return {
    calories: round(nutrientValue(m.totalCaloriesMin, m.totalCaloriesMax)),
    protein: round(nutrientValue(m.totalProteinMin, m.totalProteinMax)),
    carbs: round(nutrientValue(m.totalCarbsMin, m.totalCarbsMax)),
    fat: round(nutrientValue(m.totalFatMin, m.totalFatMax)),
    fiber: round(nutrientValue(m.totalFiberMin, m.totalFiberMax)),
  };
}

// ─── Who is looking ─────────────────────────────────────────────────────────

export type GuidanceViewer = { kind: 'self' } | { kind: 'family'; name: string } | { kind: 'coach'; name: string };

/** As the web's ProfileDashboard decides it: someone tracking themselves,
 * else a coach's client or a family member, by first name. */
export function viewerFor(params: { fullName: string; isCoach: boolean; relationshipType?: string | null }): GuidanceViewer {
  const firstName = params.fullName.trim().split(/\s+/)[0] || params.fullName;
  if (params.relationshipType === 'self') return { kind: 'self' };
  return params.isCoach ? { kind: 'coach', name: firstName } : { kind: 'family', name: firstName };
}

/** "your" for someone looking at their own profile, else "Kamlesh's". */
export const possessive = (viewer: GuidanceViewer) => (viewer.kind === 'self' ? 'your' : `${viewer.name}'s`);
export const Possessive = (viewer: GuidanceViewer) => (viewer.kind === 'self' ? 'Your' : `${viewer.name}'s`);

// ─── Numbers ────────────────────────────────────────────────────────────────

/** 1,436 — en-US grouping, as the web's toLocaleString("en-US"), without
 * depending on the engine's Intl. Up to three decimals, like the default. */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const rounded = Math.round(n * 1000) / 1000;
  const sign = rounded < 0 ? '-' : '';
  const [int, frac] = Math.abs(rounded).toString().split('.');
  return `${sign}${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${frac ? `.${frac}` : ''}`;
}

export const unitOf = (key: NutrientKey) => GUIDANCE_NUTRIENTS.find((n) => n.key === key)!.unit;
export const labelOf = (key: NutrientKey) =>
  key === 'calories' ? 'Energy' : key === 'fiber' ? 'Fibre' : GUIDANCE_NUTRIENTS.find((n) => n.key === key)!.label;
export const amount = (n: number, key: NutrientKey) => (unitOf(key) === 'kcal' ? `${fmt(n)} kcal` : `${fmt(n)} g`);
/** Energy is rounded to 10 kcal so it doesn't look measured. Grams stay whole. */
export const roughly = (n: number, key: NutrientKey) => (key === 'calories' ? Math.round(n / 10) * 10 : Math.round(n));
/** Energy carries a "~": it's an estimate from a photo, never a measurement. */
export const estimate = (n: number, key: NutrientKey) => (key === 'calories' ? `~${fmt(roughly(n, key))}` : fmt(roughly(n, key)));
/** Going over is only worth a different colour for energy. Soft amber, never red. */
export const overIsNotable = (key: NutrientKey) => key === 'calories';

// ─── Calendar dates (YYYY-MM-DD, no timezone) ───────────────────────────────

const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// en-GB's own abbreviations, "Sept" included, so the phone and the web agree.
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];

function dateParts(date: string): { day: number; month: number; weekday: number } {
  const [y, m, d] = date.split('-').map(Number);
  return { day: d, month: m - 1, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** "Monday, 9 November". */
export function longDate(date: string): string {
  const p = dateParts(date);
  return `${WEEKDAYS_LONG[p.weekday]}, ${p.day} ${MONTHS_LONG[p.month]}`;
}

/** "2–8 November", or "26 October – 1 November" across months. */
export function rangeText(start: string, end: string): string {
  const s = dateParts(start);
  const e = dateParts(end);
  if (start.slice(0, 7) === end.slice(0, 7)) return `${s.day}–${e.day} ${MONTHS_LONG[e.month]}`;
  return `${s.day} ${MONTHS_LONG[s.month]} – ${e.day} ${MONTHS_LONG[e.month]}`;
}

export const weekdayShort = (date: string) => WEEKDAYS_SHORT[dateParts(date).weekday];
export const dayOfMonth = (date: string) => String(dateParts(date).day);

/** "Mon 9 Nov". */
export function formatDay(date: string): string {
  const p = dateParts(date);
  return `${WEEKDAYS_SHORT[p.weekday]} ${p.day} ${MONTHS_SHORT[p.month]}`;
}

// ─── Moments in the tracked person's timezone ───────────────────────────────

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** A moment's wall-clock reading in `timeZone`, or null when the engine
 * can't say (bad zone, no Intl). Reads parts rather than a formatted string,
 * and copes with an engine that ignores hourCycle and answers in 12-hour. */
export function zonedParts(iso: string, timeZone: string): ZonedParts | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value;
    const year = Number(get('year'));
    const month = Number(get('month'));
    const day = Number(get('day'));
    let hour = Number(get('hour'));
    const minute = Number(get('minute'));
    if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
    const period = get('dayPeriod')?.toLowerCase();
    if (period?.startsWith('p') && hour < 12) hour += 12;
    if (period?.startsWith('a') && hour === 12) hour = 0;
    return { year, month, day, hour: hour % 24, minute };
  } catch {
    return null;
  }
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The local calendar date a moment falls on, in the person's timezone. An
 * unreadable zone falls back to the UTC date, as the web does, so a meal is
 * never dropped from its day entirely. */
export function localDate(iso: string, timeZone: string): string {
  const p = zonedParts(iso, timeZone);
  return p ? `${p.year}-${pad(p.month)}-${pad(p.day)}` : iso.slice(0, 10);
}

/** The hour, 0–23, in the person's timezone, or NaN when unknown. */
export function hourIn(iso: string, timeZone: string): number {
  return zonedParts(iso, timeZone)?.hour ?? Number.NaN;
}

/** "8:10 am", in the person's timezone, or "" when unknown. */
export function clockTime(iso: string, timeZone: string): string {
  const p = zonedParts(iso, timeZone);
  if (!p) return '';
  return `${p.hour % 12 || 12}:${pad(p.minute)} ${p.hour < 12 ? 'am' : 'pm'}`;
}

/** "Mon", in the person's timezone. */
export function weekdayIn(iso: string, timeZone: string): string {
  const p = zonedParts(iso, timeZone);
  return p ? WEEKDAYS_SHORT[new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()] : '';
}

/** "9 Nov", in the person's timezone. */
export function dayMonthIn(iso: string, timeZone: string): string {
  const p = zonedParts(iso, timeZone);
  return p ? `${p.day} ${MONTHS_SHORT[p.month - 1]}` : '';
}

/** The person's timezone, named only when the viewer's own differs, so a
 * family member abroad knows which "day" the dates mean. */
export function timezoneNote(personTimezone: string, viewerTimezone: string | null | undefined): string | null {
  if (!viewerTimezone || viewerTimezone === personTimezone) return null;
  try {
    const name = new Intl.DateTimeFormat('en-GB', { timeZone: personTimezone, timeZoneName: 'long' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName')?.value;
    return name ?? personTimezone.replace(/_/g, ' ');
  } catch {
    return personTimezone.replace(/_/g, ' ');
  }
}

// ─── Meals ──────────────────────────────────────────────────────────────────

export function mealLabel(mealType: string | null): string {
  if (!mealType) return 'Meal';
  return mealType.charAt(0).toUpperCase() + mealType.slice(1).replace(/_/g, ' ');
}

/** "Paratha, egg bhurji & milk". */
export function foodsTitle(foods: Array<{ name: string }>): string {
  const names = foods.map((f) => f.name.charAt(0).toUpperCase() + f.name.slice(1));
  if (names.length === 0) return 'Logged meal';
  const lower = names.map((n, i) => (i === 0 ? n : n.charAt(0).toLowerCase() + n.slice(1)));
  return lower.length === 1 ? lower[0] : `${lower.slice(0, -1).join(', ')} & ${lower[lower.length - 1]}`;
}

/** "Energy ~790 kcal · Protein 30 g · Carbs unknown · …", one meal's own values. */
export function mealValuesLine(meal: ConfirmedMealRow): string {
  const values = mealValues(meal);
  return GUIDANCE_NUTRIENTS.map(({ key }) => {
    const v = values[key];
    return `${labelOf(key)} ${v == null ? 'unknown' : `${estimate(v, key)}${key === 'calories' ? ' kcal' : ' g'}`}`;
  }).join(' · ');
}

/** "30 g protein · ~790 kcal", with "unknown" in place of a missing value. */
export function mealSummaryLine(meal: ConfirmedMealRow): string {
  const values = mealValues(meal);
  return `${values.protein == null ? 'Protein unknown' : `${fmt(values.protein)} g protein`} · ${
    values.calories == null ? 'energy unknown' : `${estimate(values.calories, 'calories')} kcal`
  }`;
}

/** "8:10 am" today, "Mon 8:10 am" on another day. */
export function mealWhen(loggedAt: string, today: string, timeZone: string): string {
  return localDate(loggedAt, timeZone) === today
    ? clockTime(loggedAt, timeZone)
    : `${weekdayIn(loggedAt, timeZone)} ${clockTime(loggedAt, timeZone)}`;
}

/** True when every meal logged that day reported nothing for the
 * nutrient: the day's figure isn't a floor but unknown, and is shown as
 * such rather than as "at least 0". (Nothing logged at all is a real zero
 * so far, not an unknown.) */
export function isUnknownDay(day: NutrientDay, mealCount: number): boolean {
  return mealCount > 0 && day.mealsMissingData >= mealCount;
}

/** "at least ~790 kcal", "~790 kcal" or "unknown", for one day's nutrient. */
export function dayValueText(day: NutrientDay, key: NutrientKey, mealCount: number, floorWord = 'at least '): string {
  if (isUnknownDay(day, mealCount)) return 'unknown';
  return `${day.isIncomplete ? floorWord : ''}${estimate(day.consumed, key)}`;
}

/** One day's totals against its targets, for the daily details. */
export function dayTotalsLine(totals: DailyTotals): string {
  return GUIDANCE_NUTRIENTS.map(({ key }) => {
    const day = totals[key];
    return `${labelOf(key)} ${dayValueText(day, key, totals.mealCount, '≥ ')} / ${amount(day.target, key)}`;
  }).join(' · ');
}

// ─── Today tab ──────────────────────────────────────────────────────────────

/** Which meal is next, by the person's own clock. */
export function nextMealSlot(generatedAt: string, timeZone: string): MealSlot {
  const hour = hourIn(generatedAt, timeZone);
  if (!Number.isFinite(hour) || hour < 10) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 18) return 'snack';
  return 'dinner';
}

export function greeting(
  guidance: Pick<GuidanceDashboard, 'generatedAt' | 'timezone'>,
  viewer: GuidanceViewer,
  firstName: string
): { title: string; subtitle: string } {
  if (viewer.kind !== 'self') {
    return { title: `${viewer.name}'s day`, subtitle: `Let's make ${viewer.name}'s next meal count.` };
  }
  const hour = hourIn(guidance.generatedAt, guidance.timezone);
  const part = !Number.isFinite(hour) || hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  return { title: `Good ${part}, ${firstName}`, subtitle: "Let's make your next meal count." };
}

/** The next-meal card's slot, headline and the line under it. */
export function nextMealHeading(guidance: GuidanceDashboard): { slot: MealSlot; headline: string; subline: string } {
  const totals = guidance.today?.totals;
  const next = guidance.nextSteps?.nextMeal ?? null;
  const slot = next?.slot ?? nextMealSlot(guidance.generatedAt, guidance.timezone);
  const shown = next?.plan?.suggestion ?? (next?.suggestions.kind === 'options' ? next.suggestions.options[0] : null);
  if (!totals || !next) {
    return { slot, headline: 'No target for today', subline: "There's nothing to plan against until a target is set." };
  }
  if (shown) {
    return {
      slot,
      headline: next.plan ? `${mealLabel(slot)} is planned` : shown.headline,
      subline: next.isTomorrow ? "Today's meals are done, so this is for tomorrow." : shown.reason,
    };
  }
  return {
    slot,
    headline: totals.calories.remaining === 0 ? "Today's energy target is reached" : 'No suggestion right now',
    subline: `About ${fmt(roughly(totals.calories.remaining, 'calories'))} kcal and ${fmt(roughly(totals.protein.remaining, 'protein'))} g protein left today.`,
  };
}

/** "About 32 g protein · ~520 kcal · 9 g fibre", leaving out what's unknown. */
export function suggestionEstimateLine(e: Record<NutrientKey, number | null>): string {
  return `About ${[
    e.protein != null && `${fmt(e.protein)} g protein`,
    e.calories != null && `${estimate(e.calories, 'calories')} kcal`,
    e.fiber != null && `${fmt(e.fiber)} g fibre`,
  ]
    .filter(Boolean)
    .join(' · ')}`;
}

// ─── Habits ─────────────────────────────────────────────────────────────────

/** The habit card's progress line on Today. */
export function habitSoFarText(p: HabitProgress): string {
  return p.eligible === 0 ? `No ${p.noun} logged yet this week` : `${p.successes} of ${p.eligible} ${p.noun} so far`;
}

/** What the Progress tab's habit card suggests for next week. */
export function habitNextText(p: HabitProgress): string {
  const ratio = p.eligible === 0 ? 0 : p.successes / p.eligible;
  return p.eligible === 0
    ? `Log ${p.noun} this week to see how it's going.`
    : ratio >= 0.7
      ? 'Keep the same habit next week, or choose a new one.'
      : 'Keep going with the same habit next week.';
}

/** "2 more weren't counted: the estimate needed to check them is missing." */
export function habitUnclearText(unclear: number): string {
  return `${unclear} more ${unclear === 1 ? "wasn't" : "weren't"} counted: the estimate needed to check ${unclear === 1 ? 'it is' : 'them is'} missing.`;
}

// ─── Progress tab ───────────────────────────────────────────────────────────

export function progressHeadline(days: DaySummary[], today: string, viewer: GuidanceViewer, periodKind: PeriodKind): string {
  const past = days.filter((d) => d.date < today);
  const complete = past.filter((d) => d.status === 'complete').length;
  const who = viewer.kind === 'self' ? "You're" : `${viewer.name} is`;
  if (past.length === 0) return periodKind === 'week' ? 'The week has just started' : 'The month has just started';
  if (complete === 0) return 'No complete days yet';
  if (complete >= 3 && complete / past.length >= 0.7) return `${who} building consistency`;
  return `${complete} complete ${complete === 1 ? 'day' : 'days'} so far`;
}

/** The assessment card's sentence and its two stats, from aggregation.ts. */
export function assessmentText(stats: NutrientStats, comparison: Comparison, nutrient: NutrientKey, periodKind: PeriodKind) {
  const name = labelOf(nutrient).toLowerCase();
  const lastPeriod = periodKind === 'week' ? 'last week' : 'last month';
  const sentence =
    stats.average == null
      ? `No fully logged days ${periodKind === 'week' ? 'this week' : 'this month'} to assess ${name} yet.`
      : comparison.kind === 'insufficient'
        ? `${labelOf(nutrient)} averaged ${amount(roughly(stats.average, nutrient), nutrient)} on fully logged days. There aren't enough complete days to compare with ${lastPeriod} yet.`
        : comparison.delta === 0
          ? `${labelOf(nutrient)} held steady on fully logged days, compared with ${lastPeriod}.`
          : `${labelOf(nutrient)} ${comparison.delta > 0 ? 'rose' : 'fell'} on fully logged days, compared with ${lastPeriod}.`;
  return {
    name,
    lastPeriod,
    sentence,
    average: stats.average == null ? '–' : amount(roughly(stats.average, nutrient), nutrient),
    averageCaption: `average ${name} · ${stats.usableDays} complete ${stats.usableDays === 1 ? 'day' : 'days'}`,
    change:
      comparison.kind === 'insufficient'
        ? '–'
        : `${comparison.delta > 0 ? '+' : comparison.delta < 0 ? '−' : '±'}${amount(Math.abs(roughly(comparison.delta, nutrient)), nutrient)}`,
    changeCaption:
      comparison.kind === 'insufficient'
        ? `vs ${lastPeriod}: needs ${comparison.required} complete days in each`
        : `vs ${lastPeriod} (${amount(roughly(comparison.previous, nutrient), nutrient)}, ${comparison.previousDays} days)`,
  };
}

/** The chart's scale: one target line when the target held all period,
 * else a mark per day, and headroom above the tallest bar or target. */
export function chartScale(days: DaySummary[], nutrient: NutrientKey): { singleTarget: number | null; maxValue: number } {
  const targets = new Set(days.map((d) => d.totals[nutrient].target));
  return {
    singleTarget: targets.size === 1 ? [...targets][0] : null,
    maxValue: Math.max(1, ...days.map((d) => Math.max(d.totals[nutrient].consumed, d.totals[nutrient].target))) * 1.08,
  };
}

/** For a recent past day: the main meals with nothing logged, each with
 * whether it's already marked skipped. Null when the day can't be changed
 * (today, the future, or more than a week ago). */
export function daySkipSlots(
  date: string,
  guidance: Pick<GuidanceDashboard, 'date' | 'meals' | 'skips' | 'timezone'>
): Array<{ slot: MealSlot; skipped: boolean }> | null {
  const weekAgo = addDays(guidance.date, -7);
  if (date >= guidance.date || date < weekAgo) return null;
  const logged = new Set(guidance.meals.filter((m) => localDate(m.loggedAt, guidance.timezone) === date).map((m) => slotOfMealType(m.mealType)));
  const skipped = new Set(guidance.skips.filter((s) => s.date === date).map((s) => s.slot));
  const open = MAIN_SLOTS.filter((s) => !logged.has(s));
  return open.length === 0 ? null : open.map((slot) => ({ slot, skipped: skipped.has(slot) }));
}

/** The weight readings that fall in this week or month, oldest first. */
export function weightsIn(guidance: Pick<GuidanceDashboard, 'weights' | 'timezone' | 'date'>, periodKind: PeriodKind) {
  const period = periodFor(periodKind, guidance.date);
  return guidance.weights.filter((w) => {
    const d = localDate(w.measuredAt, guidance.timezone);
    return d >= period.start && d <= period.end;
  });
}

// ─── Vitamins and minerals ──────────────────────────────────────────────────

export const STATUS_TEXT: Record<AssessmentStatus, string> = {
  within_range: 'Within estimated target range',
  likely_low: 'Likely low intake',
  no_reliable_source: 'No reliable source identified',
  not_enough_information: 'Not enough information',
  below_reference: 'Below the reference',
  above_upper_limit: 'Above the upper limit',
};

/** "Unknown" for a missing value, never 0. */
export const microAmountText = (n: number | null, unit: string, floor = false) =>
  n == null ? 'Unknown' : `${floor ? 'at least ' : ''}${n >= 100 ? Math.round(n / 5) * 5 : n >= 10 ? Math.round(n) : Math.round(n * 10) / 10} ${unit}`;

export function microTrendText(a: MicronutrientAssessment): string {
  if (a.trend.kind === 'insufficient') return 'Not enough days';
  const d = a.trend.delta;
  if (d === 0) return 'Steady';
  return `${d > 0 ? '+' : '−'}${microAmountText(Math.abs(d), a.unit)}`;
}

export function microHeadline(period: MicronutrientPeriodView): { headline: string; documented: number } {
  const concerns = period.concerns;
  const documented = Math.max(0, ...period.assessments.map((a) => a.days.documented));
  const headline =
    period.assessments.length === 0
      ? 'Not estimated yet'
      : concerns.length > 0
        ? concerns.length === 1
          ? 'One thing worth a look'
          : 'Two things worth a look'
        : documented < 3
          ? 'Not enough information yet'
          : 'Nothing stands out';
  return { headline, documented };
}
