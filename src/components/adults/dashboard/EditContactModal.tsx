"use client";

import { useState } from "react";
import type { AdultsContact } from "@/app/(adults)/adults/dashboard/actions";
import { recommendProteinGrams } from "@/lib/nutrition/protein-recommendation";
import { COMMON_TIMEZONES } from "@/lib/reminders/timezone";

const GOAL_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "eat_enough", label: "Eat enough food" },
  { value: "enough_protein", label: "Enough protein" },
  { value: "increase_protein", label: "More protein" },
  { value: "reduce_carbs", label: "Fewer carbs" },
  { value: "balanced_meals", label: "Balanced meals" },
  { value: "weight_gain", label: "Weight gain" },
  { value: "hydration", label: "Hydration" },
  { value: "custom", label: "Custom" },
];

interface Props {
  contact: AdultsContact;
  onClose: () => void;
  onSaved: () => void;
}

/** Plain fetch instead of a Server Action — Server Actions on this
 * deployment (Cloudflare Pages via @cloudflare/next-on-pages) intermittently
 * fail with "Server Action ... was not found on the server" because
 * different edge instances serving the same deployment can disagree on the
 * action's encryption key/manifest. A regular HTTP route sidesteps that
 * mechanism entirely. */
async function fetchJson(url: string, init?: RequestInit): Promise<{ error?: string }> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => null);
  if (!json) return { error: "Couldn't reach the server. Please try again." };
  return json;
}

export function EditContactModal({ contact, onClose, onSaved }: Props) {
  const activeGoal = contact.goals.find((g) => g.status === "active");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState(contact.fullName);
  const [relationship, setRelationship] = useState(contact.relationship ?? "");
  const [age, setAge] = useState(contact.age?.toString() ?? "");
  const [gender, setGender] = useState(contact.gender ?? "");
  const [weightKg, setWeightKg] = useState(contact.weightKg?.toString() ?? "");
  const [heightCm, setHeightCm] = useState(contact.heightCm?.toString() ?? "");
  const [healthNotes, setHealthNotes] = useState(contact.healthNotes ?? "");

  const [timezone, setTimezone] = useState(contact.timezone);
  const [remindersEnabled, setRemindersEnabled] = useState(contact.remindersEnabled);
  const [reminderTimes, setReminderTimes] = useState<[string, string, string]>(
    [contact.reminderTimes[0] ?? "08:00", contact.reminderTimes[1] ?? "12:00", contact.reminderTimes[2] ?? "19:00"]
  );

  const [goalType, setGoalType] = useState(activeGoal?.goalType ?? "balanced_meals");
  const [targetProteinG, setTargetProteinG] = useState(activeGoal?.targetProteinG?.toString() ?? "");
  const [targetCaloriesMin, setTargetCaloriesMin] = useState(activeGoal?.targetCaloriesMin?.toString() ?? "");
  const [targetCaloriesMax, setTargetCaloriesMax] = useState(activeGoal?.targetCaloriesMax?.toString() ?? "");
  const [targetMealsPerDay, setTargetMealsPerDay] = useState(activeGoal?.targetMealsPerDay?.toString() ?? "");

  const recommendedProtein = recommendProteinGrams({
    weightKg: weightKg ? Number(weightKg) : undefined,
    heightCm: heightCm ? Number(heightCm) : undefined,
    age: age ? Number(age) : undefined,
    gender,
  });

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      const contactRes = await fetchJson(`/api/adults/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          relationship: relationship || undefined,
          age: age ? Number(age) : undefined,
          gender: gender || undefined,
          weightKg: weightKg ? Number(weightKg) : undefined,
          heightCm: heightCm ? Number(heightCm) : undefined,
          healthNotes: healthNotes || undefined,
          timezone,
          remindersEnabled,
          reminderTimes,
        }),
      });
      if (contactRes.error) {
        setError(contactRes.error);
        return;
      }

      const goalRes = await fetchJson(`/api/adults/contacts/${contact.id}/goal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goalType,
          title: GOAL_TYPE_OPTIONS.find((g) => g.value === goalType)?.label ?? goalType,
          targetProteinG: targetProteinG ? Number(targetProteinG) : recommendedProtein,
          targetCaloriesMin: targetCaloriesMin ? Number(targetCaloriesMin) : undefined,
          targetCaloriesMax: targetCaloriesMax ? Number(targetCaloriesMax) : undefined,
          targetMealsPerDay: targetMealsPerDay ? Number(targetMealsPerDay) : undefined,
        }),
      });
      if (goalRes.error) {
        setError(goalRes.error);
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
          <Field label="Relationship">
            <input value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder="e.g. Mother" className={inputClass} />
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
          <Field label="Health notes">
            <textarea value={healthNotes} onChange={(e) => setHealthNotes(e.target.value)} rows={2} className={inputClass} />
          </Field>

          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs font-semibold text-[var(--color-dashboard-primary)] uppercase tracking-widest mb-2 mt-2">WhatsApp reminders</p>
            <Field label="Timezone">
              <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputClass}>
                {COMMON_TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm text-gray-700 my-2">
              <input
                type="checkbox"
                checked={remindersEnabled}
                onChange={(e) => setRemindersEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 accent-[var(--color-dashboard-primary)]"
              />
              Send meal reminders on WhatsApp
            </label>
            {remindersEnabled && (
              <div className="grid grid-cols-3 gap-3">
                {(["Morning", "Midday", "Evening"] as const).map((label, i) => (
                  <Field key={label} label={label}>
                    <input
                      type="time"
                      value={reminderTimes[i]}
                      onChange={(e) => {
                        const next = [...reminderTimes] as [string, string, string];
                        next[i] = e.target.value;
                        setReminderTimes(next);
                      }}
                      className={inputClass}
                    />
                  </Field>
                ))}
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs font-semibold text-[var(--color-dashboard-primary)] uppercase tracking-widest mb-2 mt-2">Goal</p>
            <Field label="Focus">
              <select value={goalType} onChange={(e) => setGoalType(e.target.value)} className={inputClass}>
                {GOAL_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Protein target (g/day) — leave blank to use the recommended ${recommendedProtein}g`}>
              <input
                type="number"
                value={targetProteinG}
                onChange={(e) => setTargetProteinG(e.target.value)}
                placeholder={`${recommendedProtein} (recommended)`}
                className={inputClass}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Min calories">
                <input type="number" value={targetCaloriesMin} onChange={(e) => setTargetCaloriesMin(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Max calories">
                <input type="number" value={targetCaloriesMax} onChange={(e) => setTargetCaloriesMax(e.target.value)} className={inputClass} />
              </Field>
            </div>
            <Field label="Meals per day">
              <input type="number" value={targetMealsPerDay} onChange={(e) => setTargetMealsPerDay(e.target.value)} className={inputClass} />
            </Field>
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
              className="flex-1 rounded-lg bg-[var(--color-dashboard-primary)] py-2.5 text-sm font-medium text-white disabled:opacity-50"
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
