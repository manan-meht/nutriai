import type { ActivityLevel, MetabolicEquationSex, NutritionGoal } from "@nutriai/health-scoring";

import { ACTIVITY_LEVEL_OPTIONS, NUTRITION_GOAL_OPTIONS } from "@/lib/food-balance/goal-options";

import type { GuidanceSetupAnswers } from "./activation";

// The setup form's answers, as they arrive at a server action: whatever the
// browser sent, typed as nothing. A server action's argument is a request
// body, not a value TypeScript has checked, so this is the one place it
// becomes a GuidanceSetupAnswers.
//
// The rule throughout is the screening module's: an answer we cannot read
// is not an answer. Anything malformed becomes null, never a default, and
// screening then treats it as unanswered. In particular nothing here turns
// the string "false" into false — a "No" to the pregnancy or
// eating-disorder question has to be an actual boolean the person chose.

const GOALS = new Set<string>(NUTRITION_GOAL_OPTIONS.map((o) => o.value));
const ACTIVITY_LEVELS = new Set<string>(ACTIVITY_LEVEL_OPTIONS.map((o) => o.value));
const COOKING_ACCESS = new Set(["full_kitchen", "limited", "none", "unknown"]);

/** Free-text limits. Generous for a person's own words, small enough that a
 * request body cannot turn a preference list into a storage problem. */
const MAX_CONDITIONS_LENGTH = 1000;
const MAX_LIST_ITEMS = 20;
const MAX_LIST_ITEM_LENGTH = 60;

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanOrNull(value: unknown): boolean | null {
  return value === true || value === false ? value : null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const items = value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim().slice(0, MAX_LIST_ITEM_LENGTH))
    .filter(Boolean);
  return [...new Set(items)].slice(0, MAX_LIST_ITEMS);
}

export function parseSetupAnswers(raw: unknown): GuidanceSetupAnswers {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const conditions =
    typeof input.conditionsOrMedications === "string"
      ? input.conditionsOrMedications.trim().slice(0, MAX_CONDITIONS_LENGTH)
      : "";

  const mealsPerDay = numberOrNull(input.mealsPerDay);
  const usualMealTimes = Array.isArray(input.usualMealTimes)
    ? input.usualMealTimes.filter((t): t is string => typeof t === "string" && /^\d{2}:\d{2}$/.test(t))
    : null;

  return {
    ageYears: numberOrNull(input.ageYears),
    heightCm: numberOrNull(input.heightCm),
    weightKg: numberOrNull(input.weightKg),
    metabolicEquationSex:
      input.metabolicEquationSex === "male" || input.metabolicEquationSex === "female"
        ? (input.metabolicEquationSex as MetabolicEquationSex)
        : null,
    activityLevel:
      typeof input.activityLevel === "string" && ACTIVITY_LEVELS.has(input.activityLevel)
        ? (input.activityLevel as ActivityLevel)
        : null,
    goals: stringList(input.goals).filter((g): g is NutritionGoal => GOALS.has(g)),

    isPregnantOrBreastfeeding: booleanOrNull(input.isPregnantOrBreastfeeding),
    hasEatingDisorderHistory: booleanOrNull(input.hasEatingDisorderHistory),
    conditionsOrMedications: conditions || null,

    // Never taken from the browser. Which day a target starts on must be
    // the same day the totals screen looks it up under, and that is the
    // contact's own timezone — confirmActivation falls back to it when this
    // is empty.
    timezone: "",
    // nutrition_guidance checks meals_per_day between 1 and 8. Out of range
    // is an unanswered preference, not a failed write.
    mealsPerDay: mealsPerDay != null && Number.isInteger(mealsPerDay) && mealsPerDay >= 1 && mealsPerDay <= 8 ? mealsPerDay : null,
    usualMealTimes: usualMealTimes && usualMealTimes.length > 0 ? usualMealTimes : null,
    cookingAccess:
      typeof input.cookingAccess === "string" && COOKING_ACCESS.has(input.cookingAccess)
        ? (input.cookingAccess as GuidanceSetupAnswers["cookingAccess"])
        : null,
    cuisines: stringList(input.cuisines),
    allergies: stringList(input.allergies),
    avoidedFoods: stringList(input.avoidedFoods),
  };
}
