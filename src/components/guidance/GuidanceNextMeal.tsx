"use client";

import { useState } from "react";

import type { GuidanceActions } from "@/lib/guidance/bound-actions";
import type { NextMealView } from "@/lib/guidance/next-steps";
import type { MealSuggestion } from "@/lib/guidance/suggestions";

import { useGuidanceAction } from "./use-guidance-action";
import { estimate, fmt } from "./ui";

// The inside of the next-meal card: a plan if one's made, otherwise the
// suggestion with "Plan this meal" and "Show another option". Planning
// never counts as eating; "I had this" logs the planned portions as a meal,
// once, and a photo of the meal does the same job.

const heroButton =
  "inline-flex items-center justify-center rounded-xl bg-[var(--gm-hero-button)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-hero-button)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--gm-hero)] disabled:opacity-60";
const heroLink =
  "text-sm font-semibold text-[var(--gm-hero-accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-hero-accent)] rounded disabled:opacity-60";

/** A plate drawn from the meal's own proportions: decorative, in place of
 * a food photo the product doesn't have. */
function Plate({ suggestion }: { suggestion: MealSuggestion }) {
  const total = suggestion.components.reduce((s, c) => s + c.grams, 0) || 1;
  const colours: Record<string, string> = { protein: "#7B5CE0", dal: "#B79A3E", base: "#EFE6CF", veg: "#4E9A5B", fruit: "#E59A45" };
  // Each wedge starts where the grams before it end.
  const starts = suggestion.components.map((_, i) =>
    suggestion.components.slice(0, i).reduce((a, c) => a + (c.grams / total) * 360, -90)
  );
  const arcs = suggestion.components.map((c, i) => {
    const sweep = (c.grams / total) * 360;
    const start = starts[i];
    const r = 52;
    const toXY = (a: number) => [60 + r * Math.cos((a * Math.PI) / 180), 60 + r * Math.sin((a * Math.PI) / 180)];
    const [x1, y1] = toXY(start);
    const [x2, y2] = toXY(start + sweep - 0.01);
    const large = sweep > 180 ? 1 : 0;
    return <path key={c.id} d={`M60 60 L${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`} fill={colours[c.role] ?? "#ccc"} />;
  });
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" className="h-28 w-28 shrink-0 drop-shadow-sm sm:h-36 sm:w-36">
      <circle cx="60" cy="60" r="58" fill="#FFFFFF" />
      {arcs}
      <circle cx="60" cy="60" r="58" fill="none" stroke="rgba(28,21,48,0.12)" strokeWidth="2" />
    </svg>
  );
}

function SuggestionBody({ suggestion }: { suggestion: MealSuggestion }) {
  const e = suggestion.estimate;
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h3 className="text-lg font-bold sm:text-2xl">{suggestion.title}</h3>
        <ul className="mt-1 space-y-0.5 text-[var(--gm-hero-text)] sm:text-lg">
          {suggestion.components.map((c) => (
            <li key={c.id}>{c.portion}</li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-[var(--gm-hero-text-secondary)]">
          About{" "}
          {[
            e.protein != null && `${fmt(e.protein)} g protein`,
            e.calories != null && `${estimate(e.calories, "calories")} kcal`,
            e.fiber != null && `${fmt(e.fiber)} g fibre`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="mt-1 text-sm italic text-[var(--gm-hero-text-muted)]">
          Portions are a guide, sized to what&apos;s left today. Estimates from{" "}
          {[...new Set(suggestion.components.map((c) => c.source.dataset))].join(", ")}.
        </p>
      </div>
      <div className="hidden sm:block">
        <Plate suggestion={suggestion} />
      </div>
    </div>
  );
}

export function GuidanceNextMeal({ nextMeal, actions }: { nextMeal: NextMealView; actions?: GuidanceActions }) {
  const [index, setIndex] = useState(0);
  const [changing, setChanging] = useState(false);
  const { run, pending, error } = useGuidanceAction();
  const result = nextMeal.suggestions;
  const plan = nextMeal.plan;

  const notes = result.notes.length > 0 && (
    <ul className="mt-3 space-y-1 text-xs text-[var(--gm-hero-text-secondary)]">
      {result.notes.map((n) => (
        <li key={n}>{n}</li>
      ))}
    </ul>
  );
  const errorLine = error && (
    <p role="alert" className="mt-3 text-sm font-medium text-[#8A1C1C]">
      {error}
    </p>
  );

  if (plan && !changing) {
    return (
      <div className="mt-5">
        <p className="mb-2 inline-flex rounded-full bg-[var(--gm-hero-button)] px-2.5 py-0.5 text-xs font-semibold text-white">
          {plan.logged ? "Planned · logged" : "Planned"}
        </p>
        <SuggestionBody suggestion={plan.suggestion} />
        {plan.logged ? (
          <p className="mt-4 border-t border-[var(--gm-hero-border)] pt-3 text-sm text-[var(--gm-hero-text-secondary)]">
            This meal is logged. The logged meal is what counts; the plan isn&apos;t added again.
          </p>
        ) : (
          actions && (
            <>
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
                {!nextMeal.isTomorrow && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => actions.confirmPlannedMeal(plan.id))}
                    className={heroButton}
                  >
                    I had this
                  </button>
                )}
                <button type="button" disabled={pending} onClick={() => setChanging(true)} className={heroLink}>
                  Change
                </button>
                <button type="button" disabled={pending} onClick={() => run(() => actions.cancelPlan(plan.id))} className={heroLink}>
                  Remove plan
                </button>
              </div>
              <p className="mt-4 border-t border-[var(--gm-hero-border)] pt-3 text-sm text-[var(--gm-hero-text-secondary)]">
                A plan isn&apos;t counted. &ldquo;I had this&rdquo; logs these portions, or send a photo of what you eat.
              </p>
            </>
          )
        )}
        {errorLine}
      </div>
    );
  }

  if (result.kind === "fallback") {
    return (
      <div className="mt-5">
        <p className="text-[var(--gm-hero-text-secondary)]">{result.message}</p>
        {notes}
      </div>
    );
  }

  const options = result.options;
  const current = options[index % options.length];
  return (
    <div className="mt-5">
      <SuggestionBody suggestion={current} />
      {actions && (
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => actions.planMeal(current.id), () => setChanging(false))}
            className={heroButton}
          >
            {plan ? "Plan this instead" : "Plan this meal"}
          </button>
          {options.length > 1 && (
            <button type="button" disabled={pending} onClick={() => setIndex((i) => i + 1)} className={heroLink}>
              Show another option
            </button>
          )}
          {plan && (
            <button type="button" onClick={() => setChanging(false)} className={heroLink}>
              Keep the plan
            </button>
          )}
        </div>
      )}
      {errorLine}
      {notes}
      <p className="mt-5 border-t border-[var(--gm-hero-border)] pt-3 text-sm text-[var(--gm-hero-text-secondary)]">
        Plan first. Confirm what you eat later.
      </p>
    </div>
  );
}
