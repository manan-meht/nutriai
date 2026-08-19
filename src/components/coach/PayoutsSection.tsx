"use client";

import { useState, useTransition } from "react";
import { startPayoutOnboarding, openPayoutDashboard, refreshPayoutStatus } from "@/app/(coach)/coach/actions";
import { CLUB_TOKENS as T } from "./tokens";
import { formatMoney, splitAmount } from "@/lib/club/config";

// Payouts.
//
// Stripe Connect Express: Stripe collects identity, bank details and tax
// information on its own hosted pages, so none of it passes through us and
// there is nothing sensitive to store. What's kept is the account id and
// whether Stripe says payouts are enabled.
//
// The status shown is always Stripe's, never our optimism. A coach who
// abandons verification halfway returns to this page exactly like one who
// finished, so "they came back" is not treated as "they're done".

export interface PayoutState {
  status: "not_started" | "pending" | "restricted" | "enabled" | "disabled";
  payoutsEnabled: boolean;
  hasAccount: boolean;
  feePercent: number;
}

const COPY: Record<PayoutState["status"], { label: string; tone: "ok" | "wait" | "bad"; detail: string }> = {
  not_started: {
    label: "Not set up",
    tone: "wait",
    detail: "Set up payouts so clients can pay you. Stripe handles your bank details and identity checks.",
  },
  pending: {
    label: "Stripe needs more information",
    tone: "wait",
    detail: "You started but Stripe still needs a few details before it can pay you.",
  },
  restricted: {
    label: "Under review",
    tone: "wait",
    detail: "Stripe is reviewing your account. This usually clears on its own within a day.",
  },
  enabled: {
    label: "Ready",
    tone: "ok",
    detail: "You're set up to be paid. Payouts go to your bank on Stripe's normal schedule.",
  },
  disabled: {
    label: "Payouts paused by Stripe",
    tone: "bad",
    detail: "Stripe has paused payouts on this account. Open the Stripe dashboard to see what's needed.",
  },
};

/** A round number in the market's currency, so the split reads as money
 * rather than arithmetic. */
const EXAMPLE_PRICE_CENTS = 8000;

export function PayoutsSection({ state }: { state: PayoutState }) {
  const exampleSplit = splitAmount(EXAMPLE_PRICE_CENTS, state.feePercent);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[state.status];
  const toneColor = copy.tone === "ok" ? T.success : copy.tone === "bad" ? T.error : T.warning;

  function go(action: () => Promise<{ ok: true; url: string } | { ok: false; error: string }>) {
    setError(null);
    start(async () => {
      const result = await action();
      if (result.ok) window.location.assign(result.url);
      else setError(result.error);
    });
  }

  return (
    <section className="rounded-2xl border p-5" style={{ backgroundColor: T.surfaceContainerLowest, borderColor: T.outlineVariant }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Payments and payouts</h2>
          <p className="mt-1 max-w-xl text-sm" style={{ color: T.onSurfaceVariant }}>{copy.detail}</p>
        </div>
        <span
          className="shrink-0 rounded-full px-3 py-1 text-xs font-medium"
          style={{ backgroundColor: T.surfaceContainerLow, color: toneColor }}
        >
          {copy.label}
        </span>
      </div>

      {/* Stated plainly rather than buried in terms: a coach should know
          what they keep, and that the number is all-in, before they connect
          a bank account. */}
      <div className="mt-4 rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: T.surfaceContainerLow }}>
        <p>
          Tistra keeps <strong>{state.feePercent}%</strong> of each session, and that covers card
          processing — there&rsquo;s nothing deducted on top.
        </p>
        <p className="mt-1.5" style={{ color: T.onSurfaceVariant }}>
          {formatMoney(EXAMPLE_PRICE_CENTS)} session → {formatMoney(exampleSplit.platformFeeCents)} to
          Tistra, <strong style={{ color: T.onSurface }}>{formatMoney(exampleSplit.coachAmountCents)} to you</strong>.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!state.payoutsEnabled && (
          <button
            type="button"
            disabled={pending}
            onClick={() => go(() => startPayoutOnboarding(window.location.origin))}
            className="rounded-full px-5 py-2.5 text-sm font-medium disabled:opacity-60"
            style={{ backgroundColor: T.primary, color: T.onPrimary }}
          >
            {pending ? "Opening Stripe…" : state.hasAccount ? "Continue setup" : "Set up payouts"}
          </button>
        )}

        {state.hasAccount && (
          <button
            type="button"
            disabled={pending}
            onClick={() => go(openPayoutDashboard)}
            className="rounded-full border px-5 py-2.5 text-sm font-medium disabled:opacity-60"
            style={{ borderColor: T.outlineVariant }}
          >
            Open Stripe dashboard
          </button>
        )}

        {state.hasAccount && !state.payoutsEnabled && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setError(null);
              start(async () => {
                const r = await refreshPayoutStatus();
                if (!r.ok) setError(r.error);
              });
            }}
            className="text-sm underline"
            style={{ color: T.onSurfaceVariant }}
          >
            Check again
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-sm" style={{ color: T.error }}>{error}</p>}
    </section>
  );
}
