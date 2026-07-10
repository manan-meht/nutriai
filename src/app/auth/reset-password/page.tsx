"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const product = searchParams.get("product") === "adults" ? "adults" : "gym";
  const accentRing = product === "gym" ? "focus:ring-purple-500" : "focus:ring-rose-500";
  const accentBtn = product === "gym"
    ? "bg-purple-600 hover:bg-purple-700"
    : "bg-rose-600 hover:bg-rose-700";
  const loginUrl = product === "gym" ? "/gym/login" : "/adults/login";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      // The recovery session was already established by /auth/callback
      // (exchangeCodeForSession) before redirecting here — updateUser just
      // needs that session's cookies, not the original recovery code.
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6">
      <div className="max-w-sm w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Set a new password</h1>
        <p className="text-gray-500 text-sm mb-8">Choose a new password for your account.</p>

        {done ? (
          <div className="text-center py-6">
            <p className="text-3xl mb-3">✅</p>
            <p className="text-sm text-gray-600 mb-6">Your password has been updated.</p>
            <Link
              href={loginUrl}
              className={`inline-block w-full ${accentBtn} text-white font-semibold rounded-xl py-3 text-sm transition-colors`}
            >
              Sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password (at least 8 characters)"
              className={`w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 ${accentRing} transition`}
            />
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
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
              {loading ? "Updating…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
