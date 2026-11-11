import type { SupabaseClient } from "@supabase/supabase-js";

import { GUIDANCE_ENABLED } from "@/lib/billing/feature-flags";

import { getGuidanceState, loadContactFacts } from "./activation";
import type { GuidanceContactType } from "./authorization";
import {
  computeDailyTotals,
  localDate,
  targetForDate,
  type ConfirmedMealRow,
  type DailyTarget,
  type DailyTotals,
  type NutrientDay,
} from "./daily-totals";
import { mealValues, NUTRIENTS, type NutrientKey } from "./meal-impact";
import { loadReleaseState, type ReleaseState } from "./release";
import { loadMealRows, loadTargetRows } from "./view";

// Guidance mode on WhatsApp.
//
// Once Guidance is on, the bot stops coaching and starts reporting: each
// logged meal gets what it was, what it contained, and where the day now
// stands against the target. "Today" and the timed reminders say what is
// left. The gentle per-meal tips and Today's Focus are dropped.
//
// The gate is the dashboards' and the Guidance screen's: flag on, release
// gate open, mode 'guidance', and a target covering today. In production
// the policy is unreviewed, so this returns null for everyone and the bot
// carries on in Tracking exactly as before. Whatever the formatters here
// say only reaches anyone once the policy has been reviewed.
//
// Everything below the loader is pure, so the messages are tested as text.

export interface WhatsAppGuidance {
  /** Today, YYYY-MM-DD, in the tracked person's timezone. */
  date: string;
  timezone: string;
  target: DailyTarget;
  /** Meals in meal_logs for today when this was loaded. Load it BEFORE
   * saving or correcting a meal: a read right after a write may not see
   * the write, so the new meal is added in memory instead (totalsWith). */
  mealsToday: ConfirmedMealRow[];
}

export async function loadWhatsAppGuidance(
  db: SupabaseClient,
  params: { contactId: string; contactType: GuidanceContactType; now?: Date; release?: ReleaseState }
): Promise<WhatsAppGuidance | null> {
  if (!GUIDANCE_ENABLED) return null;
  const release = params.release ?? (await loadReleaseState(db));
  if (!release.canActivate) return null;

  const [state, facts] = await Promise.all([
    getGuidanceState(db, params.contactId, params.contactType),
    loadContactFacts(db, params.contactId, params.contactType),
  ]);
  if (state.mode !== "guidance" || !facts) return null;

  const now = params.now ?? new Date();
  const date = localDate(now.toISOString(), facts.timezone);
  const target = targetForDate(await loadTargetRows(db, params.contactId, params.contactType), date);
  if (!target) return null;

  // 48 hours back covers "today" in any timezone.
  const since = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const meals = await loadMealRows(db, params.contactId, params.contactType, since);
  return {
    date,
    timezone: facts.timezone,
    target,
    mealsToday: meals.filter((m) => localDate(m.loggedAt, facts.timezone) === date),
  };
}

/** A meal's ranges, as the food analysis and meal_logs both carry them. */
export interface MealRanges {
  total_calories_min: number | null;
  total_calories_max: number | null;
  total_protein_min: number | null;
  total_protein_max: number | null;
  total_carbs_min: number | null;
  total_carbs_max: number | null;
  total_fat_min: number | null;
  total_fat_max: number | null;
  total_fiber_min?: number | null;
  total_fiber_max?: number | null;
}

/** A meal being saved now, as a row, before the database has it. */
export function mealRowFrom(ranges: MealRanges, id: string, loggedAt: string): ConfirmedMealRow {
  return {
    id,
    loggedAt,
    totalCaloriesMin: ranges.total_calories_min,
    totalCaloriesMax: ranges.total_calories_max,
    totalProteinMin: ranges.total_protein_min,
    totalProteinMax: ranges.total_protein_max,
    totalCarbsMin: ranges.total_carbs_min,
    totalCarbsMax: ranges.total_carbs_max,
    totalFatMin: ranges.total_fat_min,
    totalFatMax: ranges.total_fat_max,
    totalFiberMin: ranges.total_fiber_min ?? null,
    totalFiberMax: ranges.total_fiber_max ?? null,
  };
}

/** Today's totals with `meal` counted. For a correction, `meal` takes the
 * place of the saved row with the same id, so it is never counted twice,
 * and keeps that row's time, so it stays on the day it was eaten. */
export function totalsWith(guidance: WhatsAppGuidance, meal: ConfirmedMealRow): DailyTotals {
  const replaced = guidance.mealsToday.find((m) => m.id === meal.id);
  const counted = replaced ? { ...meal, loggedAt: replaced.loggedAt } : meal;
  const meals = [...guidance.mealsToday.filter((m) => m.id !== meal.id), counted];
  return computeDailyTotals({ date: guidance.date, timezone: guidance.timezone, meals, target: guidance.target });
}

/** Today's totals from what is already logged. */
export function totalsToday(guidance: WhatsAppGuidance): DailyTotals {
  return computeDailyTotals({
    date: guidance.date,
    timezone: guidance.timezone,
    meals: guidance.mealsToday,
    target: guidance.target,
  });
}

const fmt = (n: number) => n.toLocaleString("en-IN");
const unitOf = (key: NutrientKey) => NUTRIENTS.find((n) => n.key === key)!.unit;
const amount = (n: number, key: NutrientKey) => (unitOf(key) === "kcal" ? `${fmt(n)} kcal` : `${fmt(n)} g`);

/** "This meal: 520 kcal · 24 g protein · 70 g carbs · 14 g fat · 8 g fiber". */
export function formatThisMeal(meal: ConfirmedMealRow): string {
  const values = mealValues(meal);
  const parts = NUTRIENTS.map(({ key, label }) => {
    const v = values[key];
    const name = label.toLowerCase();
    if (v == null) return `${name} unknown`;
    return key === "calories" ? amount(v, key) : `${fmt(v)} g ${name}`;
  });
  return `This meal: ${parts.join(" · ")}`;
}

function standing(day: NutrientDay, key: NutrientKey): string {
  if (day.over > 0) return `${amount(day.over, key)} over`;
  if (day.remaining > 0) return `${amount(day.remaining, key)} left`;
  return "on target";
}

/** The day against the target, one nutrient per line:
 *
 *   Today vs your target:
 *   Calories 1,520 / 1,890 kcal · 370 kcal left
 *   Fat 71 / 63 g · 8 g over
 *
 * A total that is a floor (some meal had no estimate) says "at least". */
export function formatTargetLines(totals: DailyTotals): string {
  const lines = NUTRIENTS.map(({ key, label }) => {
    const day = totals[key];
    const consumed = `${day.isIncomplete ? "at least " : ""}${fmt(day.consumed)}`;
    return `${label} ${consumed} / ${amount(day.target, key)} · ${standing(day, key)}`;
  });
  return `Today vs your target:\n${lines.join("\n")}`;
}

/** What's left, on ONE line. WhatsApp template parameters may not contain
 * line breaks, and this fills the reminder template's second slot:
 *
 *   Left for today: 1,120 kcal · 60 g protein · 140 g carbs · fat 8 g over · 12 g fiber */
export function formatBalanceLine(totals: DailyTotals): string {
  const parts = NUTRIENTS.map(({ key, label }) => {
    const day = totals[key];
    const name = label.toLowerCase();
    if (day.over > 0) return `${name} ${amount(day.over, key)} over`;
    if (day.remaining === 0) return `${name} on target`;
    return key === "calories" ? amount(day.remaining, key) : `${fmt(day.remaining)} g ${name}`;
  });
  return `Left for today: ${parts.join(" · ")}`;
}

/** The free-form reminder in Guidance mode, used when no approved template
 * is configured. No coaching: when it is, and what is left. */
export function formatGuidanceReminder(displayName: string, slot: "breakfast" | "lunch" | "dinner", totals: DailyTotals): string {
  return `${displayName}, it's ${slot} time.\n\n${formatBalanceLine(totals)}.\n\nSend a photo or describe your meal and I'll log it against your target.`;
}
