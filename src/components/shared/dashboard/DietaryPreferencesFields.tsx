"use client";

import type { FoodPreferenceSelections } from "@/lib/dietary-profile";

export type DietaryPreferencesFieldsValue = FoodPreferenceSelections;

export const EMPTY_DIETARY_PREFERENCES_FIELDS: DietaryPreferencesFieldsValue = {};

interface DietaryPreferencesFieldsProps {
  value: DietaryPreferencesFieldsValue;
  onChange: (value: DietaryPreferencesFieldsValue) => void;
}

const OPTIONS: Array<{ key: keyof FoodPreferenceSelections; label: string }> = [
  { key: "prefersPlantBasedSuggestions", label: "Prefers plant-based suggestions" },
  { key: "eatsVegetarian", label: "Eats vegetarian food" },
  { key: "eatsEggs", label: "Eats eggs" },
  { key: "eatsChicken", label: "Eats chicken" },
  { key: "eatsFishOrSeafood", label: "Eats fish or seafood" },
  { key: "eatsRedMeat", label: "Eats red meat" },
  { key: "avoidsDairy", label: "Avoids dairy" },
  { key: "avoidsLactose", label: "Avoids lactose" },
  { key: "avoidsPork", label: "Avoids pork" },
];

/** Shared by AddClientModal/EditClientModal (gym) and, going forward,
 * AddContactModal/EditContactModal (adults) — same idea as
 * NutritionGoalFields: one component instead of per-product copies. Every
 * option is left unset (undefined) unless the coach actually clicks it,
 * so leaving this whole section untouched at signup doesn't assert
 * anything — the client's profile starts "plant-based until observed
 * otherwise" from logged meals, exactly as if no one had opened this
 * section at all (see @/lib/dietary-profile's module docs). This is a
 * three-state control (unset/checked/explicitly unchecked), not a plain
 * checkbox list — clicking an option cycles unset -> checked -> unset
 * again, since a coach might not know a client's habits for every item
 * and shouldn't be forced to assert "eats X: false" just to move on. */
export function DietaryPreferencesFields({ value, onChange }: DietaryPreferencesFieldsProps) {
  function toggle(key: keyof FoodPreferenceSelections) {
    const current = value[key];
    const next = { ...value };
    if (current === undefined) next[key] = true;
    else if (current === true) next[key] = false;
    else delete next[key];
    onChange(next);
  }

  return (
    <section>
      <h3 className="text-xs font-semibold text-[var(--color-dashboard-primary)] uppercase tracking-widest mb-1">
        Food preferences <span className="text-gray-400 normal-case font-normal">— optional</span>
      </h3>
      <p className="text-xs text-gray-400 mb-4">
        Tistra learns from the meals your client logs, but you can set what you already know here.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {OPTIONS.map((option) => {
          const state = value[option.key];
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => toggle(option.key)}
              aria-pressed={state === true}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left text-sm transition-colors ${
                state === true
                  ? "border-[var(--color-dashboard-primary)] bg-[var(--color-dashboard-primary-light)] text-gray-900"
                  : state === false
                  ? "border-gray-200 bg-gray-50 text-gray-400 line-through"
                  : "border-gray-200 text-gray-600 hover:border-[var(--color-dashboard-primary)]"
              }`}
            >
              <span
                className={`w-4 h-4 rounded flex-shrink-0 border flex items-center justify-center text-[10px] ${
                  state === true
                    ? "border-[var(--color-dashboard-primary)] bg-[var(--color-dashboard-primary)] text-white"
                    : "border-gray-300"
                }`}
              >
                {state === true ? "✓" : state === false ? "✕" : ""}
              </span>
              {option.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
