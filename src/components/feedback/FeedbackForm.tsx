"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  FEEDBACK_MESSAGE_MAX_LENGTH,
  FEEDBACK_MESSAGE_MIN_LENGTH,
  FEEDBACK_TYPE_OPTIONS,
  type FeedbackType,
} from "@/lib/feedback/types";
import { trackFeedbackEvent } from "@/lib/feedback/analytics";

export interface FeedbackFormProps {
  source: "dashboard" | "website";
  /** Only relevant for source="dashboard" — a non-sensitive hint (which
   * dashboard rendered this form) so the API route can look up the
   * account's real plan server-side, rather than trusting an open-ended
   * client-supplied "accountType" string. */
  product?: "gym" | "adults";
  /** Logged-in users' email, straight from their session — shown read-only
   * rather than left editable, since the API always re-derives it from the
   * session anyway (an edited value here would just be silently ignored). */
  prefillEmail?: string;
  onSuccess?: () => void;
  /** Lets a wrapping modal know a submission is in flight, so it can (e.g.)
   * disable Escape-to-close until it resolves. */
  onSubmittingChange?: (submitting: boolean) => void;
}

export function FeedbackForm({ source, product, prefillEmail, onSuccess, onSubmittingChange }: FeedbackFormProps) {
  const [feedbackType, setFeedbackType] = useState<FeedbackType | "">("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState(prefillEmail ?? "");
  const [honeypot, setHoneypot] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const renderedAtRef = useRef(Date.now());
  const openedTrackedRef = useRef(false);

  useEffect(() => {
    if (openedTrackedRef.current) return;
    openedTrackedRef.current = true;
    trackFeedbackEvent("feedback_form_opened", { source, ...(product ? { accountType: product } : {}) });
  }, [source, product]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (!feedbackType) {
      setError("Please choose a feedback type.");
      return;
    }
    const trimmed = message.trim();
    if (trimmed.length < FEEDBACK_MESSAGE_MIN_LENGTH) {
      setError(`Please write at least ${FEEDBACK_MESSAGE_MIN_LENGTH} characters.`);
      return;
    }
    if (trimmed.length > FEEDBACK_MESSAGE_MAX_LENGTH) {
      setError(`Please keep your message under ${FEEDBACK_MESSAGE_MAX_LENGTH} characters.`);
      return;
    }

    setSubmitting(true);
    onSubmittingChange?.(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedbackType,
          message: trimmed,
          email: prefillEmail ? undefined : email.trim() || undefined,
          source,
          product,
          pageUrl: typeof window !== "undefined" ? window.location.href : undefined,
          website: honeypot,
          renderedAt: renderedAtRef.current,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        const msg = json?.error ?? "Something went wrong. Please try again.";
        setError(msg);
        trackFeedbackEvent("feedback_submission_failed", { source, feedbackType, ...(product ? { accountType: product } : {}) });
        return;
      }
      setSuccess(true);
      trackFeedbackEvent("feedback_submitted", { source, feedbackType, ...(product ? { accountType: product } : {}) });
      onSuccess?.();
    } catch {
      setError("Couldn't reach the server. Please check your connection and try again.");
      trackFeedbackEvent("feedback_submission_failed", { source, feedbackType, ...(product ? { accountType: product } : {}) });
    } finally {
      setSubmitting(false);
      onSubmittingChange?.(false);
    }
  }

  if (success) {
    return (
      <div className="text-center py-8" role="status">
        <div className="w-16 h-16 bg-[var(--color-dashboard-primary-light)] rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
          🙏
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">Thank you</h3>
        <p className="text-gray-500 text-sm max-w-xs mx-auto">
          Thank you — your feedback has been sent to the Tistra Health team.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      {/* Honeypot — real users never see this. Off-screen rather than
          display:none/type=hidden, and still keyboard/screen-reader
          unreachable via tabIndex/aria-hidden. */}
      <div className="absolute w-px h-px overflow-hidden opacity-0 -z-10" aria-hidden="true">
        <label htmlFor="fb-website">Leave this field empty</label>
        <input id="fb-website" type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
      </div>

      <Field label="Feedback type" htmlFor="fb-type" required>
        <select
          id="fb-type"
          required
          value={feedbackType}
          onChange={(e) => setFeedbackType(e.target.value as FeedbackType)}
          className={inp}
        >
          <option value="" disabled>Select a type</option>
          {FEEDBACK_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </Field>

      <Field label="What can we improve?" htmlFor="fb-message" required>
        <textarea
          id="fb-message"
          required
          minLength={FEEDBACK_MESSAGE_MIN_LENGTH}
          maxLength={FEEDBACK_MESSAGE_MAX_LENGTH}
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us what's on your mind..."
          className={`${inp} resize-none`}
        />
        <p className="text-xs text-gray-400 mt-1 text-right">{message.length}/{FEEDBACK_MESSAGE_MAX_LENGTH}</p>
      </Field>

      <Field label="Email address" htmlFor="fb-email">
        {prefillEmail ? (
          <>
            <input id="fb-email" type="email" value={prefillEmail} readOnly disabled className={`${inp} bg-gray-50 text-gray-500`} />
            <p className="text-xs text-gray-400 mt-1">We&apos;ll use the email on your account.</p>
          </>
        ) : (
          <>
            <input
              id="fb-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inp}
            />
            <p className="text-xs text-gray-400 mt-1">Optional — only needed if you&apos;d like a response.</p>
          </>
        )}
      </Field>

      {error && (
        <p role="alert" aria-live="assertive" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-[var(--color-dashboard-primary)] text-white font-semibold rounded-xl py-3 text-sm hover:bg-[var(--color-dashboard-primary-hover)] transition-colors disabled:opacity-50"
      >
        {submitting ? "Sending…" : "Send feedback"}
      </button>
    </form>
  );
}

function Field({ label, htmlFor, required, children }: { label: string; htmlFor: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inp = "w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none focus:border-[var(--color-dashboard-primary)] focus:ring-2 focus:ring-[var(--color-dashboard-primary-light)] transition";
