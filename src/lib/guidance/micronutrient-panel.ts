import type { SupabaseClient } from "@supabase/supabase-js";

import type { MicronutrientAssessment, NextStep } from "@/lib/nutrients/assessment";
import { NUTRIENTS, type MicroKey } from "@/lib/nutrients/catalog";
import type { HouseholdFacts } from "@/lib/nutrients/facts";
import { micronutrientsEnabled } from "@/lib/nutrients/flags";
import { COMPOSITION_SOURCES } from "@/lib/nutrients/sources";
import { loadSupplements } from "@/lib/nutrients/store";
import { loadMicronutrientPeriod, type MicronutrientPerson } from "@/lib/nutrients/view";

import { periodFor, type DaySummary, type PeriodKind } from "./aggregation";
import type { GuidanceContactType } from "./authorization";
import type { MicronutrientPriority } from "./suggestions";

// The Progress tab's vitamins and minerals, for both periods its toggle
// offers, so switching week and month needs no round trip. Day statuses
// come from the same summaries as every other Progress card (aggregation.ts,
// including confirmed skipped meals), so a day can't be "complete" for
// protein and "partial" for calcium.
//
// With GUIDANCE_MICRONUTRIENTS_ENABLED off this returns null and reads
// nothing: the card then says vitamins and minerals aren't estimated yet.

export interface MicronutrientPeriodView {
  start: string;
  end: string;
  assessments: MicronutrientAssessment[];
  concerns: MicronutrientAssessment[];
}

export interface SupplementView {
  id: string;
  name: string;
  brand: string | null;
  /** Per dose, canonical units, as the label was entered. */
  perDose: Array<{ key: MicroKey; label: string; amount: number; unit: string }>;
  takenToday: boolean;
}

export interface MicronutrientPanel {
  periods: Record<PeriodKind, MicronutrientPeriodView>;
  /** The one question most worth asking next, if any. */
  clarification: Extract<NextStep, { kind: "clarify" }> | null;
  edition: { id: string; name: string; version: string; reviewStatus: string; urls: string[] };
  household: HouseholdFacts;
  supplements: SupplementView[];
  /** The food-composition sources estimates come from, by name and version. */
  datasets: string[];
}

export async function loadMicronutrientPanel(
  db: SupabaseClient,
  params: {
    contactType: GuidanceContactType;
    contactId: string;
    today: string;
    timezone: string;
    person: MicronutrientPerson;
    expectedMealsPerDay: number;
    summaries: DaySummary[];
  }
): Promise<MicronutrientPanel | null> {
  if (!micronutrientsEnabled()) return null;
  const statusByDate = new Map(params.summaries.map((d) => [d.date, d.status]));
  const load = (kind: PeriodKind) => {
    const p = periodFor(kind, params.today);
    return loadMicronutrientPeriod(db, {
      contactType: params.contactType,
      contactId: params.contactId,
      start: p.start,
      end: params.today,
      previous: p.previous,
      timezone: params.timezone,
      today: params.today,
      person: params.person,
      expectedMealsPerDay: params.expectedMealsPerDay,
      loggingStatus: (date) => statusByDate.get(date) ?? null,
    });
  };
  const subject = { contactType: params.contactType, contactId: params.contactId };
  const [week, month, supplements] = await Promise.all([
    load("week"),
    load("month"),
    loadSupplements(db, subject, { start: params.today, end: params.today }),
  ]);
  if (!week.enabled || !month.enabled) return null;

  const active = supplements.schedules.filter((s) => s.effectiveFrom <= params.today && (!s.effectiveTo || s.effectiveTo > params.today));
  return {
    periods: {
      week: { ...week.period, assessments: week.assessments, concerns: week.concerns },
      month: { ...month.period, assessments: month.assessments, concerns: month.concerns },
    },
    clarification: week.clarification ?? month.clarification,
    edition: week.edition,
    household: week.household,
    supplements: active.map((s) => ({
      id: s.id,
      name: s.name,
      brand: s.brand,
      perDose: (Object.entries(s.nutrientsPerDose) as Array<[MicroKey, number]>)
        .filter(([k]) => NUTRIENTS[k]?.kind === "micro")
        .map(([k, amount]) => ({ key: k, label: NUTRIENTS[k].label, amount, unit: NUTRIENTS[k].unitLabel })),
      takenToday: supplements.doses.some((d) => d.scheduleId === s.id && d.takenOn === params.today),
    })),
    datasets: COMPOSITION_SOURCES.map((f) => `${f.source.name} (${f.version})`),
  };
}

/**
 * The gap the next-meal suggestion should lean towards, if any: this week's
 * top concern when it's about intake (no meaningful source found, or a real
 * average below the reference, or a configured "likely low"), never a
 * clarification or an upper limit, and only with a reference to size it
 * against.
 */
export function suggestionPriority(panel: MicronutrientPanel | null): MicronutrientPriority | null {
  const top = panel?.periods.week.concerns.find(
    (c) =>
      (c.status === "no_reliable_source" || c.status === "likely_low" || (c.status === "below_reference" && !c.food.isFloor)) &&
      c.reference != null &&
      c.reference.amount > 0
  );
  return top && top.reference ? { nutrient: top.nutrient, reference: top.reference.amount } : null;
}
