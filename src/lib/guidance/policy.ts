import {
  calculateMacroTargets,
  calculateMaintenanceEstimate,
  resolveMacroStrategy,
  FAT_PERCENT_BY_STRATEGY,
  PROTEIN_G_PER_KG_BY_STRATEGY,
  type ActivityLevel,
  type FoodBalanceUserProfile,
  type MacroStrategy,
  type MetabolicEquationSex,
  type NutritionGoal,
} from "@nutriai/health-scoring";

import { NUTRITION_GOAL_LABELS, ACTIVITY_LEVEL_OPTIONS } from "@/lib/food-balance/goal-options";
import { screenForGuidance, type ScreeningReason } from "./screening";

// The target-setting policy: a versioned, validated wrapper around the
// existing macro engine.
//
// ─── What this adds, and what it deliberately does not redo ───────────────
// packages/health-scoring already does the nutrition arithmetic, and it is
// the right arithmetic: Mifflin-St Jeor resting energy, an activity factor,
// a per-goal calorie adjustment, protein from body weight, fat as a share
// of calories, carbohydrate as the remainder — all in named, explicit
// config. None of that is reimplemented here.
//
// What it has no notion of is whether a number should be handed to a
// person. It has no input bounds, no output bounds, no calorie floor, no
// screening and no version stamp. It will take a 14-year-old and a
// "reduce weight" goal and return a deficit with nothing flagging it.
//
// That division is reasonable: the engine's output feeds the Food Balance
// Score, which grades meals already eaten, where a soft estimate is fine.
// Guidance tells somebody what to eat, so the same number needs a gate in
// front of it. This module is that gate.
//
// ─── On calorie floors ────────────────────────────────────────────────────
// A floor does not make a plan safe and is not treated here as if it does.
// It is used in one narrow way: as the threshold for refusing to automate a
// target that sits BELOW the person's own estimated need. A target under
// the floor that comes from a deficit is refused and routed to a
// professional. A target under the floor that is simply a small or older
// adult's estimated maintenance is not a restriction, and clamping it
// upward would invent a requirement nobody calculated — so it is allowed
// through, and said out loud.
//
// That distinction is why "restrictive" is measured against the person's
// own maintenance estimate rather than read off the strategy table: it is
// the only definition under which a 74-year-old's legitimate 1,436 kcal
// maintenance passes and a 1,123 kcal deficit does not.

/** Must match a row in nutrition_policy_versions. Activation checks that
 * row's status: an unreviewed policy may run in development but may not be
 * offered publicly. Bump this whenever any constant below — or any constant
 * in the engine it calls — changes the numbers produced. */
export const NUTRITION_POLICY_VERSION = "v1-mifflin-2026-10";

/** Plausible adult ranges. Outside them Mifflin-St Jeor is being
 * extrapolated past the population it was fitted on, so the answer is a
 * referral rather than a number. These are bounds on "is this an adult we
 * can estimate for", not clinical categories. */
export const INPUT_BOUNDS = {
  weightKg: { min: 30, max: 300 },
  heightCm: { min: 120, max: 230 },
  ageYears: { min: 18, max: 110 },
} as const;

/** Below this, an automated target that sits under estimated need is not
 * offered. Widely cited as the lower bound for unsupervised intake; used
 * here only to route to a human, never as evidence that anything above it
 * is fine. */
export const RESTRICTIVE_TARGET_FLOOR_KCAL = 1200;

/** How far below maintenance counts as a restriction rather than rounding.
 * The engine rounds its calorie target to a whole number, so an intended
 * zero adjustment can land a kcal or two either side of maintenance. */
export const RESTRICTIVE_ADJUSTMENT_EPSILON = 0.005;

/** Protein, carbohydrate and fat re-multiplied to calories will not land
 * exactly on the calorie target: the engine rounds each macro to 5 g, and
 * carbohydrate — the remainder — carries the residual, so ±2.5 g of carbs
 * is ±10 kcal. This is the documented tolerance for that. Exceeding it
 * means something inconsistent, not something rounded: in practice it means
 * protein and fat alone have eaten the whole calorie target and the
 * engine's `Math.max(0, …)` has clamped carbohydrate to zero. */
export const MACRO_CONSISTENCY_TOLERANCE_KCAL = 40;

export interface PolicyProfileInputs {
  ageYears: number | null;
  heightCm: number | null;
  weightKg: number | null;
  metabolicEquationSex: MetabolicEquationSex | null;
  activityLevel: ActivityLevel | null;
  goals: NutritionGoal[];
  isPregnantOrBreastfeeding: boolean | null;
  hasEatingDisorderHistory: boolean | null;
  conditionsOrMedications: string | null;
}

/** The four stored per-day targets plus fiber, in the units
 * nutrition_targets holds them in. */
export interface ProposedTargets {
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export type PolicyRefusalReason =
  | ScreeningReason
  | "input_out_of_range"
  | "activity_unknown"
  | "restrictive_target_below_floor"
  | "below_resting_energy"
  | "internally_inconsistent";

export type PolicyResult =
  | {
      outcome: "targets";
      policyVersion: string;
      strategy: MacroStrategy;
      targets: ProposedTargets;
      /** Everything that produced the numbers, with units, for the stored
       * target row — so a target can be explained and recomputed later. */
      inputs: Record<string, unknown>;
      /** Plain-language account for the review step and "View targets". */
      explanation: string;
      /** Non-blocking observations already included in `explanation`,
       * exposed separately so a screen can highlight them. */
      notes: string[];
    }
  | {
      /** Something we can ask for. The remedy is a question, not a doctor —
       * so the copy must not imply otherwise. */
      outcome: "needs_more_detail";
      reasons: PolicyRefusalReason[];
      message: string;
    }
  | {
      /** Not ours to decide automatically. Tracking continues; targets do
       * not appear. Stored as 'needs_professional_review'. */
      outcome: "needs_professional_review";
      reasons: PolicyRefusalReason[];
      message: string;
    };

const REFERRAL_MESSAGE =
  "Tistra isn't the right place to set calorie targets for your situation — a doctor or registered dietitian should. " +
  "You can keep logging meals and seeing your Food Balance Score as usual.";

const ACTIVITY_MESSAGE =
  "We need to know roughly how active you are before suggesting a calorie target below your estimated needs. " +
  "You can keep logging meals as usual in the meantime.";

const ACTIVITY_LABELS: Record<ActivityLevel, string> = Object.fromEntries(
  ACTIVITY_LEVEL_OPTIONS.map((o) => [o.value, o.label])
) as Record<ActivityLevel, string>;

function outOfRange(inputs: PolicyProfileInputs): boolean {
  const checks: Array<[number | null, { min: number; max: number }]> = [
    [inputs.weightKg, INPUT_BOUNDS.weightKg],
    [inputs.heightCm, INPUT_BOUNDS.heightCm],
    [inputs.ageYears, INPUT_BOUNDS.ageYears],
  ];
  return checks.some(([value, bound]) => value != null && (value < bound.min || value > bound.max));
}

/** Calories implied by the macros, for the consistency check.
 *
 * Exercise is never part of this: a target is what to eat, and calories
 * someone burned are not an allowance to be added back to the day. */
export function caloriesFromMacros(t: Pick<ProposedTargets, "proteinG" | "carbsG" | "fatG">): number {
  return t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9;
}

/** Whether a target sits meaningfully below the person's own estimated
 * maintenance — the definition of "restrictive" used throughout.
 *
 * Measured against maintenance rather than read off the strategy table on
 * purpose. The engine overrides its own table in one case (the conservative
 * recomposition path uses −2% where the table says −5%), so the table is
 * not a reliable account of what was actually applied, and a plan's
 * restrictiveness is a property of the number, not of the label on it. */
export function isRestrictiveTarget(caloriesKcal: number, maintenanceMidKcal: number): boolean {
  if (!(maintenanceMidKcal > 0)) return false;
  return caloriesKcal / maintenanceMidKcal - 1 < -RESTRICTIVE_ADJUSTMENT_EPSILON;
}

/**
 * Output validation, separated from the computation so each rule can be
 * exercised directly on numbers the engine's current constants cannot
 * actually produce.
 */
export function validateProposal(input: {
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  maintenanceMidKcal: number;
  restingEnergyKcal: number;
}): { refusals: PolicyRefusalReason[]; notes: string[] } {
  const refusals: PolicyRefusalReason[] = [];
  const notes: string[] = [];
  const restrictive = isRestrictiveTarget(input.caloriesKcal, input.maintenanceMidKcal);

  if (input.caloriesKcal < RESTRICTIVE_TARGET_FLOOR_KCAL) {
    if (restrictive) {
      // Exactly what must not be offered automatically. Not clamped up to
      // the floor: a clamped deficit is still a deficit nobody reviewed,
      // wearing a rounder number.
      refusals.push("restrictive_target_below_floor");
    } else {
      // Maintenance for a small or older adult can legitimately land here.
      // It is an estimate of need, not a restriction — so it is allowed,
      // and flagged rather than passed off as unremarkable.
      notes.push(
        `This is below ${RESTRICTIVE_TARGET_FLOOR_KCAL} kcal a day. It reflects estimated needs rather than a deficit, ` +
          `but it is worth checking with a doctor or dietitian.`
      );
    }
  }

  // Cannot fire under the engine's current constants: the gentlest activity
  // multiplier is 1.2 and the deepest deficit is 15%, which still leaves
  // 1.02 × resting energy. It is here so that raising a deficit — or adding
  // a lower multiplier — cannot ship a below-resting target silently.
  if (restrictive && input.restingEnergyKcal > 0 && input.caloriesKcal < input.restingEnergyKcal) {
    refusals.push("below_resting_energy");
  }

  const impliedKcal = caloriesFromMacros(input);
  if (Math.abs(impliedKcal - input.caloriesKcal) > MACRO_CONSISTENCY_TOLERANCE_KCAL) {
    // The macros do not add up to the calorie figure beyond what rounding
    // explains. Showing both would be showing two different plans.
    refusals.push("internally_inconsistent");
  }

  return { refusals, notes };
}

/**
 * Proposes starting targets, or declines and says what would change that.
 *
 * Pure: no database and no clock of its own. The caller persists the result
 * as a versioned nutrition_targets row only once the tracked person has
 * approved it.
 */
export function proposeTargets(inputs: PolicyProfileInputs): PolicyResult {
  // 1. Suitability first, so an unsupported profile never reaches the
  //    engine and no restrictive number is computed even in memory.
  const screen = screenForGuidance({
    ageYears: inputs.ageYears,
    heightCm: inputs.heightCm,
    weightKg: inputs.weightKg,
    metabolicEquationSex: inputs.metabolicEquationSex,
    isPregnantOrBreastfeeding: inputs.isPregnantOrBreastfeeding,
    hasEatingDisorderHistory: inputs.hasEatingDisorderHistory,
    conditionsOrMedications: inputs.conditionsOrMedications,
  });
  if (screen.outcome !== "supported") {
    // A missing answer is answerable; a risk flag is not. Only the first is
    // a question we can usefully put back to the person.
    const onlyIncomplete = screen.reasons.length === 1 && screen.reasons[0] === "incomplete_answers";
    return {
      outcome: onlyIncomplete ? "needs_more_detail" : "needs_professional_review",
      reasons: screen.reasons,
      message: screen.message,
    };
  }

  // 2. Input bounds. Screening has already established these are present.
  if (outOfRange(inputs)) {
    return { outcome: "needs_professional_review", reasons: ["input_out_of_range"], message: REFERRAL_MESSAGE };
  }

  const profile: FoodBalanceUserProfile = {
    goals: inputs.goals,
    age: inputs.ageYears ?? undefined,
    heightCm: inputs.heightCm ?? undefined,
    currentWeightKg: inputs.weightKg ?? undefined,
    metabolicEquationSex: inputs.metabolicEquationSex ?? undefined,
    activityLevel: inputs.activityLevel ?? undefined,
  };

  // 3. The existing engine does the arithmetic.
  const maintenance = calculateMaintenanceEstimate(profile);
  const computed = calculateMacroTargets(profile);

  // Belt and braces: screening covers every cause of both of these, and if
  // one still fires then the engine fell back to a flat 2,000 kcal and the
  // number is not a calculation. Refusing is the only honest answer.
  if (maintenance == null || computed.isProfileIncomplete) {
    return { outcome: "needs_more_detail", reasons: ["incomplete_answers"], message: screen.message };
  }

  const targets: ProposedTargets = {
    caloriesKcal: computed.calories.target,
    proteinG: computed.protein.target,
    carbsG: computed.carbs.target,
    fatG: computed.fat.target,
    fiberG: computed.fiber.target,
  };

  // 4. A target below estimated need, computed from a guessed activity
  //    factor, is a deficit off a guess — and unlike the risk flags, the
  //    remedy is a question we already ask at setup.
  if (!maintenance.isActivityBased && isRestrictiveTarget(targets.caloriesKcal, maintenance.midpointKcal)) {
    return { outcome: "needs_more_detail", reasons: ["activity_unknown"], message: ACTIVITY_MESSAGE };
  }

  // 5. Output validation.
  const { refusals, notes } = validateProposal({
    ...targets,
    maintenanceMidKcal: maintenance.midpointKcal,
    restingEnergyKcal: maintenance.rmr,
  });
  if (refusals.length > 0) {
    return { outcome: "needs_professional_review", reasons: refusals, message: REFERRAL_MESSAGE };
  }

  const appliedCalorieAdjustment = targets.caloriesKcal / maintenance.midpointKcal - 1;
  const proteinGPerKg = PROTEIN_G_PER_KG_BY_STRATEGY[computed.strategy].target;
  const fatPercentOfCalories = FAT_PERCENT_BY_STRATEGY[computed.strategy].target;

  return {
    outcome: "targets",
    policyVersion: NUTRITION_POLICY_VERSION,
    strategy: computed.strategy,
    targets,
    inputs: {
      policyVersion: NUTRITION_POLICY_VERSION,
      equation: "mifflin-st-jeor",
      ageYears: inputs.ageYears,
      heightCm: inputs.heightCm,
      weightKg: inputs.weightKg,
      metabolicEquationSex: inputs.metabolicEquationSex,
      activityLevel: inputs.activityLevel,
      /** False means the activity factor was a broad default, not an
       * answer — the single most load-bearing caveat on the number. */
      activityBasedEstimate: maintenance.isActivityBased,
      goals: inputs.goals,
      strategy: computed.strategy,
      restingEnergyKcal: Math.round(maintenance.rmr),
      maintenanceMidKcal: Math.round(maintenance.midpointKcal),
      /** What was actually applied, derived from the output rather than
       * read off the strategy table the engine sometimes overrides. */
      appliedCalorieAdjustment: Number(appliedCalorieAdjustment.toFixed(4)),
      proteinGPerKg,
      fatPercentOfCalories,
      impliedKcalFromMacros: caloriesFromMacros(targets),
      units: { energy: "kcal", macros: "g", height: "cm", weight: "kg" },
      engineCalculatedAt: computed.calculatedAt,
    },
    explanation: buildExplanation({
      goals: inputs.goals,
      targets,
      restingEnergyKcal: maintenance.rmr,
      maintenanceMidKcal: maintenance.midpointKcal,
      isActivityBased: maintenance.isActivityBased,
      activityLevel: inputs.activityLevel,
      appliedCalorieAdjustment,
      proteinGPerKg,
      fatPercentOfCalories,
      strategyExplanation: computed.explanation,
      notes,
    }),
    notes,
  };
}

const kcal = (n: number) => `${Math.round(n).toLocaleString("en-US")} kcal`;

/** The text shown on the review step before anyone agrees to a target.
 *
 * It states every step and names the equation, because a number someone is
 * asked to eat to should be one they can check. It says "about" wherever
 * the figure is an estimate, which is everywhere, and it never claims the
 * targets are correct for them — only that this is how they were reached. */
function buildExplanation(params: {
  goals: NutritionGoal[];
  targets: ProposedTargets;
  restingEnergyKcal: number;
  maintenanceMidKcal: number;
  isActivityBased: boolean;
  activityLevel: ActivityLevel | null;
  appliedCalorieAdjustment: number;
  proteinGPerKg: number;
  fatPercentOfCalories: number;
  strategyExplanation: string;
  notes: string[];
}): string {
  const { targets } = params;
  const goalLabels = params.goals.map((g) => NUTRITION_GOAL_LABELS[g]).filter(Boolean);
  const goalPhrase = goalLabels.length > 0 ? goalLabels.join(" + ") : "Improve nutrition";

  const lines: string[] = [
    "These are starting targets, not a prescription. A week of logging is what tells us whether they fit.",
    "",
    "How we got there",
    `• Resting energy: about ${kcal(params.restingEnergyKcal)} a day — the Mifflin-St Jeor equation, from your height, weight, age and sex.`,
  ];

  if (params.isActivityBased && params.activityLevel && params.activityLevel !== "unknown") {
    lines.push(
      `• Daily energy need: about ${kcal(params.maintenanceMidKcal)}, applying an activity factor for "${ACTIVITY_LABELS[params.activityLevel]}".`
    );
  } else {
    lines.push(
      `• Daily energy need: about ${kcal(params.maintenanceMidKcal)} — a broad estimate, because we don't know yet how active you are.`
    );
  }

  const pct = Math.round(Math.abs(params.appliedCalorieAdjustment) * 100);
  if (pct === 0) {
    lines.push(`• Your goal (${goalPhrase}) keeps that unchanged: ${kcal(targets.caloriesKcal)} a day.`);
  } else if (params.appliedCalorieAdjustment < 0) {
    lines.push(`• Your goal (${goalPhrase}) lowers it by ${pct}%, giving ${kcal(targets.caloriesKcal)} a day.`);
  } else {
    lines.push(`• Your goal (${goalPhrase}) raises it by ${pct}%, giving ${kcal(targets.caloriesKcal)} a day.`);
  }

  lines.push(
    `• Protein ${targets.proteinG} g — ${params.proteinGPerKg} g per kg of body weight.`,
    `• Fat ${targets.fatG} g — ${Math.round(params.fatPercentOfCalories * 100)}% of those calories.`,
    `• Carbohydrate ${targets.carbsG} g — the energy left after protein and fat.`,
    `• Fiber ${targets.fiberG} g — a flat target for your age and sex, not derived from your calories.`,
    "",
    params.strategyExplanation
  );

  if (params.notes.length > 0) lines.push("", ...params.notes);

  return lines.join("\n");
}
