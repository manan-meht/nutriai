"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestOtpAction } from "@/app/(public)/my-progress/actions";

export function MyProgressEntryForm() {
  const router = useRouter();
  const [number, setNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await requestOtpAction(number);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/my-progress/verify?number=${encodeURIComponent(number)}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="tel"
        inputMode="tel"
        required
        placeholder="Your phone number, e.g. +65 9123 4567"
        value={number}
        onChange={(e) => setNumber(e.target.value)}
        className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-neutral-400"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !number}
        className="w-full rounded-lg bg-neutral-900 text-white py-3 text-base font-medium disabled:opacity-50"
      >
        {submitting ? "Sending code…" : "Send me a code"}
      </button>
      <p className="text-xs text-neutral-400 text-center">
        No app install, no signup — just your phone number.
      </p>
    </form>
  );
}
