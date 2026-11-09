"use client";

import { useState } from "react";

import type { GuidanceActions } from "@/lib/guidance/bound-actions";
import type { HabitOption, HabitVariant, HabitView } from "@/lib/guidance/habits";

import { useGuidanceAction } from "./use-guidance-action";
import { card, eyebrow, primaryAction, quietButton, type GuidanceViewer } from "./ui";

// The week's one change: proposed on Today, tracked on Progress. Both read
// the same HabitView from the server, so they can't disagree.

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="mt-3 text-sm text-[var(--gm-error-text)]">
      {error}
    </p>
  ) : null;
}

function Marks({ marks, total }: { marks: boolean[]; total?: number }) {
  const slots = Math.max(marks.length, total ?? 0);
  return (
    <span className="flex flex-wrap gap-1.5" aria-hidden="true">
      {Array.from({ length: slots }, (_, i) => {
        const m = marks[i];
        return m ? (
          <span key={i} className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--gm-accent)] text-[var(--gm-on-accent)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M5 12l5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        ) : (
          <span key={i} className="h-6 w-6 rounded-full border-2 border-[var(--gm-text-muted)]" />
        );
      })}
    </span>
  );
}

/** Picking a habit: the idea, then "I'll try this" or "Something easier". */
function Chooser({
  option,
  actions,
  onDone,
}: {
  option: HabitOption;
  actions?: GuidanceActions;
  onDone?: () => void;
}) {
  const [variant, setVariant] = useState<HabitVariant>("standard");
  const { run, pending, error } = useGuidanceAction();
  return (
    <>
      <h2 className="mt-2 text-xl font-bold tracking-tight text-[var(--gm-text)] sm:text-3xl">{option.title}</h2>
      <p className="mt-2 text-[var(--gm-text)] sm:text-lg">{option.change[variant]}</p>
      <p className="mt-1 text-sm italic text-[var(--gm-text-secondary)]">
        {option.evidence.observation ? `Why: ${option.evidence.observation} ` : ""}
        {option.reason}
      </p>
      {actions && (
        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => actions.chooseHabit({ key: option.key, variant }), onDone)}
            className={primaryAction}
          >
            I&apos;ll try this
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setVariant((v) => (v === "standard" ? "easier" : "standard"))}
            className={quietButton}
          >
            {variant === "standard" ? "Something easier" : "Back to the first idea"}
          </button>
        </div>
      )}
      <ErrorLine error={error} />
    </>
  );
}

export function HabitTodayCard({ habit, actions }: { habit: HabitView; actions?: GuidanceActions }) {
  const [changing, setChanging] = useState(false);
  const current = habit.current;
  const proposal = habit.options[0];

  let body;
  if (current && !changing) {
    const p = current.progress;
    body = (
      <>
        <h2 className="mt-2 text-xl font-bold tracking-tight text-[var(--gm-text)] sm:text-3xl">{current.title}</h2>
        <p className="mt-2 text-[var(--gm-text)] sm:text-lg">{current.change[current.variant]}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Marks marks={p.marks} />
          <span className="text-sm text-[var(--gm-text-secondary)]">
            {p.eligible === 0 ? `No ${p.noun} logged yet this week` : `${p.successes} of ${p.eligible} ${p.noun} so far`}
          </span>
        </div>
        {actions && habit.options.length > 0 && (
          <button type="button" onClick={() => setChanging(true)} className={`mt-4 ${quietButton}`}>
            Change this week&apos;s habit
          </button>
        )}
      </>
    );
  } else if (proposal) {
    body = <Chooser option={changing ? (habit.options.find((o) => o.key !== current?.key) ?? proposal) : proposal} actions={actions} onDone={() => setChanging(false)} />;
  } else {
    body = (
      <>
        <h2 className="mt-2 text-xl font-bold tracking-tight text-[var(--gm-text)]">No change suggested this week</h2>
        <p className="mt-2 text-[var(--gm-text-secondary)]">
          The meals logged before this week don&apos;t point to one clear change. Keep logging, and a habit will be suggested when one
          stands out.
        </p>
      </>
    );
  }

  return (
    <section className={`${card} lg:col-start-1`} aria-label="One change this week">
      <p className={`${eyebrow} text-[var(--gm-accent-text)]`}>One change this week</p>
      {body}
    </section>
  );
}

export function HabitProgressCard({
  habit,
  viewer,
  actions,
}: {
  habit: HabitView;
  viewer: GuidanceViewer;
  actions?: GuidanceActions;
}) {
  const [adjusting, setAdjusting] = useState(false);
  const { run, pending, error } = useGuidanceAction();
  const current = habit.current;

  if (!current || adjusting) {
    const option = adjusting ? (habit.options.find((o) => o.key !== current?.key) ?? habit.options[0]) : habit.options[0];
    return (
      <section className={card} aria-label="Weekly habit">
        <p className={`${eyebrow} text-[var(--gm-text-secondary)]`}>{viewer.kind === "self" ? "Your" : `${viewer.name}'s`} weekly habit</p>
        {option ? (
          <Chooser option={option} actions={actions} onDone={() => setAdjusting(false)} />
        ) : (
          <p className="mt-2 text-[var(--gm-text-secondary)]">No habit chosen this week, and no clear change to suggest yet.</p>
        )}
        {adjusting && (
          <button type="button" onClick={() => setAdjusting(false)} className={`mt-3 ${quietButton}`}>
            Keep {current?.shortTitle.toLowerCase()}
          </button>
        )}
      </section>
    );
  }

  const p = current.progress;
  const ratio = p.eligible === 0 ? 0 : p.successes / p.eligible;
  const next =
    p.eligible === 0
      ? `Log ${p.noun} this week to see how it's going.`
      : ratio >= 0.7
        ? "Keep the same habit next week, or choose a new one."
        : "Keep going with the same habit next week.";
  return (
    <section className={card} aria-label="Weekly habit">
      <p className={`${eyebrow} text-[var(--gm-text-secondary)]`}>{viewer.kind === "self" ? "Your" : `${viewer.name}'s`} weekly habit</p>
      <h2 className="mt-2 text-xl font-bold tracking-tight text-[var(--gm-text)] sm:text-2xl">{current.shortTitle}</h2>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-3xl font-bold tabular-nums text-[var(--gm-text)]">
            {p.successes} of {p.eligible}
          </p>
          <p className="text-sm text-[var(--gm-text-secondary)]">
            logged {p.noun} {current.key === "log_every_meal" ? "had every meal logged" : "included the planned change"}
          </p>
        </div>
        <Marks marks={p.marks} />
      </div>
      {p.unclear > 0 && (
        <p className="mt-2 text-xs text-[var(--gm-text-muted)]">
          {p.unclear} more {p.unclear === 1 ? "wasn't" : "weren't"} counted: the estimate needed to check {p.unclear === 1 ? "it is" : "them is"} missing.
        </p>
      )}
      <p className="mt-4 text-[var(--gm-text)]">{current.keptForNextWeek ? "Kept for next week." : next}</p>
      {actions && !current.keptForNextWeek && (
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
          <button type="button" disabled={pending} onClick={() => run(() => actions.chooseHabit({ when: "next_week" }))} className={primaryAction}>
            Keep this habit
          </button>
          {habit.options.some((o) => o.key !== current.key) && (
            <button type="button" onClick={() => setAdjusting(true)} className={quietButton}>
              Adjust
            </button>
          )}
        </div>
      )}
      <ErrorLine error={error} />
    </section>
  );
}
