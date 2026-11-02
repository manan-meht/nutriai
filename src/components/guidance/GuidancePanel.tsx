"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Type-only: activation.ts and view.ts are server modules, and nothing of
// theirs but these shapes may reach the browser bundle.
import type { ActivationFailure, ConfirmResult, DeactivateResult, ProposalResult } from "@/lib/guidance/activation";
import type { GuidancePerson, GuidanceView } from "@/lib/guidance/view";

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

// Midnight teal: the --gm-* tokens are defined on .guidance-theme in
// globals.css, which <main> below carries.
const primaryButton =
  "w-full rounded-xl bg-[var(--gm-accent)] hover:bg-[var(--gm-accent-hover)] text-[var(--gm-on-accent)] font-semibold py-3 text-sm disabled:opacity-50 transition";
const secondaryButton =
  "w-full rounded-xl border border-[var(--gm-border-strong)] bg-transparent py-3 text-sm font-medium text-[var(--gm-text-secondary)] hover:bg-white/5 hover:text-[var(--gm-text)] disabled:opacity-50 transition";
const card = "bg-[var(--gm-card)] border border-[var(--gm-border)] rounded-2xl p-5";
const errorText = "text-sm text-[var(--gm-error-text)]";

function failureMessage(result: ActivationFailure): string {
  if (result.kind === "forbidden" || result.kind === "unavailable" || result.kind === "write_failed") return result.message;
  if (result.kind === "declined") return result.policy.message;
  return GENERIC_ERROR;
}

/** Shown on every screen that renders numbers from a policy nobody has
 * reviewed yet. release.ts only lets that happen outside production, and
 * this is how the screen says so. Written for whoever is looking, not for
 * engineers: the policy version is under "How these were calculated" for
 * anyone who needs it. Worded for anyone's diet, since a caregiver or
 * coach may be the one reading. */
function PreviewBanner() {
  return (
    <div role="note" className="rounded-2xl border border-[var(--gm-over-border)] bg-[var(--gm-over-soft)] p-4">
      <p className="text-sm font-semibold text-[var(--gm-over-text)]">Test version: targets not yet checked</p>
      <p className="text-sm text-[var(--gm-over-text)] opacity-80 mt-1">
        A qualified health professional hasn&apos;t yet reviewed how Tistra works out these targets. You&apos;re seeing
        them only because this is a test version of the app, so don&apos;t use them to change anyone&apos;s diet.
      </p>
    </div>
  );
}

function Notice({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className={card}>
      {title && <h2 className="text-base font-semibold text-[var(--gm-text)] mb-1">{title}</h2>}
      <div className="text-sm text-[var(--gm-text-secondary)] space-y-2">{children}</div>
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
    <section className={`${card} space-y-3`}>
      <p className="text-sm text-[var(--gm-text-secondary)]">{description}</p>
      <button type="button" onClick={handleClick} disabled={pending} className={secondaryButton}>
        {pending ? "Switching…" : "Return to Tracking"}
      </button>
      {error && <p role="alert" className={errorText}>{error}</p>}
    </section>
  );
}

function TargetsReview({ proposal, person }: { proposal: Proposal; person: GuidancePerson }) {
  const t = proposal.targets;
  const items = [
    { label: "Calories", value: `${t.caloriesKcal.toLocaleString("en-US")} kcal` },
    { label: "Protein", value: `${t.proteinG} g` },
    { label: "Carbs", value: `${t.carbsG} g` },
    { label: "Fat", value: `${t.fatG} g` },
    { label: "Fiber", value: `${t.fiberG} g` },
  ];

  return (
    <section className={`${card} space-y-4`}>
      <div>
        <h2 className="text-base font-semibold text-[var(--gm-text)]">
          {person.isSelf ? "Your proposed daily targets" : `Proposed daily targets for ${person.name}`}
        </h2>
        <p className="text-sm text-[var(--gm-text-muted)] mt-1">Nothing is switched on until you confirm.</p>
      </div>
      {/* Calories on a row of its own: in a five-across grid "2,381 kcal"
          wraps inside the tile at the panel's max width. */}
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {items.map((item, i) => (
          <div
            key={item.label}
            className={`rounded-xl px-3 py-3 ${
              i === 0
                ? "col-span-2 sm:col-span-4 bg-[var(--gm-accent-soft)] border border-[var(--gm-accent-border)]"
                : "bg-[var(--gm-raised)] border border-[var(--gm-border)]"
            }`}
          >
            <dt className="text-xs text-[var(--gm-text-secondary)]">{item.label}</dt>
            <dd
              className={`font-semibold tabular-nums ${
                i === 0 ? "text-xl text-[var(--gm-accent-text)]" : "text-base text-[var(--gm-text)]"
              }`}
            >
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
      {proposal.notes.length > 0 && (
        <ul className="space-y-1">
          {proposal.notes.map((note) => (
            <li key={note} className="text-sm text-[var(--gm-over-text)] bg-[var(--gm-over-soft)] border border-[var(--gm-over-border)] rounded-lg px-3 py-2">
              {note}
            </li>
          ))}
        </ul>
      )}
      <details className="text-sm text-[var(--gm-text-secondary)]">
        <summary className="cursor-pointer text-[var(--gm-text)] font-medium">How these were calculated</summary>
        <p className="mt-2 whitespace-pre-line">{proposal.explanation}</p>
        <p className="mt-2 text-xs text-[var(--gm-text-muted)]">Policy {proposal.policyVersion}</p>
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

  const banner = view.isPreviewOnly && <PreviewBanner />;
  const { person } = view;
  const changeAnswers = person.isSelf ? "Change my answers" : "Change the answers";

  if (step === "declined" && declined) {
    return (
      <div className="space-y-4">
        <Notice
          title={
            declined.outcome === "needs_more_detail"
              ? "A few more details needed"
              : `We won't set targets for ${person.isSelf ? "you" : person.name}`
          }
        >
          <p>{declined.message}</p>
        </Notice>
        <button type="button" onClick={() => setStep("answers")} className={secondaryButton}>
          {changeAnswers}
        </button>
        <Link href={backHref} className="block text-center text-sm text-[var(--gm-text-muted)] underline hover:text-[var(--gm-text-secondary)]">
          Keep tracking as usual
        </Link>
      </div>
    );
  }

  if (step === "review" && proposal) {
    return (
      <div className="space-y-4">
        {proposal.isPreviewOnly && <PreviewBanner />}
        <TargetsReview proposal={proposal} person={person} />
        <button type="button" onClick={confirmTargets} disabled={pending} className={primaryButton}>
          {pending ? "Turning on…" : "Turn on Guidance"}
        </button>
        <button type="button" onClick={() => setStep("answers")} disabled={pending} className={secondaryButton}>
          {changeAnswers}
        </button>
        {error && <p role="alert" className={errorText}>{error}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={submitAnswers} className="space-y-4">
      {banner}
      <Notice>
        <p>
          {person.isSelf
            ? view.hasEverActivated
              ? "Guidance is off. Answer a few health questions to turn it back on."
              : "Answer a few health questions to get daily calorie, protein, carb, fat and fiber targets. You'll see them before anything is switched on."
            : view.hasEverActivated
              ? `Guidance is off for ${person.name}. Answer a few health questions to turn it back on.`
              : `Answer a few health questions for ${person.name} to get their daily targets. You'll see them before anything is switched on, and it's recorded as set up by you.`}
        </p>
      </Notice>
      <GuidanceSetupForm person={person} value={form} onChange={setForm} />
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Calculating…" : person.isSelf ? "See my targets" : "See the targets"}
      </button>
      {error && <p role="alert" className={errorText}>{error}</p>}
    </form>
  );
}

function Body({ view, backHref, onPropose, onConfirm, onReturnToTracking }: GuidancePanelProps) {
  switch (view.kind) {
    case "setup":
      return <SetupFlow view={view} backHref={backHref} onPropose={onPropose} onConfirm={onConfirm} />;

    case "active": {
      const { person } = view;
      // Someone else turned it on for the person now looking at it. They
      // should not have to work that out from the numbers.
      const setUpBy = person.isSelf
        ? view.activatedVia === "coach"
          ? "your coach"
          : view.activatedVia === "caregiver"
            ? "the person who tracks your meals"
            : null
        : null;
      return (
        <div className="space-y-4">
          {view.isPreviewOnly && <PreviewBanner />}
          {setUpBy && (
            <Notice title="Set up for you">
              <p>
                Nutrition Guidance was turned on for you by {setUpBy}. You can switch it off below at any time.
              </p>
            </Notice>
          )}
          <GuidanceToday today={view.today} />
          {person.isSelf ? (
            <ReturnToTracking
              description="Return to Tracking turns off your daily targets. Your meals, history and preferences stay as they are, and you can turn Guidance back on any time."
              confirmText="Return to Tracking? Your targets will be hidden. Meals and history are kept."
              onReturnToTracking={onReturnToTracking}
            />
          ) : (
            <ReturnToTracking
              description={`Return to Tracking turns off ${person.name}'s daily targets. Their meals, history and preferences stay as they are, and Guidance can be turned back on any time.`}
              confirmText={`Return ${person.name} to Tracking? Their targets will be hidden. Meals and history are kept.`}
              onReturnToTracking={onReturnToTracking}
            />
          )}
        </div>
      );
    }

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

  }
}

export function GuidancePanel(props: GuidancePanelProps) {
  return (
    <main className="guidance-theme min-h-screen bg-[var(--gm-page)] text-[var(--gm-text)]">
      <div className="max-w-xl mx-auto px-4 py-6 space-y-4">
        <Link
          href={props.backHref}
          className="inline-block text-sm text-[var(--gm-text-muted)] hover:text-[var(--gm-text-secondary)]"
        >
          ← Back
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-[var(--gm-text)]">Nutrition Guidance</h1>
          {props.view.kind === "active" && (
            <span className="rounded-full border border-[var(--gm-accent-border)] bg-[var(--gm-accent-soft)] px-2.5 py-0.5 text-xs font-medium text-[var(--gm-accent-text)]">
              Guidance on
            </span>
          )}
        </div>
        <Body {...props} />
      </div>
    </main>
  );
}
