"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Type-only: activation.ts and view.ts are server modules, and nothing of
// theirs but these shapes may reach the browser bundle.
import type { ActivationFailure, ConfirmResult, DeactivateResult, ProposalResult } from "@/lib/guidance/activation";
import type { GuidanceView } from "@/lib/guidance/view";

import { GuidanceSetupForm, initialSetupForm, setupFormToAnswers, type SetupFormState } from "./GuidanceSetupForm";
import { GuidanceToday } from "./GuidanceToday";

// The Guidance screen, for every viewer. Which branch renders was decided
// on the server (see lib/guidance/view.ts); this component only steps
// through the setup flow inside the branch it was given:
//
//   answers → review of proposed targets → confirm
//
// The actions arrive pre-bound to the surface and contact by the page, the
// same pattern AccessCodeCard uses. Confirm sends the answers again, not
// the targets shown at review: the server recomputes them.

type Proposal = Extract<ProposalResult, { ok: true }>;
type Declined = Extract<ActivationFailure, { kind: "declined" }>["policy"];

interface GuidancePanelProps {
  view: Exclude<GuidanceView, { kind: "not_found" } | { kind: "feature_off" }>;
  backHref: string;
  onPropose: (answers: unknown) => Promise<ProposalResult>;
  onConfirm: (answers: unknown) => Promise<ConfirmResult>;
  onReturnToTracking: () => Promise<DeactivateResult>;
}

const GENERIC_ERROR = "Something went wrong. Please try again.";

const primaryButton =
  "w-full rounded-xl bg-[var(--color-dashboard-primary)] hover:bg-[var(--color-dashboard-primary-hover)] text-white font-semibold py-3 text-sm disabled:opacity-50 transition";
const secondaryButton =
  "w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition";

function failureMessage(result: ActivationFailure): string {
  if (result.kind === "forbidden" || result.kind === "unavailable") return result.message;
  if (result.kind === "declined") return result.policy.message;
  return GENERIC_ERROR;
}

/** Shown on every screen that renders numbers from a policy nobody has
 * reviewed yet. release.ts only lets that happen outside production, and
 * this is how the screen says so. */
function PreviewBanner({ policyVersion }: { policyVersion: string }) {
  return (
    <div role="note" className="rounded-2xl border border-[var(--color-status-steady-dot)] bg-[var(--color-status-steady-bg)] p-4">
      <p className="text-sm font-semibold text-[var(--color-status-steady-text)]">Preview: unreviewed targets</p>
      <p className="text-sm text-[var(--color-status-steady-text)] mt-1">
        These targets come from policy {policyVersion}, which has not been clinically reviewed yet. They are shown only
        because this is not the production app. Don&apos;t rely on them.
      </p>
    </div>
  );
}

function Notice({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-gray-100 rounded-2xl p-5">
      {title && <h2 className="text-base font-semibold text-gray-900 mb-1">{title}</h2>}
      <div className="text-sm text-gray-600 space-y-2">{children}</div>
    </section>
  );
}

function ReturnToTracking({
  description,
  confirmText,
  onReturnToTracking,
}: {
  description: string;
  confirmText: string;
  onReturnToTracking: () => Promise<DeactivateResult>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (!confirm(confirmText)) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await onReturnToTracking();
        if (result.ok) router.refresh();
        else setError(failureMessage(result));
      } catch {
        setError(GENERIC_ERROR);
      }
    });
  }

  return (
    <section className="bg-white border border-gray-100 rounded-2xl p-5 space-y-3">
      <p className="text-sm text-gray-600">{description}</p>
      <button type="button" onClick={handleClick} disabled={pending} className={secondaryButton}>
        {pending ? "Switching…" : "Return to Tracking"}
      </button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </section>
  );
}

function TargetsReview({ proposal }: { proposal: Proposal }) {
  const t = proposal.targets;
  const items = [
    { label: "Calories", value: `${t.caloriesKcal.toLocaleString("en-US")} kcal` },
    { label: "Protein", value: `${t.proteinG} g` },
    { label: "Carbs", value: `${t.carbsG} g` },
    { label: "Fat", value: `${t.fatG} g` },
    { label: "Fiber", value: `${t.fiberG} g` },
  ];

  return (
    <section className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Your proposed daily targets</h2>
        <p className="text-sm text-gray-500 mt-1">Nothing is switched on until you confirm.</p>
      </div>
      {/* Calories on a row of its own: in a five-across grid "2,381 kcal"
          wraps inside the tile at the panel's max width. */}
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {items.map((item, i) => (
          <div
            key={item.label}
            className={`rounded-xl bg-[var(--color-dashboard-primary-light)] px-3 py-3 ${i === 0 ? "col-span-2 sm:col-span-4" : ""}`}
          >
            <dt className="text-xs text-gray-600">{item.label}</dt>
            <dd className="text-base font-semibold text-gray-900 tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>
      {proposal.notes.length > 0 && (
        <ul className="space-y-1">
          {proposal.notes.map((note) => (
            <li key={note} className="text-sm text-[var(--color-status-steady-text)] bg-[var(--color-status-steady-bg)] rounded-lg px-3 py-2">
              {note}
            </li>
          ))}
        </ul>
      )}
      <details className="text-sm text-gray-600">
        <summary className="cursor-pointer text-gray-900 font-medium">How these were calculated</summary>
        <p className="mt-2 whitespace-pre-line">{proposal.explanation}</p>
        <p className="mt-2 text-xs text-gray-500">Policy {proposal.policyVersion}</p>
      </details>
    </section>
  );
}

function SetupFlow({
  view,
  backHref,
  onPropose,
  onConfirm,
}: {
  view: Extract<GuidanceView, { kind: "setup" }>;
  backHref: string;
  onPropose: GuidancePanelProps["onPropose"];
  onConfirm: GuidancePanelProps["onConfirm"];
}) {
  const router = useRouter();
  const [form, setForm] = useState<SetupFormState>(() => initialSetupForm(view.prefill));
  const [step, setStep] = useState<"answers" | "review" | "declined">("answers");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [declined, setDeclined] = useState<Declined | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleFailure(result: ActivationFailure) {
    if (result.kind === "declined") {
      setDeclined(result.policy);
      setStep("declined");
    } else {
      setError(failureMessage(result));
    }
  }

  function submitAnswers(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const result = await onPropose(setupFormToAnswers(form));
        if (!result.ok) return handleFailure(result);
        setProposal(result);
        setStep("review");
      } catch {
        setError(GENERIC_ERROR);
      }
    });
  }

  function confirmTargets() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await onConfirm(setupFormToAnswers(form));
        if (!result.ok) return handleFailure(result);
        // The page re-renders as the active view once the server has it.
        router.refresh();
      } catch {
        setError(GENERIC_ERROR);
      }
    });
  }

  const banner = view.isPreviewOnly && <PreviewBanner policyVersion={view.policyVersion} />;

  if (step === "declined" && declined) {
    return (
      <div className="space-y-4">
        <Notice title={declined.outcome === "needs_more_detail" ? "A few more details needed" : "We won't set targets for you"}>
          <p>{declined.message}</p>
        </Notice>
        <button type="button" onClick={() => setStep("answers")} className={secondaryButton}>
          Change my answers
        </button>
        <Link href={backHref} className="block text-center text-sm text-gray-500 underline">
          Keep tracking as usual
        </Link>
      </div>
    );
  }

  if (step === "review" && proposal) {
    return (
      <div className="space-y-4">
        {proposal.isPreviewOnly && <PreviewBanner policyVersion={proposal.policyVersion} />}
        <TargetsReview proposal={proposal} />
        <button type="button" onClick={confirmTargets} disabled={pending} className={primaryButton}>
          {pending ? "Turning on…" : "Turn on Guidance"}
        </button>
        <button type="button" onClick={() => setStep("answers")} disabled={pending} className={secondaryButton}>
          Change my answers
        </button>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={submitAnswers} className="space-y-4">
      {banner}
      <Notice>
        <p>
          {view.hasEverActivated
            ? "Guidance is off. Answer a few questions to turn it back on."
            : "Guidance adds daily calorie, protein, carb, fat and fiber targets to your tracking, calculated from a few questions."}{" "}
          You&apos;ll see the targets before anything is switched on.
        </p>
      </Notice>
      <GuidanceSetupForm value={form} onChange={setForm} />
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Calculating…" : "See my targets"}
      </button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

function Body({ view, backHref, onPropose, onConfirm, onReturnToTracking }: GuidancePanelProps) {
  switch (view.kind) {
    case "setup":
      return <SetupFlow view={view} backHref={backHref} onPropose={onPropose} onConfirm={onConfirm} />;

    case "active":
      return (
        <div className="space-y-4">
          {view.isPreviewOnly && <PreviewBanner policyVersion={view.policyVersion} />}
          <GuidanceToday today={view.today} />
          <ReturnToTracking
            description="Return to Tracking turns off your daily targets. Your meals, history and preferences stay as they are, and you can turn Guidance back on any time."
            confirmText="Return to Tracking? Your targets will be hidden. Meals and history are kept."
            onReturnToTracking={onReturnToTracking}
          />
        </div>
      );

    case "paused":
      return (
        <div className="space-y-4">
          <Notice title="Guidance is paused">
            <p>{view.message}</p>
          </Notice>
          <ReturnToTracking
            description="You can switch fully back to Tracking. Your meals and history stay as they are."
            confirmText="Return to Tracking? Meals and history are kept."
            onReturnToTracking={onReturnToTracking}
          />
        </div>
      );

    case "unavailable":
      return (
        <Notice title="Not available yet">
          <p>{view.message}</p>
        </Notice>
      );

    case "caregiver":
      return (
        <div className="space-y-4">
          {view.mode === "guidance" ? (
            <Notice title="Guidance is on">
              <p>They turned on Nutrition Guidance themselves. Their targets and health answers are private to them.</p>
            </Notice>
          ) : (
            <Notice title="Only they can turn this on">
              <p>{view.message}</p>
            </Notice>
          )}
          {view.canReturnToTracking && (
            <ReturnToTracking
              description="If you're worried about the guidance they're getting, you can switch them back to Tracking. Their meals and history are kept, and they can turn Guidance back on themselves."
              confirmText="Switch them back to Tracking? Their targets will be hidden. Meals and history are kept."
              onReturnToTracking={onReturnToTracking}
            />
          )}
        </div>
      );
  }
}

export function GuidancePanel(props: GuidancePanelProps) {
  return (
    <main className="min-h-screen bg-[var(--color-dashboard-surface)] text-gray-900">
      <div className="max-w-xl mx-auto px-4 py-6 space-y-4">
        <Link href={props.backHref} className="inline-block text-sm text-gray-500 hover:text-gray-700">
          ← Back
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">Nutrition Guidance</h1>
        <Body {...props} />
      </div>
    </main>
  );
}
