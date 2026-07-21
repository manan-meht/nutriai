"use client";

import React, { useState } from "react";
import { addContact } from "@/app/(adults)/adults/dashboard/actions";
import { guessTimezoneFromCountryCode, COMMON_TIMEZONES } from "@/lib/reminders/timezone";
import { NutritionGoalFields, EMPTY_NUTRITION_GOAL_FIELDS, type NutritionGoalFieldsValue } from "@/components/shared/dashboard/NutritionGoalFields";

const DEFAULT_REMINDER_TIMES: [string, string, string] = ["08:00", "12:00", "19:00"];

interface Props {
  workspaceId: string;
  caregiverName: string;
  /** Hides the "Myself" relationship option once the workspace already has
   * a self-tracked contact — relationship_type "self" is limited to one per
   * workspace (see hasSelfContact in AdultsDashboardClient.tsx). */
  hasSelfContact: boolean;
  onClose: () => void;
  onAdded: () => void;
}

const RELATIONSHIPS = ["Son", "Daughter", "Spouse", "Parent", "Sibling", "Friend", "Other"];

export function AddContactModal({ workspaceId, caregiverName, hasSelfContact, onClose, onAdded }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ name: string; whatsapp: string } | null>(null);

  const [fullName, setFullName] = useState("");
  const [countryCode, setCountryCode] = useState("91");
  const [whatsapp, setWhatsapp] = useState("");
  const [relationship, setRelationship] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [healthNotes, setHealthNotes] = useState("");

  // Country code is only ever the best-effort starting point for timezone
  // (many countries span multiple zones) — re-derived on every render as
  // the code is typed, until the person explicitly overrides it via the
  // dropdown (see src/lib/reminders/timezone.ts).
  const [manualTimezone, setManualTimezone] = useState<string | null>(null);
  const timezone = manualTimezone ?? guessTimezoneFromCountryCode(countryCode);
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [reminderTimes, setReminderTimes] = useState<[string, string, string]>(DEFAULT_REMINDER_TIMES);

  const [goalFields, setGoalFields] = useState<NutritionGoalFieldsValue>(EMPTY_NUTRITION_GOAL_FIELDS);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const isSelf = relationship === "self";
      const result = await addContact({
        workspaceId,
        fullName,
        whatsappNumber: `+${countryCode}${whatsapp.replace(/\D/g, "")}`,
        // "Myself" isn't a relationship description, so it drives
        // relationshipType instead of the free-text relationship field —
        // matches how addSelfContact itself calls addContact.
        relationship: isSelf ? undefined : relationship || undefined,
        relationshipType: isSelf ? "self" : undefined,
        age: age ? parseInt(age) : undefined,
        gender: gender || undefined,
        weightKg: weightKg ? parseFloat(weightKg) : undefined,
        heightCm: heightCm ? parseFloat(heightCm) : undefined,
        timezone,
        remindersEnabled,
        reminderTimes: remindersEnabled ? reminderTimes : undefined,
        healthNotes: healthNotes || undefined,
        nutritionGoals: goalFields.nutritionGoals,
        activityLevel: goalFields.activityLevel || undefined,
        resistanceTrainingStatus: goalFields.resistanceTrainingStatus || undefined,
        targetWeightKg: goalFields.targetWeightKg ? parseFloat(goalFields.targetWeightKg) : undefined,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSuccess({ name: fullName, whatsapp });
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function buildWhatsAppUrl() {
    const number = `${countryCode}${whatsapp.replace(/\D/g, "")}`;
    const msg = encodeURIComponent(
      `Hi ${fullName}! 👋\n\n${caregiverName} has set up Tistra Health to help keep an eye on your nutrition.\n\nAll you need to do is send a photo or describe what you eat — right here on WhatsApp. I'll do the rest!\n\nYou can start whenever you're ready. Just send me a photo of your next meal 😊`
    );
    return `https://wa.me/${number}?text=${msg}`;
  }

  if (success) {
    return (
      <ModalShell onClose={onClose} title="Contact added">
        <div className="text-center py-6">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">📲</div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">{success.name} has been added!</h3>
          <p className="text-gray-500 text-sm mb-6 max-w-xs mx-auto">
            One last step — send them the WhatsApp invite yourself so they know to start logging meals. Once they reply, their card will update to <strong>Accepted</strong>.
          </p>
          <a
            href={buildWhatsAppUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 bg-[#25D366] text-white font-semibold rounded-full px-8 py-3 text-sm hover:brightness-95 transition-all mb-3"
          >
            <WhatsAppIcon />
            Send invite via WhatsApp
          </a>
          <div>
            <button onClick={onClose} className="text-gray-500 font-medium text-sm hover:text-gray-700 transition-colors px-8 py-3">
              Done
            </button>
          </div>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell onClose={onClose} title="Add a contact">
      <form onSubmit={handleSubmit} className="flex flex-col gap-7">

        <section>
          <h3 className="text-xs font-semibold text-[var(--color-dashboard-primary)] uppercase tracking-widest mb-4">About them</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Field label="Full name" required>
                <input required value={fullName} onChange={(e) => setFullName(e.target.value)}
                  placeholder="Meera Nair" className={inp} />
              </Field>
            </div>
            <Field label="Relationship">
              <select value={relationship} onChange={(e) => setRelationship(e.target.value)} className={inp}>
                <option value="">Select</option>
                {!hasSelfContact && <option value="self">Myself</option>}
                {RELATIONSHIPS.map((r) => <option key={r} value={r.toLowerCase()}>{r}</option>)}
              </select>
            </Field>
            <Field label="Age">
              <input value={age} onChange={(e) => setAge(e.target.value)}
                placeholder="65" type="number" min="40" max="110" className={inp} />
            </Field>
            <Field label="Gender">
              <select value={gender} onChange={(e) => setGender(e.target.value)} className={inp}>
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="WhatsApp number" required>
                <div className="flex gap-2">
                  <div className="flex items-center gap-1 border border-gray-200 rounded-xl px-3 py-3 bg-gray-50 min-w-[80px]">
                    <span className="text-sm text-gray-500">+</span>
                    <input value={countryCode} onChange={(e) => setCountryCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="91" maxLength={4} className="w-10 text-sm text-gray-900 bg-transparent outline-none" />
                  </div>
                  <input required value={whatsapp} onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, ""))}
                    placeholder="98765 43210" type="tel" className={`${inp} flex-1`} />
                </div>
              </Field>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-xs font-semibold text-[var(--color-dashboard-primary)] uppercase tracking-widest mb-4">Health info <span className="text-gray-400 normal-case font-normal">— optional</span></h3>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Weight (kg)">
              <input value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="58" type="number" step="0.1" className={inp} />
            </Field>
            <Field label="Height (cm)">
              <input value={heightCm} onChange={(e) => setHeightCm(e.target.value)} placeholder="160" type="number" className={inp} />
            </Field>
            <div className="col-span-2">
              <Field label="Health notes">
                <textarea value={healthNotes} onChange={(e) => setHealthNotes(e.target.value)}
                  placeholder="e.g. Diabetic, vegetarian, low appetite in mornings"
                  rows={2} className={`${inp} resize-none`} />
              </Field>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-xs font-semibold text-[var(--color-dashboard-primary)] uppercase tracking-widest mb-4">
            WhatsApp reminders <span className="text-gray-400 normal-case font-normal">— optional</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
            <Field label="Timezone">
              <select
                value={timezone}
                onChange={(e) => setManualTimezone(e.target.value)}
                className={inp}
              >
                {COMMON_TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </Field>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-gray-700 mb-3">
                <input
                  type="checkbox"
                  checked={remindersEnabled}
                  onChange={(e) => setRemindersEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 accent-[var(--color-dashboard-primary)]"
                />
                Send meal reminders on WhatsApp
              </label>
            </div>
          </div>

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
                    className={inp}
                  />
                </Field>
              ))}
              <p className="col-span-3 text-xs text-gray-400 -mt-1">
                Times are in their local timezone ({timezone}), not yours. Defaults to 8am, 12pm, and 7pm.
              </p>
            </div>
          )}
        </section>

        <NutritionGoalFields value={goalFields} onChange={setGoalFields} />

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-600 font-medium rounded-xl py-3 text-sm hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={loading}
            className="flex-1 bg-[var(--color-dashboard-primary)] text-white font-semibold rounded-xl py-3 text-sm hover:bg-[var(--color-dashboard-primary-hover)] transition-colors disabled:opacity-50">
            {loading ? "Adding…" : "Add contact"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function ModalShell({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-lg bg-white h-full overflow-y-auto flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="flex-1 px-6 py-6">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inp = "w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none focus:border-[var(--color-dashboard-primary)] focus:ring-2 focus:ring-[var(--color-dashboard-primary-light)] transition";

function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}
