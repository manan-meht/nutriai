"use client";

import { NUTRITION_GOAL_OPTIONS, ACTIVITY_LEVEL_OPTIONS, RESISTANCE_TRAINING_OPTIONS, goalUsesResistanceTraining } from "@/lib/food-balance/goal-options";
import type { NutritionGoal } from "@nutriai/health-scoring";

export interface NutritionGoalFieldsValue {
  primaryNutritionGoal: NutritionGoal | "";
  dateOfBirth: string;
  metabolicEquationSex: string;
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
 * packages/health-scoring) are identical across both products, so this is
 * one component rather than four copies. Replaces the old per-product
 * GOAL_TYPES checklist/dropdown and manual calorie/protein target fields —
 * those targets are now computed from the goal + profile instead of typed
 * in by hand. */
export function NutritionGoalFields({ value, onChange }: NutritionGoalFieldsProps) {
  const selectedGoal = NUTRITION_GOAL_OPTIONS.find((o) => o.value === value.primaryNutritionGoal);
  const showResistanceTraining = value.primaryNutritionGoal
    ? goalUsesResistanceTraining(value.primaryNutritionGoal as NutritionGoal)
    : false;

  function set<K extends keyof NutritionGoalFieldsValue>(key: K, v: NutritionGoalFieldsValue[K]) {
    onChange({ ...value, [key]: v });
  }

  return (
    <section>
      <h3 className="text-xs font-semibold text-[var(--color-dashboard-primary)] uppercase tracking-widest mb-4">
        Nutrition goal <span className="text-gray-400 normal-case font-normal">— optional, powers the Food Balance Score</span>
      </h3>
      <div className="space-y-2 mb-4">
        {NUTRITION_GOAL_OPTIONS.map((option) => {
          const selected = value.primaryNutritionGoal === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => set("primaryNutritionGoal", selected ? "" : option.value)}
              aria-pressed={selected}
              className={`w-full flex items-start gap-3 px-4 py-3 rounded-xl border text-left transition-colors ${
                selected ? "border-[var(--color-dashboard-primary)] bg-[var(--color-dashboard-primary-light)]" : "border-gray-200 hover:border-[var(--color-dashboard-primary)]"
              }`}
            >
              <span
                className={`mt-0.5 w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center ${
                  selected ? "border-[var(--color-dashboard-primary)] bg-[var(--color-dashboard-primary)]" : "border-gray-300"
                }`}
              >
                {selected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
              </span>
              <div>
                <p className="text-sm font-medium text-gray-900">{option.label}</p>
                <p className="text-xs text-gray-400">{option.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {selectedGoal && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-gray-100">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Date of birth</label>
            <input
              type="date"
              value={value.dateOfBirth}
              onChange={(e) => set("dateOfBirth", e.target.value)}
              className={inp}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Sex (for metabolic estimate)</label>
            <select value={value.metabolicEquationSex} onChange={(e) => set("metabolicEquationSex", e.target.value)} className={inp}>
              <option value="">Select</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
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
            These personalize the Food Balance Score's energy/protein targets. Skipping them still shows a general score based on food quality alone.
          </p>
        </div>
      )}
    </section>
  );
}

export const EMPTY_NUTRITION_GOAL_FIELDS: NutritionGoalFieldsValue = {
  primaryNutritionGoal: "",
  dateOfBirth: "",
  metabolicEquationSex: "",
  activityLevel: "unknown",
  resistanceTrainingStatus: "unknown",
  targetWeightKg: "",
};
