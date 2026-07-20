"use client";

import { useEffect, useState } from "react";
import type { GymClient } from "@nutriai/nutrition-core";
import { NutritionGoalFields, type NutritionGoalFieldsValue } from "@/components/shared/dashboard/NutritionGoalFields";
import { NutritionTargetsCard } from "@/components/shared/dashboard/NutritionTargetsCard";
import { DietaryPreferencesFields, EMPTY_DIETARY_PREFERENCES_FIELDS, type DietaryPreferencesFieldsValue } from "@/components/shared/dashboard/DietaryPreferencesFields";
import { getClientDietaryPreferences } from "@/app/(gym)/gym/dashboard/actions";

interface Props {
  client: GymClient;
  onClose: () => void;
  onSaved: () => void;
}

/** Plain fetch instead of a Server Action — same reasoning as
 * EditContactModal.tsx (Server Actions intermittently fail on this
 * Cloudflare Pages deployment). */
async function fetchJson(url: string, init?: RequestInit): Promise<{ error?: string }> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => null);
  if (!json) return { error: "Couldn't reach the server. Please try again." };
  return json;
}

/** Gym's equivalent of the adults product's EditContactModal — the first
 * edit path for a client (previously add-only). No timezone/reminders
 * fields here since gym_clients doesn't track those (unlike
 * adults_contacts). */
export function EditClientModal({ client, onClose, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetsExpanded, setTargetsExpanded] = useState(false);

  const [fullName, setFullName] = useState(client.fullName);
  const [age, setAge] = useState(client.age?.toString() ?? "");
  const [gender, setGender] = useState(client.gender ?? "");
  const [weightKg, setWeightKg] = useState(client.weightKg?.toString() ?? "");
  const [heightCm, setHeightCm] = useState(client.heightCm?.toString() ?? "");

  const [goalFields, setGoalFields] = useState<NutritionGoalFieldsValue>({
    nutritionGoals: client.nutritionGoals ?? [],
    activityLevel: client.activityLevel ?? "unknown",
    resistanceTrainingStatus: client.resistanceTrainingStatus ?? "unknown",
    targetWeightKg: client.targetWeightKg?.toString() ?? "",
  });

  const [dietaryPreferences, setDietaryPreferences] = useState<DietaryPreferencesFieldsValue>(EMPTY_DIETARY_PREFERENCES_FIELDS);

  // Read-only on mount, unlike the save path below — matches AddClientModal
  // calling addClient directly; only the PATCH save uses the plain-fetch
  // workaround noted above, since that's the path that was actually
  // observed failing intermittently as a Server Action.
  useEffect(() => {
    getClientDietaryPreferences(client.id).then(setDietaryPreferences).catch(() => {});
  }, [client.id]);

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      const res = await fetchJson(`/api/gym/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          age: age ? Number(age) : undefined,
          gender: gender || undefined,
          weightKg: weightKg ? Number(weightKg) : undefined,
          heightCm: heightCm ? Number(heightCm) : undefined,
          nutritionGoals: goalFields.nutritionGoals,
          activityLevel: goalFields.activityLevel || undefined,
          resistanceTrainingStatus: goalFields.resistanceTrainingStatus || undefined,
          targetWeightKg: goalFields.targetWeightKg ? Number(goalFields.targetWeightKg) : undefined,
          dietaryPreferences,
        }),
      });
      if (res.error) {
        setError(res.error);
        return;
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Edit details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <Field label="Name">
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Age">
              <input type="number" value={age} onChange={(e) => setAge(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Gender">
              <select value={gender} onChange={(e) => setGender(e.target.value)} className={inputClass}>
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Weight (kg)">
              <input type="number" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Height (cm)">
              <input type="number" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} className={inputClass} />
            </Field>
          </div>

          <div className="pt-2 border-t border-gray-100">
            <NutritionGoalFields value={goalFields} onChange={setGoalFields} />
          </div>

          <div className="pt-2 border-t border-gray-100">
            <DietaryPreferencesFields value={dietaryPreferences} onChange={setDietaryPreferences} />
          </div>

          <div className="pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setTargetsExpanded((v) => !v)}
              className="w-full flex items-center justify-between text-left"
            >
              <p className="text-xs font-semibold text-purple-600 uppercase tracking-widest">Nutrition targets</p>
              <span className="text-gray-400 text-sm">{targetsExpanded ? "▲" : "▼"}</span>
            </button>
            {targetsExpanded && (
              <div className="mt-3">
                <NutritionTargetsCard clientId={client.id} />
              </div>
            )}
          </div>

          {error && <p className="text-sm text-[var(--color-status-support-text)]">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !fullName.trim()}
              className="flex-1 rounded-lg bg-purple-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputClass = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
