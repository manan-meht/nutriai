"use client";

import { useState } from "react";
import type { DietaryProfile, FoodPreferenceSelections } from "@/lib/dietary-profile";
import { updateFoodPreferences } from "@/app/(adults)/adults/dashboard/actions";

interface Option {
  key: keyof FoodPreferenceSelections;
  label: string;
  /** Reads the option's current on/off state from the stored profile. */
  isChecked: (profile: DietaryProfile) => boolean;
}

// "I eat X" options read true when there's no explicit avoidance recorded
// — a fresh profile has never been told to avoid anything, so every "I
// eat X" option starts unchecked (matching "plant-based until observed
// otherwise") without that unchecked state being mistaken for "avoids X".
const OPTIONS: Option[] = [
  { key: "isVegan", label: "I am vegan", isChecked: (p) => p.explicit_vegan },
  { key: "eatsVegetarian", label: "I am vegetarian", isChecked: (p) => p.explicit_vegetarian },
  { key: "eatsEggs", label: "I eat eggs", isChecked: (p) => p.observed_eggs && !p.explicit_avoids_eggs },
  { key: "eatsChicken", label: "I eat chicken", isChecked: (p) => p.observed_chicken && !p.explicit_avoids_chicken },
  { key: "eatsFishOrSeafood", label: "I eat fish or seafood", isChecked: (p) => p.observed_fish && !p.explicit_avoids_fish },
  { key: "eatsRedMeat", label: "I eat red meat", isChecked: (p) => p.observed_red_meat && !p.explicit_avoids_red_meat },
  { key: "avoidsDairy", label: "I avoid dairy", isChecked: (p) => p.explicit_avoids_dairy },
  { key: "avoidsLactose", label: "I avoid lactose", isChecked: (p) => p.explicit_avoids_lactose },
  { key: "avoidsPork", label: "I avoid pork", isChecked: (p) => p.explicit_avoids_pork },
];

export function FoodPreferencesEditor({ contactId, initialProfile }: { contactId: string; initialProfile: DietaryProfile }) {
  const [selections, setSelections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(OPTIONS.map((o) => [o.key, o.isChecked(initialProfile)]))
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle(key: keyof FoodPreferenceSelections, checked: boolean) {
    setSelections((prev) => ({ ...prev, [key]: checked }));
    setSaving(true);
    setSaved(false);
    setError(null);
    const result = await updateFoodPreferences(contactId, { [key]: checked });
    setSaving(false);
    if (result.error) setError(result.error);
    else setSaved(true);
  }

  return (
    <div className="rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-1">Food preferences</h3>
      <p className="text-sm text-gray-500 mb-4">
        Tistra learns from the meals you log, but you can change these preferences anytime.
      </p>
      <div className="space-y-3">
        {OPTIONS.map((option) => (
          <label key={option.key} className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={selections[option.key] ?? false}
              onChange={(e) => handleToggle(option.key, e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 accent-[var(--color-dashboard-primary)]"
            />
            {option.label}
          </label>
        ))}
      </div>
      <div className="mt-3 text-xs h-4">
        {saving && <span className="text-gray-400">Saving…</span>}
        {saved && !saving && <span className="text-green-600">Saved</span>}
        {error && <span className="text-red-600">{error}</span>}
      </div>
    </div>
  );
}
