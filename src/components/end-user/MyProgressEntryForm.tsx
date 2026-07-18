"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { verifyOtpAction } from "@/app/(public)/my-progress/actions";

/** "I was invited" — a single combined form (WhatsApp number + access
 * code) rather than the old two-step "send me a code, then enter it"
 * flow. There's no "send" step for a Temporary Access Code: a family
 * owner or coach already generated and shared it manually (usually over
 * WhatsApp) before the participant ever reaches this page, so asking them
 * to request a code here would be asking for one that doesn't exist yet.
 * verifyOtpAction itself doesn't care whether the code being checked was
 * manually generated or (still supported, e.g. if SMS OTP delivery is
 * ever reinstated) system-issued — both are the same kind of row. */
export function MyProgressEntryForm() {
  const router = useRouter();
  const [number, setNumber] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await verifyOtpAction(number, code);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // /my-progress/dashboard itself shows the consent screen inline when
    // needed (see that page) — no separate consent route.
    router.push("/my-progress/dashboard");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="tel"
        inputMode="tel"
        required
        placeholder="Invited WhatsApp number, e.g. +65 9123 4567"
        value={number}
        onChange={(e) => setNumber(e.target.value)}
        className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-neutral-400"
      />
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={8}
        required
        placeholder="Access code, e.g. 482913"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-base tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-neutral-400"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !number || code.length < 6}
        className="w-full rounded-lg bg-neutral-900 text-white py-3 text-base font-medium disabled:opacity-50"
      >
        {submitting ? "Checking…" : "Continue"}
      </button>
      <p className="text-xs text-neutral-400 text-center">
        Ask the family member or coach who added you for your access code.
      </p>
    </form>
  );
}
