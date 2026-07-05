"use client";

import { useState } from "react";
import { addSelfContact } from "@/app/(adults)/adults/dashboard/actions";

interface Props {
  workspaceId: string;
  defaultFullName: string;
  onDone: () => void;
  onSkip: () => void;
}

// Shown once, right after self-tracking signup (see /me and the ?self=1
// redirect param), so the new user's own tracked profile is created
// through the same addContact/limit/trial/WhatsApp-invite path as every
// other contact — just with relationship_type "self".
export function SelfSetupCard({ workspaceId, defaultFullName, onDone, onSkip }: Props) {
  const [fullName, setFullName] = useState(defaultFullName);
  const [whatsapp, setWhatsapp] = useState("");
  const [countryCode, setCountryCode] = useState("91");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await addSelfContact(
      workspaceId,
      fullName,
      `+${countryCode}${whatsapp.replace(/\D/g, "")}`
    );
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onDone();
  }

  return (
    <div className="mb-8 rounded-2xl border border-rose-100 bg-rose-50/60 p-6">
      <h2 className="text-lg font-bold text-gray-900 mb-1">Start tracking yourself</h2>
      <p className="text-sm text-gray-600 mb-4">
        Add your own WhatsApp number to start logging your meals — this creates your personal tracked profile.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          required
          placeholder="Your name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
        />
        <div className="flex gap-2 flex-1">
          <input
            type="text"
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value.replace(/\D/g, ""))}
            className="w-16 rounded-lg border border-gray-200 px-2 py-2.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-rose-300"
          />
          <input
            type="tel"
            required
            placeholder="Your WhatsApp number"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg px-5 py-2.5 text-sm disabled:opacity-50"
        >
          {submitting ? "Setting up…" : "Start tracking"}
        </button>
      </form>
      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      <button type="button" onClick={onSkip} className="text-xs text-gray-400 underline mt-3">
        Skip for now
      </button>
    </div>
  );
}
