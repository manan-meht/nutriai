"use client";

import { useState } from "react";
import {
  NUTRITION_GOAL_OPTIONS,
  DAILY_MOVEMENT_OPTIONS,
  WEEKLY_MODERATE_ACTIVITY_OPTIONS,
  STRENGTH_EXERCISE_FREQUENCY_OPTIONS,
  goalUsesResistanceTraining,
} from "@/lib/food-balance/goal-options";
import { resolveMacroStrategy, STRATEGY_EXPLANATIONS, type NutritionGoal } from "@nutriai/health-scoring";

export interface NutritionGoalFieldsValue {
  /** One or more simultaneous goals — see packages/health-scoring's
   * FoodBalanceUserProfile.goals doc comment for how multiple goals blend
   * into a single energy/protein target rather than picking a "primary"
   * winner. */
  nutritionGoals: NutritionGoal[];
  dailyMovementLevel: string;
  weeklyModerateActivity: string;
  strengthExerciseFrequency: string;
  targetWeightKg: string;
}

/** How to address the person these questions are about — the caller
 * (AddContactModal/EditContactModal/SelfSetupCard/AddClientModal/
 * EditClientModal) already knows whether this is a self-setup flow and
 * what name (if any) has been typed into the form so far, so it resolves
 * this once rather than NutritionGoalFields needing its own relationship-
 * type logic. Verb conjugation ("do" vs "does") depends on which case
 * applies — see personCopy below. */
export type PersonDisplay = { type: "self" } | { type: "name"; name: string } | { type: "they" };

function personCopy(display: PersonDisplay): { subject: string; doForm: string; possessive: string } {
  if (display.type === "self") return { subject: "you", doForm: "do", possessive: "your" };
  if (display.type === "name") return { subject: display.name, doForm: "does", possessive: `${display.name}'s` };
  return { subject: "they", doForm: "do", possessive: "their" };
}

interface NutritionGoalFieldsProps {
  value: NutritionGoalFieldsValue;
  onChange: (value: NutritionGoalFieldsValue) => void;
  /** Defaults to "they" (family/client with no name typed yet) when
   * omitted. */
  personDisplay?: PersonDisplay;
  /** The add-contact form renders its own Target weight input beside the
   * Weight field (product decision: the two belong together); this hides
   * the copy that historically lived among the activity questions so the
   * field isn't shown twice. Edit flows keep the original placement. */
  hideTargetWeight?: boolean;
}

const inp = "w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-300 outline-none focus:border-[var(--color-dashboard-primary)] focus:ring-2 focus:ring-[var(--color-dashboard-primary-light)] transition";

/** A single-select list of answer cards — shared layout for all three new
 * behavioural questions below, so they read/tap consistently. "Not sure"
 * is always last and visually secondary (smaller, muted), never styled
 * the same as a real answer — matches the "make Not sure available but
 * visually secondary" requirement. Uses radio semantics (role="radio"/
 * aria-checked within a role="radiogroup") rather than a plain button
 * group, so screen readers announce selection state correctly and colour
 * is never the only indicator (the check icon + border both change). */
function AnswerCards<V extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: Array<{ value: V; label: string }>;
  value: string;
  onChange: (v: V) => void;
}) {
  return (
    <div role="radiogroup" aria-label={legend} className="space-y-1.5">
      {options.map((option) => {
        const selected = value === option.value;
        const isNotSure = option.value === "not_sure";
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border text-left transition-colors ${
              selected
                ? "border-[var(--color-dashboard-primary)] bg-[var(--color-dashboard-primary-light)]"
                : "border-gray-200 hover:border-[var(--color-dashboard-primary)]"
            } ${isNotSure ? "opacity-60" : ""}`}
          >
            <span
              className={`w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center border ${
                selected ? "border-[var(--color-dashboard-primary)]" : "border-gray-300"
              }`}
            >
              {selected && <span className="w-2 h-2 rounded-full bg-[var(--color-dashboard-primary)]" />}
            </span>
            <span className={`text-sm ${isNotSure ? "text-gray-500" : "text-gray-900"}`}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Shared by AddContactModal/EditContactModal (adults) and
 * AddClientModal/EditClientModal (gym) — the Food Balance Score's goal and
 * profile inputs (see supabase/migrations/0027_food_balance_score.sql,
 * 0035_multi_nutrition_goals.sql, 0041_activity_profile_behavioural_questions.sql,
 * packages/health-scoring) are identical across both products, so this is
 * one component rather than four copies.
 *
 * Goals are multi-select (checkboxes, not the old single-choice radio) —
 * packages/health-scoring blends multiple simultaneous goals into one
 * energy/protein target rather than forcing a single "primary" choice.
 *
 * The activity questions are deliberately behavioural rather than
 * subjective ("mostly sitting" vs "very active") — see
 * @nutriai/health-scoring's deriveActivityLevel for how the two answers
 * below become the internal category calorie/macro calculations use.
 * "Resistance training" (a term many users didn't understand) is replaced
 * by "strength-building exercises", asked as a concrete weekly frequency.
 *
 * No separate "date of birth"/"sex for metabolic estimate" fields here —
 * those used to duplicate the age/gender fields already collected earlier
 * in the same form. Age and gender (already on the contact) are used
 * directly for all calculations now — see
 * src/lib/food-balance/adapter.ts's metabolicSexFromGender. */
export function NutritionGoalFields({ value, onChange, personDisplay = { type: "they" }, hideTargetWeight }: NutritionGoalFieldsProps) {
  const showStrengthExercise = value.nutritionGoals.some((g) => goalUsesResistanceTraining(g));
  const hasAnyGoal = value.nutritionGoals.length > 0;
  const [showBreathingHelp, setShowBreathingHelp] = useState(false);
  const { subject, doForm, possessive } = personCopy(personDisplay);
  const isSelf = personDisplay.type === "self";

  function set<K extends keyof NutritionGoalFieldsValue>(key: K, v: NutritionGoalFieldsValue[K]) {
    onChange({ ...value, [key]: v });
  }

  function toggleGoal(goal: NutritionGoal) {
    const selected = value.nutritionGoals.includes(goal);
    set("nutritionGoals", selected ? value.nutritionGoals.filter((g) => g !== goal) : [...value.nutritionGoals, goal]);
  }

  return (
    <section>
      <h3 className="text-xs font-semibold text-[var(--color-dashboard-primary)] uppercase tracking-widest mb-2">
        Nutrition goals <span className="text-gray-400 normal-case font-normal">— optional, powers the Food Balance Score. Pick as many as apply.</span>
      </h3>
      <p className="text-xs text-gray-400 mb-4">
        Choose one or more goals. Tistra will use these to suggest {isSelf ? "your" : possessive} starting nutrition targets.
      </p>
      <div className="space-y-2 mb-4">
        {NUTRITION_GOAL_OPTIONS.map((option) => {
          const selected = value.nutritionGoals.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => toggleGoal(option.value)}
              aria-pressed={selected}
              className={`w-full flex items-start gap-3 px-4 py-3 rounded-xl border text-left transition-colors ${
                selected ? "border-[var(--color-dashboard-primary)] bg-[var(--color-dashboard-primary-light)]" : "border-gray-200 hover:border-[var(--color-dashboard-primary)]"
              }`}
            >
              <span
                className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border ${
                  selected ? "border-[var(--color-dashboard-primary)] bg-[var(--color-dashboard-primary)]" : "border-gray-300"
                }`}
              >
                {selected && (
                  <svg viewBox="0 0 16 16" className="w-3 h-3 fill-white">
                    <path d="M6.5 11.5 3 8l1.1-1.1 2.4 2.4 5.4-5.4L13 5z" />
                  </svg>
                )}
              </span>
              <div>
                <p className="text-sm font-medium text-gray-900">{option.label}</p>
                <p className="text-xs text-gray-400">{option.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {hasAnyGoal && (
        <p className="text-xs text-[var(--color-dashboard-primary)] bg-[var(--color-dashboard-primary-light)] rounded-xl px-3 py-2 mb-4">
          {STRATEGY_EXPLANATIONS[resolveMacroStrategy(value.nutritionGoals)]}
        </p>
      )}

      {hasAnyGoal && (
        <div className="space-y-5 pt-4 border-t border-gray-100">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              What does a typical day look like for {subject}?
            </label>
            <p className="text-xs text-gray-400 mb-2">Include work, household tasks, walking and other regular movement.</p>
            <AnswerCards
              legend="Typical daily movement"
              options={DAILY_MOVEMENT_OPTIONS}
              value={value.dailyMovementLevel}
              onChange={(v) => set("dailyMovementLevel", v)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              In a typical week, how much activity makes {subject} breathe faster?
            </label>
            <p className="text-xs text-gray-400 mb-1">
              Include brisk walking, cycling, energetic household work, active yoga, exercise, sports and physically demanding
              work. Do not include slow walking, gentle stretching or very light household tasks.
            </p>
            <button
              type="button"
              onClick={() => setShowBreathingHelp((v) => !v)}
              className="text-xs text-[var(--color-dashboard-primary)] underline mb-2"
              aria-expanded={showBreathingHelp}
            >
              {showBreathingHelp ? "Hide example" : "What does that mean?"}
            </button>
            {showBreathingHelp && (
              <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 mb-2">
                During this activity, {isSelf ? "you should" : `${subject} should`} be able to talk, but would find it difficult
                to sing.
              </p>
            )}
            <AnswerCards
              legend="Weekly faster-breathing activity"
              options={WEEKLY_MODERATE_ACTIVITY_OPTIONS}
              value={value.weeklyModerateActivity}
              onChange={(v) => set("weeklyModerateActivity", v)}
            />
          </div>

          {!hideTargetWeight && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Target weight (kg) — optional</label>
              <input
                type="number"
                step="0.1"
                value={value.targetWeightKg}
                onChange={(e) => set("targetWeightKg", e.target.value)}
                className={inp}
              />
            </div>
          )}

          {showStrengthExercise && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                How many days a week {doForm} {subject} do strength-building exercises, such as lifting weights, squats or
                push-ups?
              </label>
              <p className="text-xs text-gray-400 mb-2">
                This can include weights, resistance bands or challenging body-weight exercises. Regular yoga only counts if
                it&apos;s a challenging routine that makes the muscles work harder than usual.
              </p>
              <AnswerCards
                legend="Strength-building exercise frequency"
                options={STRENGTH_EXERCISE_FREQUENCY_OPTIONS}
                value={value.strengthExerciseFrequency}
                onChange={(v) => set("strengthExerciseFrequency", v)}
              />
            </div>
          )}

          <p className="text-xs text-gray-400">
            These personalize the Food Balance Score&apos;s energy/protein targets, using the age/gender already entered above.
            Skipping them still shows a general score based on food quality alone.
          </p>
        </div>
      )}
    </section>
  );
}

export const EMPTY_NUTRITION_GOAL_FIELDS: NutritionGoalFieldsValue = {
  nutritionGoals: [],
  dailyMovementLevel: "not_sure",
  weeklyModerateActivity: "not_sure",
  strengthExerciseFrequency: "not_sure",
  targetWeightKg: "",
};
