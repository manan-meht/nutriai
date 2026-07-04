"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestOtpAction, verifyOtpAction } from "@/app/(public)/my-progress/actions";

export function MyProgressVerifyForm({ whatsappNumber }: { whatsappNumber: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resent, setResent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await verifyOtpAction(whatsappNumber, code);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push("/my-progress/dashboard");
  }

  async function handleResend() {
    setError(null);
    setSubmitting(true);
    const result = await requestOtpAction(whatsappNumber);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setResent(true);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        required
        placeholder="6-digit code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-base tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-neutral-400"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {resent && !error && <p className="text-sm text-neutral-500">New code sent.</p>}
      <button
        type="submit"
        disabled={submitting || code.length < 6}
        className="w-full rounded-lg bg-neutral-900 text-white py-3 text-base font-medium disabled:opacity-50"
      >
        {submitting ? "Checking…" : "Verify"}
      </button>
      <button
        type="button"
        onClick={handleResend}
        disabled={submitting}
        className="w-full text-sm text-neutral-500 underline"
      >
        Resend code
      </button>
    </form>
  );
}
