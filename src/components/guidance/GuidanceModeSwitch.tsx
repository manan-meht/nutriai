"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// "Guidance mode" on and off, at the top of a person's page.
//
// Off → on goes through the setup flow (a few health questions, screening
// and the targets to confirm): Guidance is never switched on without them,
// so the switch opens that page rather than flipping a setting. On → off is
// Return to Tracking, which keeps every target, meal and plan, and asks
// once before doing it. A coach client has Guidance only, so there's no off
// for them: the switch shows the state and nothing more.

type Result = { ok: boolean; message?: string };

function Track({ on, dark }: { on: boolean; dark: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
        on ? (dark ? "bg-[var(--gm-accent)]" : "bg-violet-600") : dark ? "bg-white/20" : "bg-gray-300"
      }`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${on ? "translate-x-5" : "translate-x-0.5"}`} />
    </span>
  );
}

/** On the ordinary (Tracking) dashboard: the way in. */
export function GuidanceModeOffBar({ setupHref, personName, dm }: { setupHref: string; personName?: string; dm?: boolean }) {
  const router = useRouter();
  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 ${
        dm ? "dark:border-violet-400/25 dark:bg-violet-400/10" : ""
      }`}
    >
      <span className="min-w-0">
        <span className={`flex items-center gap-2 text-sm font-semibold text-gray-900 ${dm ? "dark:text-white" : ""}`}>
          Guidance mode
          <span className={`rounded-full bg-violet-600/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-violet-700 ${dm ? "dark:bg-violet-300/15 dark:text-violet-200" : ""}`}>
            Beta
          </span>
        </span>
        <span className={`block text-xs text-gray-600 ${dm ? "dark:text-gray-300" : ""}`}>
          Daily targets, meal suggestions and weekly progress{personName ? ` for ${personName}` : ""}. Off.
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={false}
        aria-label={`Turn on Guidance mode${personName ? ` for ${personName}` : ""}`}
        onClick={() => router.push(setupHref)}
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
      >
        <Track on={false} dark={false} />
      </button>
    </div>
  );
}

/** In the Guidance screen's header: on, and the way back to Tracking. */
export function GuidanceModeOnSwitch({ onTurnOff, personName }: { onTurnOff?: () => Promise<Result>; personName?: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!onTurnOff) {
    return (
      <span className="flex items-center gap-2 text-xs font-medium text-[var(--gm-text-secondary)]" title="Coach clients always have Guidance">
        <span className="hidden sm:inline">Guidance</span>
        <Track on dark />
      </span>
    );
  }

  return (
    <span className="relative flex items-center">
      <button
        type="button"
        role="switch"
        aria-checked={true}
        aria-label={`Guidance mode is on${personName ? ` for ${personName}` : ""}. Turn it off`}
        onClick={() => setConfirming(true)}
        className="flex items-center gap-2 rounded-full text-xs font-medium text-[var(--gm-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--gm-page)]"
      >
        <span className="hidden sm:inline">Guidance</span>
        <Track on dark />
      </button>
      {confirming && (
        <div
          role="dialog"
          aria-label="Turn off Guidance mode"
          className="absolute right-0 top-10 z-30 w-72 rounded-xl border border-[var(--gm-border-strong)] bg-[var(--gm-card)] p-4 text-left shadow-2xl"
        >
          <p className="text-sm font-semibold text-[var(--gm-text)]">Turn off Guidance mode?</p>
          <p className="mt-1 text-xs text-[var(--gm-text-secondary)]">
            The dashboard goes back to tracking. Targets, meals, plans and habits are kept, and Guidance can be switched back on any time.
          </p>
          {error && (
            <p role="alert" className="mt-2 text-xs text-[var(--gm-error-text)]">
              {error}
            </p>
          )}
          <div className="mt-3 flex items-center gap-4">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  try {
                    const r = await onTurnOff();
                    if (!r.ok) {
                      setError(r.message ?? "That didn't work. Please try again.");
                      return;
                    }
                    setConfirming(false);
                    router.refresh();
                  } catch {
                    setError("That didn't work. Please try again.");
                  }
                })
              }
              className="rounded-lg bg-[var(--gm-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--gm-on-accent)] disabled:opacity-60"
            >
              {pending ? "Turning off…" : "Turn off"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="text-xs font-medium text-[var(--gm-accent-text)] hover:underline">
              Keep it on
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
