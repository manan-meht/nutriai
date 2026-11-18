import type { SupabaseClient } from "@supabase/supabase-js";

import {
  forbidden,
  getGuidanceState,
  guidanceSubjectColumn,
  loadContactFacts,
  unavailable,
  writeFailed,
  type ActivationFailure,
} from "./activation";
import { periodFor, type DaySummary } from "./aggregation";
import { authorizeGuidanceDailyAction, type ActivatedVia, type GuidanceActor, type GuidanceContactType } from "./authorization";
import { localDate } from "./daily-totals";
import { mealValues } from "./meal-impact";
import { loadReleaseState } from "./release";
import { slotOfMealType, type MealSlot } from "./day-plan";
import type { DietAllowances } from "./suggestions";
import type { GuidanceMealRow } from "./view";

// One change a week (migration 0070's nutrition_habits).
//
// The habit is proposed from the meals logged *before* the week started, so
// it can't change with every photo during the week, and once chosen it's
// stored and kept. Progress counts only meals that say something clear
// about the habit: a breakfast with no protein estimate is "unclear", not a
// miss and not a success.
//
// The catalogue is small on purpose. Each habit has a rule that logged
// meals can actually check. Habits that photos can't verify ("drink more
// water", "eat slowly") aren't offered, rather than offered with progress
// that would be made up.

export const HABIT_CATALOG_VERSION = "habits-2026-11-v1";

/** How far back the proposal looks, ending the day before the week starts. */
export const HABIT_LOOKBACK_DAYS = 14;

export type HabitKey = "protein_breakfast" | "protein_main_meals" | "fibre_lunch" | "log_every_meal";
export type HabitVariant = "standard" | "easier";

interface MealHabit {
  kind: "meal";
  key: HabitKey;
  title: string;
  shortTitle: string;
  slots: MealSlot[];
  slotNoun: string;
  nutrient: "protein" | "fiber";
  unit: string;
  /** A meal below this, before the habit, is what the observation counts. */
  lowBelow: number;
  threshold: Record<HabitVariant, number>;
  reason: string;
}
interface DayHabit {
  kind: "day";
  key: HabitKey;
  title: string;
  shortTitle: string;
  reason: string;
}
type HabitDefinition = MealHabit | DayHabit;

export const HABITS: Record<HabitKey, HabitDefinition> = {
  protein_breakfast: {
    kind: "meal",
    key: "protein_breakfast",
    title: "Build protein into breakfast",
    shortTitle: "Protein at breakfast",
    slots: ["breakfast"],
    slotNoun: "breakfasts",
    nutrient: "protein",
    unit: "g",
    lowBelow: 15,
    threshold: { standard: 20, easier: 15 },
    reason: "Spreading protein across the day is easier than catching up at dinner.",
  },
  protein_main_meals: {
    kind: "meal",
    key: "protein_main_meals",
    title: "A protein food at lunch and dinner",
    shortTitle: "Protein at main meals",
    slots: ["lunch", "dinner"],
    slotNoun: "lunches and dinners",
    nutrient: "protein",
    unit: "g",
    lowBelow: 20,
    threshold: { standard: 25, easier: 20 },
    reason: "Most of the day's protein gap is at the main meals.",
  },
  fibre_lunch: {
    kind: "meal",
    key: "fibre_lunch",
    title: "Add vegetables or dal to lunch",
    shortTitle: "Fibre at lunch",
    slots: ["lunch"],
    slotNoun: "lunches",
    nutrient: "fiber",
    unit: "g",
    lowBelow: 6,
    threshold: { standard: 8, easier: 6 },
    reason: "Vegetables, dal and whole grains bring fibre, and fill you up for longer.",
  },
  log_every_meal: {
    kind: "day",
    key: "log_every_meal",
    title: "Log every meal for a clearer picture",
    shortTitle: "Log every meal",
    reason: "Averages only use fully logged days, so a few complete days make progress visible.",
  },
};

/** What a person can add to a meal, from what they're known to eat. Never
 * suggests a food group they haven't been seen eating. */
function proteinAddition(diet: DietAllowances, variant: HabitVariant): string {
  if (diet.eggs) return variant === "easier" ? "one boiled egg" : "one extra egg";
  if (diet.dairy) return variant === "easier" ? "a glass of milk" : "a bowl of curd (dahi)";
  return variant === "easier" ? "a handful of peanuts" : "a handful of roasted chana";
}

function mostCommonFood(meals: GuidanceMealRow[]): string | null {
  const counts = new Map<string, number>();
  for (const m of meals) for (const f of m.foods) counts.set(f.name.toLowerCase(), (counts.get(f.name.toLowerCase()) ?? 0) + 1);
  let best: string | null = null;
  let n = 0;
  for (const [name, c] of counts) if (c > n && c >= 2) [best, n] = [name, c];
  return best;
}

function changeText(def: HabitDefinition, variant: HabitVariant, ctx: { diet: DietAllowances; meals: GuidanceMealRow[] }): string {
  switch (def.key) {
    case "protein_breakfast": {
      const usual = mostCommonFood(ctx.meals.filter((m) => slotOfMealType(m.mealType) === "breakfast"));
      const add = proteinAddition(ctx.diet, variant);
      if (variant === "easier") return `Add ${add} to breakfast on the days you can.`;
      return usual ? `Next time you have ${usual}, try adding ${add}.` : `Add ${add} to breakfast.`;
    }
    case "protein_main_meals": {
      const options = [ctx.diet.chicken && "chicken", ctx.diet.fish && "fish", ctx.diet.eggs && "eggs", ctx.diet.dairy && "paneer", "dal", "chana"]
        .filter(Boolean)
        .slice(0, 4) as string[];
      return variant === "easier"
        ? "Add a protein food to one main meal a day."
        : `Build lunch and dinner around a protein food: ${options.join(", ")}.`;
    }
    case "fibre_lunch":
      return variant === "easier" ? "Add a side of vegetables or salad to lunch." : "Make half of lunch vegetables, or add a bowl of dal.";
    case "log_every_meal":
      return variant === "easier" ? "Log every meal on 3 days this week." : "Send a photo of every meal this week, including snacks.";
  }
}

export interface HabitEvidence {
  /** Plain words, from meals before the week started. */
  observation: string;
  /** Meals (or days) looked at, and how many showed the gap. */
  looked: number;
  low: number;
  from: string;
  to: string;
}

export interface HabitOption {
  key: HabitKey;
  title: string;
  shortTitle: string;
  reason: string;
  change: Record<HabitVariant, string>;
  evidence: HabitEvidence;
}

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * The habits the meals before this week support, best first. Empty when
 * nothing clear stands out: then there's no habit to suggest, and the card
 * says so rather than inventing one.
 */
export function habitOptions(params: {
  meals: GuidanceMealRow[];
  summaries: DaySummary[];
  weekStart: string;
  timezone: string;
  /** Average daily targets over the lookback, to skip a habit for a nutrient
   * already at target. */
  target: { protein: number; fiber: number } | null;
  diet: DietAllowances;
}): HabitOption[] {
  const to = addDays(params.weekStart, -1);
  const from = addDays(params.weekStart, -HABIT_LOOKBACK_DAYS);
  const window = params.meals.filter((m) => {
    const d = localDate(m.loggedAt, params.timezone);
    return d >= from && d <= to;
  });
  const days = params.summaries.filter((d) => d.date >= from && d.date <= to);
  const complete = days.filter((d) => d.status === "complete");
  const avg = (key: "protein" | "fiber") =>
    complete.length === 0 ? null : complete.reduce((s, d) => s + d.totals[key].consumed, 0) / complete.length;
  const ctx = { diet: params.diet, meals: window };
  const option = (def: HabitDefinition, evidence: HabitEvidence): HabitOption => ({
    key: def.key,
    title: def.title,
    shortTitle: def.shortTitle,
    reason: def.reason,
    change: { standard: changeText(def, "standard", ctx), easier: changeText(def, "easier", ctx) },
    evidence,
  });

  // Too little logged to say anything about the meals themselves.
  if (days.length > 0 && complete.length < 3) {
    return [
      option(HABITS.log_every_meal, {
        observation: `${complete.length} of the last ${days.length} days had every meal logged.`,
        looked: days.length,
        low: days.length - complete.length,
        from,
        to,
      }),
    ];
  }

  const scored: Array<{ share: number; option: HabitOption }> = [];
  for (const def of Object.values(HABITS)) {
    if (def.kind !== "meal") continue;
    const average = avg(def.nutrient);
    const target = params.target?.[def.nutrient] ?? null;
    // Already at (or within 10% of) the target on complete days: no habit.
    if (average != null && target != null && average >= target * 0.9) continue;
    const known = window.filter((m) => {
      const slot = slotOfMealType(m.mealType);
      return slot && def.slots.includes(slot) && mealValues(m)[def.nutrient] != null;
    });
    if (known.length < 3) continue;
    const low = known.filter((m) => (mealValues(m)[def.nutrient] as number) < def.lowBelow).length;
    const share = low / known.length;
    if (share < 0.5) continue;
    scored.push({
      share,
      option: option(def, {
        observation: `${low} of ${known.length} logged ${def.slotNoun} had under ${def.lowBelow} ${def.unit} of ${def.nutrient === "fiber" ? "fibre" : "protein"}.`,
        looked: known.length,
        low,
        from,
        to,
      }),
    });
  }
  return scored.sort((a, b) => b.share - a.share).map((s) => s.option);
}

export interface HabitProgress {
  /** Meals (or past days) this week that say something clear about it. */
  eligible: number;
  successes: number;
  /** In the habit's meals, but missing the estimate the rule needs. */
  unclear: number;
  /** One mark per eligible observation, oldest first. */
  marks: boolean[];
  noun: string;
}

/** How this week is going: from logged meals, with unclear ones set apart. */
export function habitProgress(params: {
  key: HabitKey;
  variant: HabitVariant;
  meals: GuidanceMealRow[];
  summaries: DaySummary[];
  weekStart: string;
  today: string;
  timezone: string;
}): HabitProgress {
  const def = HABITS[params.key];
  const weekEnd = addDays(params.weekStart, 6);
  if (def.kind === "day") {
    const past = params.summaries
      .filter((d) => d.date >= params.weekStart && d.date <= weekEnd && d.date < params.today)
      .sort((a, b) => a.date.localeCompare(b.date));
    const marks = past.map((d) => d.status === "complete");
    return { eligible: past.length, successes: marks.filter(Boolean).length, unclear: 0, marks, noun: "days" };
  }
  const inWeek = params.meals
    .filter((m) => {
      const d = localDate(m.loggedAt, params.timezone);
      const slot = slotOfMealType(m.mealType);
      return d >= params.weekStart && d <= weekEnd && slot != null && def.slots.includes(slot);
    })
    .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
  const marks: boolean[] = [];
  let unclear = 0;
  for (const m of inWeek) {
    const v = mealValues(m)[def.nutrient];
    if (v == null) unclear++;
    else marks.push(v >= def.threshold[params.variant]);
  }
  return { eligible: marks.length, successes: marks.filter(Boolean).length, unclear, marks, noun: def.slotNoun };
}

// ─── Storage ───────────────────────────────────────────────────────────────

export interface StoredHabit {
  id: string;
  weekStart: string;
  key: HabitKey;
  variant: HabitVariant;
  evidence: HabitEvidence | null;
  chosenVia: ActivatedVia;
}

export async function loadHabits(
  db: SupabaseClient,
  contactId: string,
  contactType: GuidanceContactType,
  sinceWeek: string
): Promise<StoredHabit[]> {
  const { data } = await db
    .from("nutrition_habits")
    .select("id, week_start, habit_key, variant, evidence, status, chosen_via")
    .eq(guidanceSubjectColumn(contactType), contactId)
    .eq("status", "active")
    .gte("week_start", sinceWeek);
  return ((data ?? []) as Array<Record<string, unknown>>)
    .filter((r) => typeof r.habit_key === "string" && r.habit_key in HABITS)
    .map((r) => ({
      id: String(r.id),
      weekStart: String(r.week_start),
      key: r.habit_key as HabitKey,
      variant: r.variant === "easier" ? "easier" : "standard",
      evidence: r.evidence && typeof r.evidence === "object" && "observation" in (r.evidence as object) ? (r.evidence as HabitEvidence) : null,
      chosenVia: r.chosen_via as ActivatedVia,
    }));
}

export type HabitActionResult = { ok: true } | ActivationFailure | { ok: false; kind: "invalid"; message: string };

/**
 * Chooses this week's habit, or next week's ("Keep this habit"). The
 * option must be one the server itself proposes for that person now
 * (`allowed`), so the stored evidence is the server's, not the browser's.
 * Replaces any other active habit for that week.
 */
export async function chooseHabit(
  db: SupabaseClient,
  params: {
    contactId: string;
    contactType?: GuidanceContactType;
    actor: GuidanceActor;
    weekStart: string;
    key: HabitKey;
    variant: HabitVariant;
    evidence: HabitEvidence | null;
    now?: Date;
  }
): Promise<HabitActionResult> {
  const facts = await loadContactFacts(db, params.contactId, params.contactType);
  if (!facts) return { ok: false, kind: "not_found" };
  const auth = authorizeGuidanceDailyAction(params.actor, facts);
  if (!auth.allowed) return forbidden(auth);
  const release = await loadReleaseState(db, facts.caregiverId);
  if (!release.canActivate) return unavailable(release);
  const state = await getGuidanceState(db, facts.contactId, facts.contactType);
  if (state.mode !== "guidance") {
    return { ok: false, kind: "forbidden", reason: "not_in_guidance", message: "Guidance isn't on for this person." };
  }
  const thisWeek = periodFor("week", localDate((params.now ?? new Date()).toISOString(), facts.timezone)).start;
  if (params.weekStart !== thisWeek && params.weekStart !== addDays(thisWeek, 7)) {
    return { ok: false, kind: "invalid", message: "A habit can be chosen for this week or next." };
  }
  if (!(params.key in HABITS)) return { ok: false, kind: "invalid", message: "That habit isn't available." };

  const column = guidanceSubjectColumn(facts.contactType);
  const replace = await db
    .from("nutrition_habits")
    .update({ status: "replaced", updated_at: new Date().toISOString() })
    .eq(column, facts.contactId)
    .eq("week_start", params.weekStart)
    .eq("status", "active");
  if (replace.error) return writeFailed("replace habit", replace.error);
  const insert = await db.from("nutrition_habits").insert({
    [column]: facts.contactId,
    week_start: params.weekStart,
    habit_key: params.key,
    habit_version: HABIT_CATALOG_VERSION,
    variant: params.variant,
    status: "active",
    evidence: params.evidence ?? {},
    chosen_via: auth.activatedVia,
    chosen_by_profile_id: params.actor.kind === "caregiver" ? params.actor.profileId : null,
  });
  if (insert.error) return writeFailed("choose habit", insert.error);
  return { ok: true };
}

/** The Today and Progress cards' data. */
export interface HabitView {
  weekStart: string;
  /** This week's chosen habit, with its progress. */
  current:
    | (HabitOption & { variant: HabitVariant; progress: HabitProgress; keptForNextWeek: boolean })
    | null;
  /** Shown while nothing is chosen: the best option and the rest, for
   * "Adjust". */
  options: HabitOption[];
}

export function buildHabitView(params: {
  stored: StoredHabit[];
  meals: GuidanceMealRow[];
  summaries: DaySummary[];
  today: string;
  timezone: string;
  target: { protein: number; fiber: number } | null;
  diet: DietAllowances;
}): HabitView {
  const weekStart = periodFor("week", params.today).start;
  const options = habitOptions({
    meals: params.meals,
    summaries: params.summaries,
    weekStart,
    timezone: params.timezone,
    target: params.target,
    diet: params.diet,
  });
  const stored = params.stored.find((h) => h.weekStart === weekStart);
  const next = params.stored.find((h) => h.weekStart === addDays(weekStart, 7));
  if (!stored) return { weekStart, current: null, options };

  const def = HABITS[stored.key];
  const fromOptions = options.find((o) => o.key === stored.key);
  const ctx = { diet: params.diet, meals: params.meals };
  const current: HabitOption = fromOptions ?? {
    key: def.key,
    title: def.title,
    shortTitle: def.shortTitle,
    reason: def.reason,
    change: { standard: changeText(def, "standard", ctx), easier: changeText(def, "easier", ctx) },
    evidence: stored.evidence ?? { observation: "", looked: 0, low: 0, from: weekStart, to: weekStart },
  };
  return {
    weekStart,
    current: {
      ...current,
      // The observation it was chosen on, not today's recomputation.
      evidence: stored.evidence ?? current.evidence,
      variant: stored.variant,
      progress: habitProgress({
        key: stored.key,
        variant: stored.variant,
        meals: params.meals,
        summaries: params.summaries,
        weekStart,
        today: params.today,
        timezone: params.timezone,
      }),
      keptForNextWeek: next?.key === stored.key,
    },
    options,
  };
}
