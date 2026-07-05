"use client";

import React, { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { scopedEmail } from "@/lib/auth";
import { useRouter } from "next/navigation";

type Product = "gym" | "adults";
type Mode = "signin" | "signup";

interface AuthFormProps {
  product: Product;
  mode: Mode;
  next?: string;
}

// Same purple used across the marketing site (/, /family, /coach, /me) —
// gym and adults previously had different accent colors (purple vs rose)
// here; unified to one color scheme per product decision.
const THEME = {
  gym: {
    accent: "bg-[#6750A4] hover:bg-[#4F378A] focus-visible:ring-[#6750A4]",
    accentText: "text-[#6750A4]",
    accentBorder: "border-[#6750A4]",
    ring: "focus:ring-[#6750A4]",
    label: "Tistra Health",
    dashboardUrl: "/gym/dashboard",
    switchUrl: (mode: Mode) => (mode === "signin" ? "/gym/signup" : "/gym/login"),
  },
  adults: {
    accent: "bg-[#6750A4] hover:bg-[#4F378A] focus-visible:ring-[#6750A4]",
    accentText: "text-[#6750A4]",
    accentBorder: "border-[#6750A4]",
    ring: "focus:ring-[#6750A4]",
    label: "Tistra Health",
    dashboardUrl: "/adults/dashboard",
    switchUrl: (mode: Mode) => (mode === "signin" ? "/signup" : "/login"),
  },
} as const;

export function AuthForm({ product, mode, next }: AuthFormProps) {
  const theme = THEME[product];
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "facebook" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  const redirectTo = `${typeof window !== "undefined" ? window.location.origin : ""}/auth/callback?next=${encodeURIComponent(next ?? theme.dashboardUrl)}`;

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const authEmail = scopedEmail(email, product);
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: authEmail,
          password,
          options: { emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        setEmailSent(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password });
        if (error) throw error;
        router.push(next ?? theme.dashboardUrl);
        router.refresh();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message
        : typeof err === "object" && err !== null && "message" in err ? String((err as Record<string, unknown>).message)
        : JSON.stringify(err);
      setError(msg || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: "google" | "facebook") {
    setError(null);
    setOauthLoading(provider);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
      if (error) throw error;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message
        : typeof err === "object" && err !== null && "message" in err ? String((err as Record<string, unknown>).message)
        : JSON.stringify(err);
      setError(msg || "OAuth sign-in failed.");
      setOauthLoading(null);
    }
  }

  if (emailSent) {
    return (
      <div className="text-center py-8">
        <p className="text-4xl mb-4">📬</p>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Check your email</h2>
        <p className="text-gray-500 text-sm max-w-xs mx-auto">
          We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">

      {/* OAuth buttons */}
      <>
          <button
            type="button"
            onClick={() => handleOAuth("google")}
            disabled={!!oauthLoading || loading}
            className="flex items-center justify-center gap-3 w-full border border-gray-300 rounded-xl py-3 px-4 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {oauthLoading === "google" ? <Spinner /> : <GoogleIcon />}
            Continue with Google
          </button>

          <button
            type="button"
            onClick={() => handleOAuth("facebook")}
            disabled={!!oauthLoading || loading}
            className="flex items-center justify-center gap-3 w-full border border-gray-300 rounded-xl py-3 px-4 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {oauthLoading === "facebook" ? <Spinner /> : <FacebookIcon />}
            Continue with Facebook
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 font-medium">or</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
      </>

      {/* Email / password form */}
      <form onSubmit={handleEmail} className="flex flex-col gap-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={`w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-transparent focus:ring-2 ${theme.ring} transition`}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            {mode === "signin" && (
              <Link
                href={`/auth/forgot-password?product=${product}`}
                className={`text-xs ${theme.accentText} hover:underline`}
              >
                Forgot password?
              </Link>
            )}
          </div>
          <input
            id="password"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
            className={`w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-transparent focus:ring-2 ${theme.ring} transition`}
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !!oauthLoading}
          className={`w-full ${theme.accent} text-white font-semibold rounded-xl py-3 text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2`}
        >
          {loading && <Spinner light />}
          {mode === "signup" ? "Create account" : "Sign in"}
        </button>
      </form>

      {/* Switch mode */}
      <p className="text-center text-sm text-gray-500">
        {mode === "signup" ? "Already have an account? " : "Don't have an account? "}
        <Link href={theme.switchUrl(mode)} className={`font-medium ${theme.accentText} hover:underline`}>
          {mode === "signup" ? "Sign in" : "Create one"}
        </Link>
      </p>

      {mode === "signup" && (
        <p className="text-center text-xs text-gray-400 leading-relaxed">
          Tistra Health is a tracking and awareness tool only. It does not provide medical advice, diagnosis,
          treatment, or personalized nutrition therapy. AI-generated summaries may be inaccurate or incomplete. For
          any health, diet, medical condition, medication, or nutrition concern, please consult a qualified
          healthcare professional, doctor, or registered dietitian.
        </p>
      )}
    </div>
  );
}

function Spinner({ light }: { light?: boolean }) {
  return (
    <svg
      className={`w-4 h-4 animate-spin ${light ? "text-white" : "text-gray-500"}`}
      fill="none" viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2">
      <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
    </svg>
  );
}
