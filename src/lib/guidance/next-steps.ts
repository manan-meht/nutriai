import type { DaySummary } from "./aggregation";
import { localDate, type DailyTotals } from "./daily-totals";
import { linkPlans, MAIN_SLOTS, slotOfMealType, type MealSlot, type PlannedMeal, type SkippedMeal } from "./day-plan";
import { buildHabitView, type HabitView, type StoredHabit } from "./habits";
import {
  laterSlots,
  nextSlot,
  suggestMeals,
  type DietAllowances,
  type MealSuggestion,
  type MicronutrientPriority,
  type SuggestionResult,
} from "./suggestions";
import type { GuidanceMealRow } from "./view";

// The Today tab's "what next": the next meal (a plan if there is one, else
// suggestions), which meals today can be marked skipped, and the week's
// habit. Pure: the dashboard loader gathers the rows and the clock.

export interface NextMealView {
  date: string;
  slot: MealSlot;
  isTomorrow: boolean;
  /** A plan already made for this meal. Its estimate is never counted. */
  plan: (PlannedMeal & { logged: { mealId: string } | null }) | null;
  suggestions: SuggestionResult;
}

export interface NextSteps {
  nextMeal: NextMealView | null;
  /** Today's main meals whose time has passed with nothing logged, which
   * can be marked as skipped. */
  skipPrompts: MealSlot[];
  habit: HabitView;
}

/** When a main meal's time has clearly passed, by the person's clock. */
const SLOT_OVER_HOUR: Record<MealSlot, number> = { breakfast: 11, lunch: 16, snack: 19, dinner: 22 };

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export function buildNextSteps(params: {
  today: string;
  /** The person's local hour now, 0–23. */
  hour: number;
  timezone: string;
  totals: DailyTotals | null;
  target: { caloriesKcal: number; proteinG: number; fiberG: number } | null;
  meals: GuidanceMealRow[];
  plans: PlannedMeal[];
  skips: SkippedMeal[];
  summaries: DaySummary[];
  habits: StoredHabit[];
  expectedMealsPerDay: number;
  diet: DietAllowances;
  allergies: string[];
  avoidedFoods: string[];
  cookingAccess: "full_kitchen" | "limited" | "none" | "unknown" | null;
  /** This week's top vitamin or mineral gap, folded into the suggestion
   * rather than shown as a separate warning. */
  priority?: MicronutrientPriority | null;
}): NextSteps {
  const { today, timezone } = params;
  const tomorrow = addDays(today, 1);
  const includeSnack = params.expectedMealsPerDay >= 4;
  const todays = params.meals.filter((m) => localDate(m.loggedAt, timezone) === today);
  const loggedSlots = new Set(todays.map((m) => slotOfMealType(m.mealType)).filter((s): s is MealSlot => s != null));
  const skipped = new Set(params.skips.filter((s) => s.date === today).map((s) => s.slot));
  const links = linkPlans(params.plans, params.meals, timezone);
  const livePlan = (date: string, slot: MealSlot) => params.plans.find((p) => p.date === date && p.slot === slot) ?? null;

  const done = new Set<MealSlot>([...loggedSlots, ...skipped]);
  const usualFoods = params.meals.slice(0, 60).flatMap((m) => m.foods.map((f) => f.name));
  const lastLogged = [...todays].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))[0];

  let nextMeal: NextMealView | null = null;
  if (params.target) {
    const { date, slot } = nextSlot({ hour: params.hour, today, tomorrow, done, includeSnack });
    const isTomorrow = date === tomorrow;
    const plan = livePlan(date, slot);
    // Meals planned later the same day are set aside before this one is
    // sized, so planning dinner first doesn't leave lunch oversized.
    const later = laterSlots(slot, includeSnack, isTomorrow ? new Set() : done);
    const plannedLater = later
      .map((s) => livePlan(date, s))
      .filter((p): p is PlannedMeal => p != null && !links.has(p.id))
      .reduce((acc, p) => ({ calories: acc.calories + (p.suggestion.estimate.calories ?? 0), protein: acc.protein + (p.suggestion.estimate.protein ?? 0) }), {
        calories: 0,
        protein: 0,
      });
    const suggestions = suggestMeals({
      date,
      slot,
      totals: isTomorrow ? null : params.totals,
      target: params.target,
      laterSlots: later.filter((s) => !livePlan(date, s)),
      plannedLater,
      lastLoggedSlot: isTomorrow ? null : (slotOfMealType(lastLogged?.mealType ?? null) ?? null),
      diet: params.diet,
      allergies: params.allergies,
      avoidedFoods: params.avoidedFoods,
      cookingAccess: params.cookingAccess,
      usualFoods,
      priority: params.priority ?? null,
    });
    const linked = plan ? links.get(plan.id) : undefined;
    nextMeal = {
      date,
      slot,
      isTomorrow,
      plan: plan ? { ...plan, logged: linked ? { mealId: linked.id } : null } : null,
      suggestions,
    };
  }

  const skipPrompts = MAIN_SLOTS.filter((s) => params.hour >= SLOT_OVER_HOUR[s] && !loggedSlots.has(s) && !skipped.has(s));

  const habit = buildHabitView({
    stored: params.habits,
    meals: params.meals,
    summaries: params.summaries,
    today,
    timezone,
    target: params.target ? { protein: params.target.proteinG, fiber: params.target.fiberG } : null,
    diet: params.diet,
  });

  return { nextMeal, skipPrompts, habit };
}

/** Skips for a slot that then had a meal logged are dropped: the meal is the
 * better record, and the day shouldn't count that slot twice. */
export function effectiveSkips(skips: SkippedMeal[], meals: GuidanceMealRow[], timezone: string): SkippedMeal[] {
  const logged = new Set(
    meals.map((m) => {
      const slot = slotOfMealType(m.mealType);
      return slot ? `${localDate(m.loggedAt, timezone)}:${slot}` : "";
    })
  );
  return skips.filter((s) => !logged.has(`${s.date}:${s.slot}`));
}

export type { MealSuggestion };
