"use client";

import React, { useState } from "react";
import { addContact } from "@/app/(adults)/adults/dashboard/actions";

interface Props {
  workspaceId: string;
  caregiverName: string;
  onClose: () => void;
  onAdded: () => void;
}

const GOAL_TYPES = [
  { value: "eat_enough",       label: "Eat enough food",    description: "Make sure they're eating enough calories each day" },
  { value: "enough_protein",   label: "Enough protein",     description: "Meet a daily protein target to stay strong" },
  { value: "increase_protein", label: "More protein",       description: "Gradually increase protein intake by ~10–20%" },
  { value: "reduce_carbs",     label: "Fewer carbs",        description: "Reduce carbohydrate intake by ~10%" },
  { value: "balanced_meals",   label: "Balanced meals",     description: "Eat 3 nutritious meals every day" },
  { value: "weight_gain",      label: "Healthy weight gain",description: "Gain weight safely and steadily" },
  { value: "hydration",        label: "Stay hydrated",      description: "Drink enough water daily" },
  { value: "custom",           label: "Custom goal",        description: "Set your own targets" },
] as const;

const RELATIONSHIPS = ["Son", "Daughter", "Spouse", "Parent", "Sibling", "Friend", "Other"];

export function AddContactModal({ workspaceId, caregiverName, onClose, onAdded }: Props) {
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

  const [goalType, setGoalType] = useState("");
  const [goalDescription, setGoalDescription] = useState("");
  const [targetCalMin, setTargetCalMin] = useState("");
  const [targetCalMax, setTargetCalMax] = useState("");
  const [targetProtein, setTargetProtein] = useState("");
  const [targetMeals, setTargetMeals] = useState("3");

  const GOAL_TITLES: Record<string, string> = Object.fromEntries(GOAL_TYPES.map((g) => [g.value, g.label]));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await addContact({
        workspaceId,
        fullName,
        whatsappNumber: `+${countryCode}${whatsapp.replace(/\D/g, "")}`,
        relationship: relationship || undefined,
        age: age ? parseInt(age) : undefined,
        gender: gender || undefined,
        weightKg: weightKg ? parseFloat(weightKg) : undefined,
        heightCm: heightCm ? parseFloat(heightCm) : undefined,
        healthNotes: healthNotes || undefined,
        goalType: goalType || undefined,
        goalTitle: goalType ? GOAL_TITLES[goalType] : undefined,
        goalDescription: goalDescription || undefined,
        targetCaloriesMin: targetCalMin ? parseInt(targetCalMin) : undefined,
        targetCaloriesMax: targetCalMax ? parseInt(targetCalMax) : undefined,
        targetProteinG: targetProtein ? parseInt(targetProtein) : undefined,
        targetMealsPerDay: targetMeals ? parseInt(targetMeals) : undefined,
      });
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
      `Hi ${fullName}! 👋\n\n${caregiverName} has set up NutriAI to help keep an eye on your nutrition.\n\nAll you need to do is send a photo or describe what you eat — right here on WhatsApp. I'll do the rest!\n\nYou can start whenever you're ready. Just send me a photo of your next meal 😊`
    );
    return `https://wa.me/${number}?text=${msg}`;
  }

  if (success) {
    return (
      <ModalShell onClose={onClose} title="Contact added">
        <div className="text-center py-6">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">✓</div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">{success.name} added</h3>
          <p className="text-gray-500 text-sm mb-8 max-w-xs mx-auto">
            Send them a WhatsApp message to get started — they just need to reply with a photo of their next meal.
          </p>
          <a
            href={buildWhatsAppUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#25D366] text-white font-semibold rounded-full px-8 py-4 text-sm hover:bg-[#1ebe5d] transition-colors shadow-lg"
          >
            <WhatsAppIcon /> Send WhatsApp invite
          </a>
          <button onClick={onClose} className="block mx-auto mt-4 text-sm text-gray-400 hover:text-gray-600">Done</button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell onClose={onClose} title="Add a contact">
      <form onSubmit={handleSubmit} className="flex flex-col gap-7">

        <section>
          <h3 className="text-xs font-semibold text-rose-600 uppercase tracking-widest mb-4">About them</h3>
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
          <h3 className="text-xs font-semibold text-rose-600 uppercase tracking-widest mb-4">Health info <span className="text-gray-400 normal-case font-normal">— optional</span></h3>
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
          <h3 className="text-xs font-semibold text-rose-600 uppercase tracking-widest mb-4">Goal <span className="text-gray-400 normal-case font-normal">— optional</span></h3>
          <div className="space-y-2 mb-4">
            {GOAL_TYPES.map((g) => (
              <button key={g.value} type="button"
                onClick={() => setGoalType(goalType === g.value ? "" : g.value)}
                className={`w-full flex items-start gap-3 px-4 py-3 rounded-xl border text-left transition-colors ${
                  goalType === g.value ? "border-rose-400 bg-rose-50" : "border-gray-200 hover:border-rose-200"
                }`}>
                <span className={`mt-0.5 w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center ${
                  goalType === g.value ? "border-rose-500 bg-rose-500" : "border-gray-300"
                }`}>
                  {goalType === g.value && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                </span>
                <div>
                  <p className="text-sm font-medium text-gray-900">{g.label}</p>
                  <p className="text-xs text-gray-400">{g.description}</p>
                </div>
              </button>
            ))}
          </div>

          {goalType && (
            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100">
              <div className="col-span-2">
                <Field label="Notes on this goal">
                  <textarea value={goalDescription} onChange={(e) => setGoalDescription(e.target.value)}
                    placeholder="e.g. Doctor recommended at least 60g protein per day"
                    rows={2} className={`${inp} resize-none`} />
                </Field>
              </div>
              <Field label="Daily protein target (g)">
                <input value={targetProtein} onChange={(e) => setTargetProtein(e.target.value)}
                  placeholder="60" type="number" className={inp} />
              </Field>
              <Field label="Meals per day">
                <input value={targetMeals} onChange={(e) => setTargetMeals(e.target.value)}
                  placeholder="3" type="number" min="1" max="6" className={inp} />
              </Field>
              <Field label="Min calories (kcal)">
                <input value={targetCalMin} onChange={(e) => setTargetCalMin(e.target.value)}
                  placeholder="1400" type="number" className={inp} />
              </Field>
              <Field label="Max calories (kcal)">
                <input value={targetCalMax} onChange={(e) => setTargetCalMax(e.target.value)}
                  placeholder="1800" type="number" className={inp} />
              </Field>
            </div>
          )}
        </section>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-600 font-medium rounded-xl py-3 text-sm hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={loading}
            className="flex-1 bg-rose-600 text-white font-semibold rounded-xl py-3 text-sm hover:bg-rose-700 transition-colors disabled:opacity-50">
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

const inp = "w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 transition";

function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}
