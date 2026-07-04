"use client";

import React, { useState } from "react";
import { addClient } from "@/app/(gym)/gym/dashboard/actions";

interface AddClientModalProps {
  workspaceId: string;
  coachName: string;
  onClose: () => void;
  onAdded: () => void;
}

const GOAL_TYPES = [
  { value: "weight_loss", label: "Weight loss" },
  { value: "muscle_gain", label: "Muscle gain" },
  { value: "fat_loss", label: "Fat loss" },
  { value: "maintenance", label: "Maintenance" },
  { value: "strength", label: "Strength" },
  { value: "endurance", label: "Endurance" },
  { value: "custom", label: "Custom" },
] as const;

const GOAL_TITLES: Record<string, string> = {
  weight_loss: "Lose weight",
  muscle_gain: "Build muscle",
  fat_loss: "Reduce body fat",
  maintenance: "Maintain current weight",
  strength: "Increase strength",
  endurance: "Improve endurance",
  custom: "Custom goal",
};

export function AddClientModal({ workspaceId, coachName, onClose, onAdded }: AddClientModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ clientName: string; whatsapp: string } | null>(null);

  // Client details
  const [fullName, setFullName] = useState("");
  const [countryCode, setCountryCode] = useState("91");
  const [whatsapp, setWhatsapp] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [heightCm, setHeightCm] = useState("");

  // Goal
  const [goalType, setGoalType] = useState("");
  const [goalDescription, setGoalDescription] = useState("");
  const [targetWeightKg, setTargetWeightKg] = useState("");
  const [targetProteinG, setTargetProteinG] = useState("");
  const [targetCalMin, setTargetCalMin] = useState("");
  const [targetCalMax, setTargetCalMax] = useState("");
  const [targetMeals, setTargetMeals] = useState("");
  const [deadline, setDeadline] = useState("");

  const bmi =
    weightKg && heightCm
      ? (parseFloat(weightKg) / Math.pow(parseFloat(heightCm) / 100, 2)).toFixed(1)
      : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await addClient({
        workspaceId,
        fullName,
        whatsappNumber: `+${countryCode}${whatsapp.replace(/\D/g, "")}`,
        age: age ? parseInt(age) : undefined,
        gender: gender || undefined,
        weightKg: weightKg ? parseFloat(weightKg) : undefined,
        heightCm: heightCm ? parseFloat(heightCm) : undefined,
        goalType: goalType || undefined,
        goalTitle: goalType ? GOAL_TITLES[goalType] : undefined,
        goalDescription: goalDescription || undefined,
        targetWeightKg: targetWeightKg ? parseFloat(targetWeightKg) : undefined,
        targetProteinG: targetProteinG ? parseInt(targetProteinG) : undefined,
        targetCaloriesMin: targetCalMin ? parseInt(targetCalMin) : undefined,
        targetCaloriesMax: targetCalMax ? parseInt(targetCalMax) : undefined,
        targetMealsPerDay: targetMeals ? parseInt(targetMeals) : undefined,
        deadline: deadline || undefined,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSuccess({ clientName: fullName, whatsapp });
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function buildWhatsAppUrl() {
    const clean = whatsapp.replace(/\D/g, "");
    const number = `${countryCode}${clean}`;
    const msg = encodeURIComponent(
      `Hi ${fullName}! 👋\n\n${coachName} has added you to Tistra Health to help track your meals.\n\nAll you need to do is send a photo or a quick description of what you eat — right here on WhatsApp. I'll take care of the rest.\n\nStart whenever you're ready — just reply with your next meal! 🥗`
    );
    return `https://wa.me/${number}?text=${msg}`;
  }

  if (success) {
    return (
      <ModalShell onClose={onClose} title="Client added">
        <div className="text-center py-6">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">✓</span>
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">{success.clientName} added</h3>
          <p className="text-gray-500 text-sm mb-8 max-w-xs mx-auto">
            Send them a WhatsApp message to get started. They just need to reply with their first meal.
          </p>
          <a
            href={buildWhatsAppUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#25D366] text-white font-semibold rounded-full px-8 py-4 text-sm hover:bg-[#1ebe5d] transition-colors shadow-lg"
          >
            <WhatsAppIcon />
            Send WhatsApp invite
          </a>
          <button
            onClick={onClose}
            className="block mx-auto mt-4 text-sm text-gray-400 hover:text-gray-600"
          >
            Done
          </button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell onClose={onClose} title="Add a client">
      <form onSubmit={handleSubmit} className="flex flex-col gap-8">

        {/* ── Client details ─────────────────────────────────── */}
        <section>
          <h3 className="text-xs font-semibold text-purple-600 uppercase tracking-widest mb-4">Client details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Field label="Full name" required>
                <input required value={fullName} onChange={e => setFullName(e.target.value)}
                  placeholder="Arjun Sharma"
                  className={input} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="WhatsApp number" required>
                <div className="flex gap-2">
                  <div className="flex items-center gap-1 border border-gray-200 rounded-xl px-3 py-3 bg-gray-50 min-w-[80px]">
                    <span className="text-sm text-gray-500">+</span>
                    <input
                      value={countryCode}
                      onChange={e => setCountryCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="91"
                      maxLength={4}
                      className="w-10 text-sm text-gray-900 bg-transparent outline-none"
                    />
                  </div>
                  <input
                    required
                    value={whatsapp}
                    onChange={e => setWhatsapp(e.target.value.replace(/\D/g, ""))}
                    placeholder="98765 43210"
                    type="tel"
                    className={`${input} flex-1`}
                  />
                </div>
              </Field>
            </div>
            <Field label="Age">
              <input value={age} onChange={e => setAge(e.target.value)}
                placeholder="28" type="number" min="10" max="100"
                className={input} />
            </Field>
            <Field label="Gender">
              <select value={gender} onChange={e => setGender(e.target.value)} className={input}>
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </Field>
          </div>
        </section>

        {/* ── Physical stats ─────────────────────────────────── */}
        <section>
          <h3 className="text-xs font-semibold text-purple-600 uppercase tracking-widest mb-4">Physical stats <span className="text-gray-400 normal-case font-normal">— optional</span></h3>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Weight (kg)">
              <input value={weightKg} onChange={e => setWeightKg(e.target.value)}
                placeholder="72" type="number" step="0.1"
                className={input} />
            </Field>
            <Field label="Height (cm)">
              <input value={heightCm} onChange={e => setHeightCm(e.target.value)}
                placeholder="175" type="number"
                className={input} />
            </Field>
            <Field label="BMI">
              <div className={`${input} bg-gray-50 text-gray-500 flex items-center`}>
                {bmi ?? "—"}
              </div>
            </Field>
          </div>
        </section>

        {/* ── Goal ───────────────────────────────────────────── */}
        <section>
          <h3 className="text-xs font-semibold text-purple-600 uppercase tracking-widest mb-4">Goal <span className="text-gray-400 normal-case font-normal">— optional</span></h3>
          <div className="flex flex-wrap gap-2 mb-4">
            {GOAL_TYPES.map(g => (
              <button key={g.value} type="button"
                onClick={() => setGoalType(goalType === g.value ? "" : g.value)}
                className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                  goalType === g.value
                    ? "bg-purple-600 text-white border-purple-600"
                    : "bg-white text-gray-700 border-gray-200 hover:border-purple-300"
                }`}>
                {g.label}
              </button>
            ))}
          </div>

          {goalType && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Field label="Goal description">
                  <textarea value={goalDescription} onChange={e => setGoalDescription(e.target.value)}
                    placeholder="e.g. Lose 5kg before wedding in March while maintaining muscle"
                    rows={2} className={`${input} resize-none`} />
                </Field>
              </div>
              {(goalType === "weight_loss" || goalType === "fat_loss" || goalType === "muscle_gain") && (
                <Field label="Target weight (kg)">
                  <input value={targetWeightKg} onChange={e => setTargetWeightKg(e.target.value)}
                    placeholder="68" type="number" step="0.1" className={input} />
                </Field>
              )}
              <Field label="Daily protein target (g)">
                <input value={targetProteinG} onChange={e => setTargetProteinG(e.target.value)}
                  placeholder="160" type="number" className={input} />
              </Field>
              <Field label="Calories min (kcal)">
                <input value={targetCalMin} onChange={e => setTargetCalMin(e.target.value)}
                  placeholder="1800" type="number" className={input} />
              </Field>
              <Field label="Calories max (kcal)">
                <input value={targetCalMax} onChange={e => setTargetCalMax(e.target.value)}
                  placeholder="2200" type="number" className={input} />
              </Field>
              <Field label="Meals per day">
                <input value={targetMeals} onChange={e => setTargetMeals(e.target.value)}
                  placeholder="3" type="number" min="1" max="8" className={input} />
              </Field>
              <Field label="Goal deadline">
                <input value={deadline} onChange={e => setDeadline(e.target.value)}
                  type="date" className={input} />
              </Field>
            </div>
          )}
        </section>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>
        )}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-600 font-medium rounded-xl py-3 text-sm hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={loading}
            className="flex-1 bg-purple-600 text-white font-semibold rounded-xl py-3 text-sm hover:bg-purple-700 transition-colors disabled:opacity-50">
            {loading ? "Adding…" : "Add client"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function ModalShell({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />
      {/* Panel */}
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

function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

const input = "w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition";

function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}
