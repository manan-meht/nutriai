"use client";

import { useRef, useState } from "react";
import type { AdultsContact } from "@/app/(adults)/adults/dashboard/actions";
import { getFoodPreferences } from "@/app/(adults)/adults/dashboard/actions";
import { COMMON_TIMEZONES } from "@/lib/reminders/timezone";
import { NutritionGoalFields, type NutritionGoalFieldsValue } from "@/components/shared/dashboard/NutritionGoalFields";
import { NutritionTargetsCard } from "@/components/shared/dashboard/NutritionTargetsCard";
import { FoodPreferencesEditor } from "@/components/adults/FoodPreferencesEditor";
import { ContactAvatar } from "@/components/shared/dashboard/ContactAvatar";
import type { DietaryProfile } from "@/lib/dietary-profile";

interface Props {
  contact: AdultsContact;
  onClose: () => void;
  onSaved: () => void;
}

// Mirrors AddContactModal's RELATIONSHIPS list — kept as two separate
// consts rather than a shared import since the two modals otherwise share
// no other state and this is one line.
const RELATIONSHIPS = ["Son", "Daughter", "Spouse", "Parent", "Sibling", "Friend", "Other"];

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetsExpanded, setTargetsExpanded] = useState(false);
  const [foodPrefsExpanded, setFoodPrefsExpanded] = useState(false);
  const [dietaryProfile, setDietaryProfile] = useState<DietaryProfile | null>(null);
  const [loadingDietaryProfile, setLoadingDietaryProfile] = useState(false);

  const [photoUrl, setPhotoUrl] = useState(contact.photoUrl);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Plain <input type="file" accept="image/*"> rather than any native
  // camera API — on a phone browser this alone already offers "Camera" as
  // one of the picker options (the OS adds it), so there's no need for a
  // separate capture-vs-library affordance; on desktop it's just a normal
  // file picker. Uploads through the same plain-HTTP-route pattern as the
  // rest of this modal (see fetchJson's doc comment) rather than a Server
  // Action, since this needs multipart/form-data for the file itself.
  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setPhotoError(null);
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append("photo", file);
      const res = await fetch(`/api/adults/contacts/${contact.id}?resource=avatar`, { method: "PATCH", body: formData });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.photoUrl) {
        setPhotoError(json?.error ?? "Couldn't upload that photo. Please try again.");
        return;
      }
      setPhotoUrl(json.photoUrl);
    } catch {
      setPhotoError("Couldn't reach the server. Please try again.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function toggleFoodPrefs() {
    const next = !foodPrefsExpanded;
    setFoodPrefsExpanded(next);
    if (next && !dietaryProfile) {
      setLoadingDietaryProfile(true);
      try {
        setDietaryProfile(await getFoodPreferences(contact.id));
      } finally {
        setLoadingDietaryProfile(false);
      }
    }
  }

  const [fullName, setFullName] = useState(contact.fullName);
  // A self contact never has a free-text `relationship` (see
  // AddContactModal's isSelf handling — "self" drives relationshipType
  // instead), so this must seed from relationshipType, not relationship,
  // or the edit form shows an empty box with no way to see/confirm this
  // is the "Myself" entry.
  const [relationship, setRelationship] = useState(contact.relationshipType === "self" ? "self" : contact.relationship ?? "");
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

  const [goalFields, setGoalFields] = useState<NutritionGoalFieldsValue>({
    nutritionGoals: contact.nutritionGoals ?? [],
    dailyMovementLevel: contact.dailyMovementLevel ?? "not_sure",
    weeklyModerateActivity: contact.weeklyModerateActivity ?? "not_sure",
    strengthExerciseFrequency: contact.strengthExerciseFrequency ?? "not_sure",
    targetWeightKg: contact.targetWeightKg?.toString() ?? "",
  });

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      const res = await fetchJson(`/api/adults/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          relationship: relationship === "self" ? undefined : relationship || undefined,
          relationshipType: relationship === "self" ? "self" : "family_caregiver",
          age: age ? Number(age) : undefined,
          gender: gender || undefined,
          weightKg: weightKg ? Number(weightKg) : undefined,
          heightCm: heightCm ? Number(heightCm) : undefined,
          healthNotes: healthNotes || undefined,
          timezone,
          remindersEnabled,
          reminderTimes,
          nutritionGoals: goalFields.nutritionGoals,
          dailyMovementLevel: goalFields.dailyMovementLevel || undefined,
          weeklyModerateActivity: goalFields.weeklyModerateActivity || undefined,
          strengthExerciseFrequency: goalFields.strengthExerciseFrequency || undefined,
          targetWeightKg: goalFields.targetWeightKg ? Number(goalFields.targetWeightKg) : undefined,
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
          <div className="flex items-center gap-4">
            <ContactAvatar photoUrl={photoUrl} fullName={fullName || contact.fullName} size="lg" ringed />
            <div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
                className="text-sm font-medium text-[var(--color-dashboard-primary)] disabled:opacity-50"
              >
                {uploadingPhoto ? "Uploading…" : photoUrl ? "Change photo" : "Add photo"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                className="hidden"
              />
              {photoError && <p className="text-xs text-[var(--color-status-support-text)] mt-1">{photoError}</p>}
            </div>
          </div>
          <Field label="Name">
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Relationship">
            <select value={relationship} onChange={(e) => setRelationship(e.target.value)} className={inputClass}>
              <option value="">Select</option>
              {/* Offered whether or not this contact is already "self".
                  Showing it only for an existing self contact meant one
                  created without it could never be corrected — leaving the
                  dashboard offering to send them an invite link to their
                  own number. One-per-workspace is enforced server-side. */}
              <option value="self">Myself</option>
              {RELATIONSHIPS.map((r) => (
                <option key={r} value={r.toLowerCase()}>{r}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Age">
              <input type="number" value={age} onChange={(e) => setAge(e.target.value)} min="1" max="120" className={inputClass} />
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
            <NutritionGoalFields
              value={goalFields}
              onChange={setGoalFields}
              personDisplay={relationship === "self" ? { type: "self" } : fullName.trim() ? { type: "name", name: fullName.trim().split(" ")[0] } : { type: "they" }}
            />
          </div>

          <div className="pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setTargetsExpanded((v) => !v)}
              className="w-full flex items-center justify-between text-left"
            >
              <p className="text-xs font-semibold text-[var(--color-dashboard-primary)] uppercase tracking-widest">
                Nutrition targets
              </p>
              <span className="text-gray-400 text-sm">{targetsExpanded ? "▲" : "▼"}</span>
            </button>
            {/* Always mounted (not gated behind targetsExpanded) so its fetch
                — a live Food Balance Score + macro-target computation, not a
                simple read — starts as soon as this modal opens rather than
                only once the user clicks to expand. By the time someone
                actually clicks "Nutrition targets", the data has usually
                already arrived in the background; `hidden` just keeps it out
                of layout/visually until then, without re-mounting (and
                re-fetching) on every toggle. */}
            <div className={targetsExpanded ? "mt-3" : "hidden"}>
              <NutritionTargetsCard contactId={contact.id} />
            </div>
          </div>

          {/* Food preferences moves in here once the user has interacted
              with it once (see the dashboard page's own comment) — this
              modal is its permanent home going forward. */}
          <div className="pt-2 border-t border-gray-100">
            <button type="button" onClick={toggleFoodPrefs} className="w-full flex items-center justify-between text-left">
              <p className="text-xs font-semibold text-[var(--color-dashboard-primary)] uppercase tracking-widest">
                Food preferences
              </p>
              <span className="text-gray-400 text-sm">{foodPrefsExpanded ? "▲" : "▼"}</span>
            </button>
            {foodPrefsExpanded && (
              <div className="mt-3">
                {loadingDietaryProfile || !dietaryProfile ? (
                  <p className="text-xs text-gray-400">Loading…</p>
                ) : (
                  <FoodPreferencesEditor contactId={contact.id} initialProfile={dietaryProfile} />
                )}
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

const inputClass = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder:text-gray-300";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
