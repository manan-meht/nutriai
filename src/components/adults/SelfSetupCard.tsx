"use client";

import React, { useEffect, useRef, useState } from "react";
import { saveSelfDetailsAndCreateInvite, getOrCreateSelfInvite, regenerateSelfInvite, markSelfInviteLinkOpened } from "@/app/(adults)/adults/dashboard/actions";
import { InviteCard } from "@/components/shared/invites/InviteCard";
import { NutritionGoalFields, EMPTY_NUTRITION_GOAL_FIELDS, type NutritionGoalFieldsValue } from "@/components/shared/dashboard/NutritionGoalFields";

interface Props {
  workspaceId: string;
  defaultFullName: string;
  onDone: () => void;
  onSkip: () => void;
}

const POLL_INTERVAL_MS = 5000;

const inp = "w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none focus:border-[var(--color-dashboard-primary)] focus:ring-2 focus:ring-[var(--color-dashboard-primary-light)] transition";

// Shown right after self-tracking signup (see /me and the ?self=1 redirect
// param) or whenever the caregiver clicks "Add your details" before their
// self profile exists. Two steps, in order:
//   1. "details" — a form collecting age/weight/goals etc, saved into the
//      pending invite's metadata (no adults_contacts row can exist yet —
//      there's no phone number to key it on until the invite is claimed).
//   2. "invite" — only once details are saved does the WhatsApp invite
//      link appear, so the bot always has real details to work with
//      rather than creating a bare, unconfigured profile the moment
//      someone messages a guessed/leaked token.
export function SelfSetupCard({ workspaceId, defaultFullName, onDone, onSkip }: Props) {
  const [step, setStep] = useState<"details" | "invite">("details");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [fullName, setFullName] = useState(defaultFullName);
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [healthNotes, setHealthNotes] = useState("");
  const [goalFields, setGoalFields] = useState<NutritionGoalFieldsValue>(EMPTY_NUTRITION_GOAL_FIELDS);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function startPolling() {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      const result = await getOrCreateSelfInvite(workspaceId, fullName);
      if (!("error" in result) && result.status === "claimed") {
        if (pollRef.current) clearInterval(pollRef.current);
        onDone();
      }
    }, POLL_INTERVAL_MS);
  }

  async function handleSaveDetails(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const result = await saveSelfDetailsAndCreateInvite(workspaceId, {
        fullName,
        age: age ? parseInt(age) : undefined,
        gender: gender || undefined,
        weightKg: weightKg ? parseFloat(weightKg) : undefined,
        heightCm: heightCm ? parseFloat(heightCm) : undefined,
        healthNotes: healthNotes || undefined,
        primaryNutritionGoal: goalFields.primaryNutritionGoal || undefined,
        dateOfBirth: goalFields.dateOfBirth || undefined,
        metabolicEquationSex: goalFields.metabolicEquationSex || undefined,
        activityLevel: goalFields.activityLevel || undefined,
        resistanceTrainingStatus: goalFields.resistanceTrainingStatus || undefined,
        targetWeightKg: goalFields.targetWeightKg ? parseFloat(goalFields.targetWeightKg) : undefined,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setStep("invite");
      startPolling();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-gray-900">
            {step === "details" ? "Add your details" : "Connect on WhatsApp"}
          </h2>
          <button onClick={onSkip} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="px-6 py-6">
          {step === "details" ? (
            <form onSubmit={handleSaveDetails} className="flex flex-col gap-6">
              <p className="text-sm text-gray-500 -mt-2">
                A few details help us give you accurate protein and calorie targets instead of generic ones — you
                can always change these later.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Field label="Full name" required>
                    <input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" className={inp} />
                  </Field>
                </div>
                <Field label="Age">
                  <input value={age} onChange={(e) => setAge(e.target.value)} placeholder="35" type="number" min="1" max="120" className={inp} />
                </Field>
                <Field label="Gender">
                  <select value={gender} onChange={(e) => setGender(e.target.value)} className={inp}>
                    <option value="">Select</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </Field>
                <Field label="Weight (kg)">
                  <input value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="70" type="number" step="0.1" className={inp} />
                </Field>
                <Field label="Height (cm)">
                  <input value={heightCm} onChange={(e) => setHeightCm(e.target.value)} placeholder="170" type="number" className={inp} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Health notes">
                    <textarea value={healthNotes} onChange={(e) => setHealthNotes(e.target.value)}
                      placeholder="e.g. Diabetic, vegetarian, training for a race"
                      rows={2} className={`${inp} resize-none`} />
                  </Field>
                </div>
              </div>

              <NutritionGoalFields value={goalFields} onChange={setGoalFields} />

              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={onSkip}
                  className="flex-1 border border-gray-200 text-gray-600 font-medium rounded-xl py-3 text-sm hover:bg-gray-50 transition-colors">
                  Skip for now
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-[var(--color-dashboard-primary)] text-white font-semibold rounded-xl py-3 text-sm hover:bg-[var(--color-dashboard-primary-hover)] transition-colors disabled:opacity-50">
                  {saving ? "Saving…" : "Save & continue"}
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-gray-600">
                Message Tistra Health on WhatsApp yourself to start logging meals — this connects your details to
                your WhatsApp number as soon as we receive it.
              </p>
              <InviteCard
                title="Your self-tracking invite"
                description="Tap the button below, then hit send in WhatsApp — you'll be connected the moment we receive it."
                load={() => getOrCreateSelfInvite(workspaceId, fullName)}
                regenerate={() => regenerateSelfInvite(workspaceId)}
                onLinkOpened={() => markSelfInviteLinkOpened(workspaceId)}
                pendingLabel="Pending — waiting for your message on WhatsApp."
              />
              <button type="button" onClick={onSkip} className="text-xs text-gray-400 underline self-start">
                Skip for now
              </button>
            </div>
          )}
        </div>
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
