"use client";

import { useState } from "react";

import type { PeriodKind } from "@/lib/guidance/aggregation";
import type { GuidanceActions } from "@/lib/guidance/bound-actions";
import type { MicronutrientPanel, SupplementView } from "@/lib/guidance/micronutrient-panel";
import type { AssessmentStatus, MicronutrientAssessment, NextStep } from "@/lib/nutrients/assessment";

import { useGuidanceAction } from "./use-guidance-action";
import { MICRO_KEYS, NUTRIENTS, type MicroKey } from "@/lib/nutrients/catalog";

import { card, Chevron, eyebrow, primaryAction, quietButton, rangeText, type GuidanceViewer } from "./ui";

// Vitamins and minerals on the Progress tab: the one or two concerns worth
// acting on, each with its evidence and one next step, and the full list
// behind "All vitamins & minerals". Every figure is an estimate from logged
// meals against a pinned reference edition; unknown stays "Unknown", never
// 0 and never an empty bar. No status here is a diagnosis.

export const STATUS_TEXT: Record<AssessmentStatus, string> = {
  within_range: "Within estimated target range",
  likely_low: "Likely low intake",
  no_reliable_source: "No reliable source identified",
  not_enough_information: "Not enough information",
  below_reference: "Below the reference",
  above_upper_limit: "Above the upper limit",
};

function StatusChip({ status }: { status: AssessmentStatus }) {
  const tone =
    status === "above_upper_limit"
      ? "border-[var(--gm-over-border)] bg-[var(--gm-over-soft)] text-[var(--gm-over-text)]"
      : status === "within_range"
        ? "border-[var(--gm-accent-border)] text-[var(--gm-accent-text)]"
        : "border-[var(--gm-border-strong)] text-[var(--gm-text-secondary)]";
  return <span className={`inline-flex shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone}`}>{STATUS_TEXT[status]}</span>;
}

const amountText = (n: number | null, unit: string, floor = false) =>
  n == null ? "Unknown" : `${floor ? "at least " : ""}${n >= 100 ? Math.round(n / 5) * 5 : n >= 10 ? Math.round(n) : Math.round(n * 10) / 10} ${unit}`;

function ClarifyStep({ step, actions }: { step: Extract<NextStep, { kind: "clarify" }>; actions?: GuidanceActions }) {
  const { run, pending, error } = useGuidanceAction();
  const [brand, setBrand] = useState("");
  if (!actions) return <p className="text-[var(--gm-text)]">{step.question}</p>;
  return (
    <div>
      <p className="text-[var(--gm-text)]">{step.question}</p>
      {step.key === "product_brand" ? (
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (brand.trim()) run(() => actions.answerClarification({ key: step.key, itemName: step.itemName ?? "", brand: brand.trim() }));
          }}
        >
          <label className="sr-only" htmlFor="brand-input">
            Brand of {step.itemName}
          </label>
          <input
            id="brand-input"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="Brand name"
            className="min-w-0 flex-1 rounded-xl border border-[var(--gm-border-strong)] bg-[var(--gm-raised)] px-3 py-2 text-sm text-[var(--gm-text)] placeholder:text-[var(--gm-text-muted)]"
          />
          <button type="submit" disabled={pending || !brand.trim()} className={primaryAction}>
            Save
          </button>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {(["yes", "no", "unsure"] as const).map((answer) => (
            <button
              key={answer}
              type="button"
              disabled={pending}
              onClick={() => run(() => actions.answerClarification({ key: step.key, answer }))}
              className="rounded-xl border border-[var(--gm-border-strong)] px-4 py-2 text-sm font-medium text-[var(--gm-text)] hover:bg-[var(--gm-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)] disabled:opacity-60"
            >
              {answer === "yes" ? "Yes" : answer === "no" ? "No" : "Not sure"}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-[var(--gm-error-text)]">
          {error}
        </p>
      )}
    </div>
  );
}

function StepView({ step, actions }: { step: NextStep; actions?: GuidanceActions }) {
  switch (step.kind) {
    case "clarify":
      return <ClarifyStep step={step} actions={actions} />;
    case "food":
      return (
        <div>
          <p className="text-[var(--gm-text)]">{step.text}</p>
          {step.foods.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {step.foods.map((f) => (
                <li key={f.key} className="rounded-full bg-[var(--gm-raised)] px-3 py-1 text-sm text-[var(--gm-text-secondary)]">
                  {f.label}
                  {f.portion ? ` · ${f.portion}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    case "log":
    case "profile":
      return <p className="text-[var(--gm-text)]">{step.text}</p>;
    case "none":
      return null;
  }
}

function Concern({ a, actions }: { a: MicronutrientAssessment; actions?: GuidanceActions }) {
  const [why, setWhy] = useState(false);
  return (
    <article className="border-t border-[var(--gm-border)] pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-[var(--gm-text)]">{a.label}</h3>
        <StatusChip status={a.status} />
      </div>
      <p className="mt-1 text-[var(--gm-text-secondary)]">{a.observation}</p>
      <p className="mt-1 text-xs text-[var(--gm-text-muted)]">
        {a.days.documented} of {a.days.total} days documented · {rangeText(a.period.start, a.period.end)}
      </p>
      <div className="mt-3">
        <StepView step={a.nextStep} actions={actions} />
      </div>
      <button type="button" aria-expanded={why} onClick={() => setWhy((w) => !w)} className={`mt-3 ${quietButton}`}>
        {why ? "Hide the explanation" : "Why this?"}
      </button>
      {why && <p className="mt-2 text-sm text-[var(--gm-text-secondary)]">{a.explanation}</p>}
    </article>
  );
}

const UNIT_CHOICES: Record<string, string[]> = { mg: ["mg", "µg"], "µg": ["µg", "mg", "IU"] };
const unitChoices = (key: MicroKey) => (key === "vitamin_d" ? ["µg", "IU"] : (UNIT_CHOICES[NUTRIENTS[key].unit] ?? [NUTRIENTS[key].unit]));

/** Supplements: what someone takes, and today's dose marked as taken. A
 * supplement on the list is never counted; only a dose marked taken is, and
 * it's shown apart from food. */
function Supplements({ supplements, actions }: { supplements: SupplementView[]; actions?: GuidanceActions }) {
  const { run, pending, error } = useGuidanceAction();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [rows, setRows] = useState<Array<{ key: MicroKey; amount: string; unit: string }>>([{ key: "vitamin_d", amount: "", unit: "µg" }]);
  if (!actions && supplements.length === 0) return null;
  const field =
    "rounded-xl border border-[var(--gm-border-strong)] bg-[var(--gm-raised)] px-3 py-2 text-sm text-[var(--gm-text)] placeholder:text-[var(--gm-text-muted)]";

  return (
    <div className="mt-5 border-t border-[var(--gm-border)] pt-4">
      <h3 className="font-semibold text-[var(--gm-text)]">Supplements</h3>
      <p className="mt-1 text-xs text-[var(--gm-text-muted)]">Only a dose marked as taken counts, and it&apos;s kept apart from food.</p>
      {supplements.length > 0 && (
        <ul className="mt-3 space-y-2">
          {supplements.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--gm-raised)] px-4 py-3">
              <span className="min-w-0">
                <span className="block text-sm font-medium text-[var(--gm-text)]">
                  {s.name}
                  {s.brand ? <span className="font-normal text-[var(--gm-text-secondary)]"> · {s.brand}</span> : null}
                </span>
                <span className="block text-xs text-[var(--gm-text-secondary)]">
                  {s.perDose.map((n) => `${n.label} ${n.amount} ${n.unit}`).join(", ")} a dose
                </span>
              </span>
              {actions && (
                <span className="flex items-center gap-4">
                  <button
                    type="button"
                    aria-pressed={s.takenToday}
                    disabled={pending}
                    onClick={() => run(() => actions.setSupplementTaken({ scheduleId: s.id, taken: !s.takenToday }))}
                    className={s.takenToday ? quietButton : primaryAction}
                  >
                    {s.takenToday ? "Taken today · undo" : "Taken today"}
                  </button>
                  <button type="button" disabled={pending} onClick={() => run(() => actions.stopSupplement(s.id))} className={quietButton}>
                    Stop
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {actions && !adding && (
        <button type="button" onClick={() => setAdding(true)} className={`mt-3 ${quietButton}`}>
          + Add a supplement
        </button>
      )}
      {actions && adding && (
        <form
          className="mt-3 space-y-3 rounded-xl border border-[var(--gm-border)] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () =>
                actions.addSupplement({
                  name,
                  brand,
                  nutrients: rows.filter((r) => r.amount.trim()).map((r) => ({ key: r.key, amount: Number(r.amount), unit: r.unit })),
                }),
              () => {
                setAdding(false);
                setName("");
                setBrand("");
                setRows([{ key: "vitamin_d", amount: "", unit: "µg" }]);
              }
            );
          }}
        >
          <p className="text-sm text-[var(--gm-text-secondary)]">Copy the amounts per dose from the label.</p>
          <div className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="supp-name">Name</label>
            <input id="supp-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Vitamin D3" className={`min-w-0 flex-1 ${field}`} />
            <label className="sr-only" htmlFor="supp-brand">Brand</label>
            <input id="supp-brand" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Brand (optional)" className={`min-w-0 flex-1 ${field}`} />
          </div>
          {rows.map((r, i) => (
            <div key={i} className="flex flex-wrap gap-2">
              <label className="sr-only" htmlFor={`supp-key-${i}`}>Vitamin or mineral</label>
              <select
                id={`supp-key-${i}`}
                value={r.key}
                onChange={(e) => {
                  const key = e.target.value as MicroKey;
                  setRows((all) => all.map((x, j) => (j === i ? { ...x, key, unit: unitChoices(key)[0] } : x)));
                }}
                className={field}
              >
                {MICRO_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {NUTRIENTS[k].label}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor={`supp-amount-${i}`}>Amount per dose</label>
              <input
                id={`supp-amount-${i}`}
                inputMode="decimal"
                value={r.amount}
                onChange={(e) => setRows((all) => all.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                placeholder="Amount"
                className={`w-28 ${field}`}
              />
              <label className="sr-only" htmlFor={`supp-unit-${i}`}>Unit</label>
              <select
                id={`supp-unit-${i}`}
                value={r.unit}
                onChange={(e) => setRows((all) => all.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))}
                className={field}
              >
                {unitChoices(r.key).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {rows.length < 8 && (
              <button type="button" onClick={() => setRows((all) => [...all, { key: "calcium", amount: "", unit: "mg" }])} className={quietButton}>
                + Another vitamin or mineral
              </button>
            )}
            <button type="submit" disabled={pending} className={primaryAction}>
              Save supplement
            </button>
            <button type="button" onClick={() => setAdding(false)} className={quietButton}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-[var(--gm-error-text)]">
          {error}
        </p>
      )}
    </div>
  );
}

function trendText(a: MicronutrientAssessment): string {
  if (a.trend.kind === "insufficient") return "Not enough days";
  const d = a.trend.delta;
  if (d === 0) return "Steady";
  return `${d > 0 ? "+" : "−"}${amountText(Math.abs(d), a.unit)}`;
}

function AllTable({ assessments, kind }: { assessments: MicronutrientAssessment[]; kind: PeriodKind }) {
  const last = kind === "week" ? "last week" : "last month";
  return (
    <div className="mt-4">
      {/* A table where there's room; a list on a phone. */}
      <table className="hidden w-full text-left text-sm md:table">
        <caption className="sr-only">Estimated daily vitamin and mineral intake against the reference</caption>
        <thead className="text-xs uppercase tracking-wide text-[var(--gm-text-muted)]">
          <tr>
            <th scope="col" className="py-2 pr-3 font-medium">Nutrient</th>
            <th scope="col" className="py-2 pr-3 font-medium">Food, a day</th>
            <th scope="col" className="py-2 pr-3 font-medium">Supplements</th>
            <th scope="col" className="py-2 pr-3 font-medium">Reference</th>
            <th scope="col" className="py-2 pr-3 font-medium">vs {last}</th>
            <th scope="col" className="py-2 pr-3 font-medium">Status</th>
            <th scope="col" className="py-2 font-medium">Main sources</th>
          </tr>
        </thead>
        <tbody>
          {assessments.map((a) => (
            <tr key={a.nutrient} className="border-t border-[var(--gm-border)] align-top">
              <th scope="row" className="py-3 pr-3 font-medium text-[var(--gm-text)]">
                {a.label}
                <span className="block text-xs font-normal text-[var(--gm-text-muted)]">
                  {a.days.documented} of {a.days.total} days documented
                </span>
              </th>
              <td className="py-3 pr-3 tabular-nums text-[var(--gm-text)]">{amountText(a.food.average, a.unit, a.food.isFloor)}</td>
              <td className="py-3 pr-3 tabular-nums text-[var(--gm-text-secondary)]">
                {a.supplements.average ? amountText(a.supplements.average, a.unit) : "None confirmed"}
              </td>
              <td className="py-3 pr-3 text-[var(--gm-text-secondary)]">
                {a.reference ? `${a.reference.kind} ${amountText(a.reference.amount, a.reference.unit)}` : "No reference"}
                {a.upperLimit && <span className="block text-xs">UL {amountText(a.upperLimit.amount, a.upperLimit.unit)}</span>}
              </td>
              <td className="py-3 pr-3 tabular-nums text-[var(--gm-text-secondary)]">{trendText(a)}</td>
              <td className="py-3 pr-3">
                <StatusChip status={a.status} />
              </td>
              <td className="py-3 text-[var(--gm-text-secondary)]">
                {a.mainSources.length === 0 ? "None recorded" : a.mainSources.slice(0, 3).map((s) => s.label).join(", ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="space-y-3 md:hidden">
        {assessments.map((a) => (
          <li key={a.nutrient} className="rounded-xl bg-[var(--gm-raised)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-[var(--gm-text)]">{a.label}</span>
              <StatusChip status={a.status} />
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              <dt className="text-[var(--gm-text-muted)]">Food, a day</dt>
              <dd className="tabular-nums text-[var(--gm-text)]">{amountText(a.food.average, a.unit, a.food.isFloor)}</dd>
              <dt className="text-[var(--gm-text-muted)]">Supplements</dt>
              <dd className="text-[var(--gm-text-secondary)]">{a.supplements.average ? amountText(a.supplements.average, a.unit) : "None confirmed"}</dd>
              <dt className="text-[var(--gm-text-muted)]">Reference</dt>
              <dd className="text-[var(--gm-text-secondary)]">
                {a.reference ? `${a.reference.kind} ${amountText(a.reference.amount, a.reference.unit)}` : "No reference"}
              </dd>
              <dt className="text-[var(--gm-text-muted)]">vs {last}</dt>
              <dd className="text-[var(--gm-text-secondary)]">{trendText(a)}</dd>
              <dt className="text-[var(--gm-text-muted)]">Documented</dt>
              <dd className="text-[var(--gm-text-secondary)]">
                {a.days.documented} of {a.days.total} days
              </dd>
              <dt className="text-[var(--gm-text-muted)]">Main sources</dt>
              <dd className="text-[var(--gm-text-secondary)]">
                {a.mainSources.length === 0 ? "None recorded" : a.mainSources.slice(0, 3).map((s) => s.label).join(", ")}
              </dd>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MicronutrientCard({
  panel,
  periodKind,
  viewer,
  actions,
}: {
  panel: MicronutrientPanel;
  periodKind: PeriodKind;
  viewer: GuidanceViewer;
  actions?: GuidanceActions;
}) {
  const [all, setAll] = useState(false);
  const period = panel.periods[periodKind];
  const concerns = period.concerns;
  const documented = Math.max(0, ...period.assessments.map((a) => a.days.documented));

  const headline =
    period.assessments.length === 0
      ? "Not estimated yet"
      : concerns.length > 0
        ? concerns.length === 1
          ? "One thing worth a look"
          : "Two things worth a look"
        : documented < 3
          ? "Not enough information yet"
          : "Nothing stands out";

  return (
    <section className={card} aria-labelledby="micros-title">
      <p className={`${eyebrow} text-[var(--gm-text-secondary)]`}>Vitamins &amp; minerals</p>
      <h2 id="micros-title" className="mt-2 text-xl font-bold tracking-tight text-[var(--gm-text)] sm:text-2xl">
        {headline}
      </h2>
      <p className="mt-1 text-sm text-[var(--gm-text-secondary)]">
        From {viewer.kind === "self" ? "your" : `${viewer.name}'s`} logged meals, {rangeText(period.start, period.end)}. Estimates,
        not a diagnosis.
      </p>

      {concerns.length > 0 ? (
        <div className="mt-4 space-y-4">
          {concerns.map((a) => (
            <Concern key={a.nutrient} a={a} actions={actions} />
          ))}
        </div>
      ) : (
        period.assessments.length > 0 && (
          <p className="mt-4 text-[var(--gm-text)]">
            {documented < 3
              ? "Vitamins and minerals need at least 3 fully logged days, with the foods identified, before they're compared with a reference."
              : "No nutrient has a clear gap or an excess on the documented days. That's what the logged meals show, not a measure of what the body has."}
          </p>
        )
      )}

      {panel.clarification &&
        !concerns.some((c) => c.nextStep.kind === "clarify" && c.nextStep.key === panel.clarification!.key) && (
          <div className="mt-5 border-t border-[var(--gm-border)] pt-4">
            <p className={`${eyebrow} text-[var(--gm-text-secondary)]`}>One question that would sharpen this</p>
            <div className="mt-2">
              <ClarifyStep step={panel.clarification} actions={actions} />
            </div>
          </div>
        )}

      {period.assessments.length > 0 && (
        <>
          <button type="button" aria-expanded={all} onClick={() => setAll((o) => !o)} className={`mt-5 ${quietButton}`}>
            All vitamins &amp; minerals <Chevron direction={all ? "up" : "down"} />
          </button>
          {all && <AllTable assessments={period.assessments} kind={periodKind} />}
        </>
      )}

      <Supplements supplements={panel.supplements} actions={actions} />

      {panel.edition && (
        <p className="mt-5 text-xs text-[var(--gm-text-muted)]">
          Reference: {panel.edition.name}
          {panel.edition.reviewStatus !== "reviewed" ? ", not yet reviewed for this product by a health professional" : ""}. Food values:{" "}
          {panel.datasets.join(", ")}. Iodine stays unknown unless a product label says otherwise; salt can&apos;t be seen in a photo.
        </p>
      )}
    </section>
  );
}
