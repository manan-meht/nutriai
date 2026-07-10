"use client";


import React, { useState, Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { scopedEmail } from "@/lib/auth";
import { useSearchParams } from "next/navigation";

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const product = searchParams.get("product") === "adults" ? "adults" : "gym";
  const accentText = product === "gym" ? "text-purple-600" : "text-rose-600";
  const accentRing = product === "gym" ? "focus:ring-purple-500" : "focus:ring-rose-500";
  const accentBtn = product === "gym"
    ? "bg-purple-600 hover:bg-purple-700"
    : "bg-rose-600 hover:bg-rose-700";
  const loginUrl = product === "gym" ? "/gym/login" : "/adults/login";

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(`/auth/reset-password?product=${product}`)}`;
      const { error } = await supabase.auth.resetPasswordForEmail(scopedEmail(email, product), { redirectTo });
      if (error) throw error;
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6">
      <div className="max-w-sm w-full">
        <Link href={loginUrl} className={`text-sm ${accentText} hover:underline mb-8 block`}>
          ← Back to sign in
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Reset your password</h1>
        <p className="text-gray-500 text-sm mb-8">
          Enter your email and we&apos;ll send you a link to reset your password.
        </p>

        {sent ? (
          <div className="text-center py-6">
            <p className="text-3xl mb-3">📬</p>
            <p className="text-sm text-gray-600">
              Check <strong>{email}</strong> for a reset link.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={`w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 ${accentRing} transition`}
            />
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className={`w-full ${accentBtn} text-white font-semibold rounded-xl py-3 text-sm transition-colors disabled:opacity-50`}
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordForm />
    </Suspense>
  );
}
