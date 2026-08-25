"use client";

import { useState, useTransition } from "react";
import { adminOnboardingLink, adminDashboardLink } from "./actions";

/** Buttons for looking at, or handing over, a coach's Stripe setup.
 *
 * The link is shown rather than followed. Two reasons: the common use is
 * sending it to the coach, and opening it yourself is a thing worth doing
 * deliberately given what it is — the form that decides which bank account
 * receives that coach's money.
 */
export function StripeLinks({
  coachProfileId,
  coachName,
  hasAccount,
  payoutsEnabled,
}: {
  coachProfileId: string;
  coachName: string;
  hasAccount: boolean;
  payoutsEnabled: boolean;
}) {
  const [pending, start] = useTransition();
  const [link, setLink] = useState<{ url: string; kind: "onboarding" | "dashboard" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function fetchLink(kind: "onboarding" | "dashboard") {
    setError(null);
    setLink(null);
    setCopied(false);
    start(async () => {
      const result = kind === "onboarding"
        ? await adminOnboardingLink(coachProfileId)
        : await adminDashboardLink(coachProfileId);
      if (result.ok) setLink({ url: result.url, kind });
      else setError(result.error);
    });
  }

  if (!hasAccount) return null;

  return (
    <div className="mt-4 border-t border-gray-200 pt-4">
      <div className="flex flex-wrap items-center gap-3">
        {!payoutsEnabled && (
          <button
            type="button"
            disabled={pending}
            onClick={() => fetchLink("onboarding")}
            className="rounded-full border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-50"
          >
            {pending ? "Working…" : "Get onboarding link"}
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => fetchLink("dashboard")}
          className="rounded-full border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-50"
        >
          {pending ? "Working…" : "Express dashboard link"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      {link && (
        <div className="mt-3 rounded-lg bg-gray-50 p-3">
          <p className="text-xs text-gray-600">
            {link.kind === "onboarding" ? (
              <>
                <strong>Expires in a few minutes.</strong> Open it now to see the form {coachName} sees,
                or send it straight away. Whatever bank account is entered here receives{" "}
                {coachName}&rsquo;s payouts — do not complete it on their behalf.
              </>
            ) : (
              <>
                <strong>Expires shortly.</strong> Opens {coachName}&rsquo;s Express dashboard, where their
                bank details and payouts live.
              </>
            )}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-gray-900 underline underline-offset-2"
            >
              Open ↗
            </a>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(link.url);
                setCopied(true);
              }}
              className="text-sm text-gray-600 underline underline-offset-2 hover:text-gray-900"
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          <p className="mt-2 break-all font-mono text-[11px] leading-4 text-gray-500">{link.url}</p>
        </div>
      )}
    </div>
  );
}
