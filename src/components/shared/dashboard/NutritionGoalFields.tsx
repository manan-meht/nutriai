"use client";

import { NUTRITION_GOAL_OPTIONS, ACTIVITY_LEVEL_OPTIONS, RESISTANCE_TRAINING_OPTIONS, goalUsesResistanceTraining } from "@/lib/food-balance/goal-options";
import { resolveMacroStrategy, STRATEGY_EXPLANATIONS, type NutritionGoal } from "@nutriai/health-scoring";

export interface NutritionGoalFieldsValue {
  /** One or more simultaneous goals — see packages/health-scoring's
   * FoodBalanceUserProfile.goals doc comment for how multiple goals blend
   * into a single energy/protein target rather than picking a "primary"
   * winner. */
  nutritionGoals: NutritionGoal[];
  activityLevel: string;
  resistanceTrainingStatus: string;
  targetWeightKg: string;
}

interface NutritionGoalFieldsProps {
  value: NutritionGoalFieldsValue;
  onChange: (value: NutritionGoalFieldsValue) => void;
}

const inp = "w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none focus:border-[var(--color-dashboard-primary)] focus:ring-2 focus:ring-[var(--color-dashboard-primary-light)] transition";

/** Shared by AddContactModal/EditContactModal (adults) and
 * AddClientModal/EditClientModal (gym) — the Food Balance Score's goal and
 * profile inputs (see supabase/migrations/0027_food_balance_score.sql,
 * 0035_multi_nutrition_goals.sql, packages/health-scoring) are identical
 * across both products, so this is one component rather than four copies.
 *
 * Goals are multi-select (checkboxes, not the old single-choice radio) —
 * packages/health-scoring blends multiple simultaneous goals into one
 * energy/protein target rather than forcing a single "primary" choice.
 *
 * No separate "date of birth"/"sex for metabolic estimate" fields here —
 * those used to duplicate the age/gender fields already collected earlier
 * in the same form. Age and gender (already on the contact) are used
 * directly for all calculations now — see
 * src/lib/food-balance/adapter.ts's metabolicSexFromGender. */
export function NutritionGoalFields({ value, onChange }: NutritionGoalFieldsProps) {
  const showResistanceTraining = value.nutritionGoals.some((g) => goalUsesResistanceTraining(g));
  const hasAnyGoal = value.nutritionGoals.length > 0;

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
        Choose one or more goals. Tistra will use these to suggest your starting nutrition targets.
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-gray-100">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Activity level</label>
            <select value={value.activityLevel} onChange={(e) => set("activityLevel", e.target.value)} className={inp}>
              {ACTIVITY_LEVEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
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
          {showResistanceTraining && (
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Do they currently do resistance training?</label>
              <select value={value.resistanceTrainingStatus} onChange={(e) => set("resistanceTrainingStatus", e.target.value)} className={inp}>
                {RESISTANCE_TRAINING_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}
          <p className="sm:col-span-2 text-xs text-gray-400">
            These personalize the Food Balance Score&apos;s energy/protein targets, using the age/gender already entered
            above. Skipping them still shows a general score based on food quality alone.
          </p>
        </div>
      )}
    </section>
  );
}

export const EMPTY_NUTRITION_GOAL_FIELDS: NutritionGoalFieldsValue = {
  nutritionGoals: [],
  activityLevel: "unknown",
  resistanceTrainingStatus: "unknown",
  targetWeightKg: "",
};
