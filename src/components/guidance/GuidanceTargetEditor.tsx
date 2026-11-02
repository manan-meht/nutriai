"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { AdjustResult } from "@/lib/guidance/activation";
import type { ProposedTargets } from "@/lib/guidance/policy";
import type { TargetAdjustView } from "@/lib/guidance/view";

// The coach's target editor. The policy's numbers are where a coach starts;
// the coach knows the client and tunes from there. Each field shows the
// recommendation beside it, the macros' calories are added up as a check,
// and Reset puts the recommendation back. The server enforces the bounds
// (ADJUSTMENT_BOUNDS) and records the change as the coach's; this only
// helps the coach get it right first time.

const FIELDS: Array<{ key: keyof ProposedTargets; label: string; unit: string; step: number }> = [
  { key: "caloriesKcal", label: "Calories", unit: "kcal", step: 10 },
  { key: "proteinG", label: "Protein", unit: "g", step: 1 },
  { key: "carbsG", label: "Carbs", unit: "g", step: 1 },
  { key: "fatG", label: "Fat", unit: "g", step: 1 },
  { key: "fiberG", label: "Fiber", unit: "g", step: 1 },
];

const fmt = (n: number) => n.toLocaleString("en-US");
const input =
  "w-full rounded-xl border border-[var(--gm-border-strong)] bg-[var(--gm-raised)] px-3 py-2.5 text-sm text-[var(--gm-text)] tabular-nums outline-none focus:border-[var(--gm-accent)] focus:ring-2 focus:ring-[var(--gm-accent-soft)] transition";

type FormValues = Record<keyof ProposedTargets, string>;
const toForm = (t: ProposedTargets): FormValues =>
  Object.fromEntries(FIELDS.map(({ key }) => [key, String(t[key])])) as FormValues;

export function GuidanceTargetEditor({
  personName,
  adjust,
  onAdjust,
}: {
  personName: string;
  adjust: TargetAdjustView;
  onAdjust: (targets: unknown, note: unknown) => Promise<AdjustResult>;
}) {
  const router = useRouter();
  const [values, setValues] = useState<FormValues>(() => toForm(adjust.current));
  const [note, setNote] = useState(adjust.note ?? "");
  const [error, setError] = useState<{ field?: keyof ProposedTargets; message: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const numbers = Object.fromEntries(FIELDS.map(({ key }) => [key, Number(values[key])])) as unknown as ProposedTargets;
  const macroKcal = Math.round(numbers.proteinG * 4 + numbers.carbsG * 4 + numbers.fatG * 9);
  const macroGap = Number.isFinite(macroKcal) && numbers.caloriesKcal > 0 ? macroKcal - numbers.caloriesKcal : 0;
  const unchanged = FIELDS.every(({ key }) => numbers[key] === adjust.current[key]) && note === (adjust.note ?? "");

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        const result = await onAdjust(numbers, note);
        if (result.ok) {
          setSaved(true);
          router.refresh();
        } else if (result.kind === "invalid") {
          setError({ field: result.field, message: result.message });
        } else {
          setError({
            message: result.kind === "forbidden" || result.kind === "unavailable" || result.kind === "write_failed" ? result.message : "Something went wrong. Please try again.",
          });
        }
      } catch {
        setError({ message: "Something went wrong. Please try again." });
      }
    });
  }

  return (
    <form onSubmit={save} className="bg-[var(--gm-card)] border border-[var(--gm-border)] rounded-2xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--gm-text)]">{personName}&apos;s targets</h2>
          <p className="text-sm text-[var(--gm-text-secondary)] mt-1">
            Start from the recommendation and tune it to what you know about {personName}. Changes apply from today.
          </p>
        </div>
        {adjust.isAdjusted && (
          <span className="shrink-0 rounded-full border border-[var(--gm-accent-border)] bg-[var(--gm-accent-soft)] px-2.5 py-0.5 text-xs font-medium text-[var(--gm-accent-text)]">
            Adjusted by you
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {FIELDS.map(({ key, label, unit, step }) => (
          <div key={key} className={key === "caloriesKcal" ? "col-span-2 sm:col-span-1" : ""}>
            <label htmlFor={`target-${key}`} className="block text-xs text-[var(--gm-text-secondary)] mb-1">
              {label} ({unit})
            </label>
            <input
              id={`target-${key}`}
              className={`${input} ${error?.field === key ? "border-[var(--gm-error-text)]" : ""}`}
              type="number"
              inputMode="numeric"
              step={step}
              required
              value={values[key]}
              onChange={(e) => {
                setValues({ ...values, [key]: e.target.value });
                setSaved(false);
              }}
              aria-invalid={error?.field === key}
            />
            <p className="mt-1 text-xs text-[var(--gm-text-muted)] tabular-nums">Recommended {fmt(adjust.recommended[key])}</p>
          </div>
        ))}
      </div>

      <p className={`text-xs tabular-nums ${Math.abs(macroGap) > numbers.caloriesKcal * 0.1 ? "text-[var(--gm-over-text)]" : "text-[var(--gm-text-muted)]"}`}>
        Protein, carbs and fat add up to {fmt(macroKcal)} kcal
        {macroGap === 0 ? "." : `, ${fmt(Math.abs(macroGap))} kcal ${macroGap > 0 ? "above" : "below"} the calorie target.`}
      </p>

      <div>
        <label htmlFor="target-note" className="block text-xs text-[var(--gm-text-secondary)] mb-1">
          Note for your records (optional)
        </label>
        <textarea
          id="target-note"
          className={input}
          rows={2}
          maxLength={500}
          placeholder="Why these numbers, e.g. cutting phase before competition"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-[var(--gm-error-text)]">
          {error.message}
        </p>
      )}
      {saved && !error && <p className="text-sm text-[var(--gm-accent-text)]">Targets saved.</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending || unchanged}
          className="flex-1 rounded-xl bg-[var(--gm-accent)] hover:bg-[var(--gm-accent-hover)] text-[var(--gm-on-accent)] font-semibold py-3 text-sm disabled:opacity-50 transition"
        >
          {pending ? "Saving…" : "Save targets"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setValues(toForm(adjust.recommended));
            setError(null);
            setSaved(false);
          }}
          className="rounded-xl border border-[var(--gm-border-strong)] px-4 py-3 text-sm font-medium text-[var(--gm-text-secondary)] hover:bg-white/5 hover:text-[var(--gm-text)] disabled:opacity-50 transition"
        >
          Reset to recommended
        </button>
      </div>
    </form>
  );
}
