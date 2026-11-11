"use server";

import { createServiceClient } from "@/lib/supabase/server";
import {
  adjustTargets,
  confirmActivation,
  proposeActivation,
  returnToTracking,
  type AdjustResult,
  type ConfirmResult,
  type DeactivateResult,
  type ProposalResult,
} from "@/lib/guidance/activation";
import {
  cancelPlan,
  confirmPlannedMeal,
  MAIN_SLOTS,
  planMeal,
  setMealSkipped,
  type DailyActionResult,
  type MealSlot,
} from "@/lib/guidance/day-plan";
import { chooseHabit, type HabitActionResult, type HabitKey } from "@/lib/guidance/habits";
import {
  addSupplement,
  answerHouseholdFact,
  confirmProductBrand,
  setSupplementTaken,
  stopSupplement,
  type SupplementInput,
} from "@/lib/guidance/micronutrient-actions";
import { MICRO_KEYS, type InputUnit, type MicroKey } from "@/lib/nutrients/catalog";
import { HOUSEHOLD_FACT_KEYS, type FactAnswer, type HouseholdFactKey } from "@/lib/nutrients/facts";
import { resolveGuidanceActor, type GuidanceSurface } from "@/lib/guidance/request-actor";
import { loadGuidanceDashboard } from "@/lib/guidance/view";
import { parseSetupAnswers } from "@/lib/guidance/setup-answers";

// The Guidance setup flow's three writes. Each one resolves the actor from
// the request's own credential and hands it to activation.ts, which checks
// permission and the release gate again on every call — so these stay thin
// on purpose. Anything that decides who may do what belongs in
// authorization.ts, where it is tested on its own.
//
// The service client is needed because every Guidance table is RLS-locked
// with no policies (migration 0068): the screening answers in particular
// must not be selectable through a caregiver's own session.

const NOT_SIGNED_IN = {
  ok: false,
  kind: "forbidden",
  reason: "not_signed_in",
  message: "Your session has ended. Please sign in again.",
} as const;

/** Screens and computes, and shows the result. Switches nothing on. */
export async function proposeGuidanceAction(
  surface: GuidanceSurface,
  contactId: string,
  answers: unknown
): Promise<ProposalResult> {
  const request = await resolveGuidanceActor(surface);
  if (!request || typeof contactId !== "string") return NOT_SIGNED_IN;
  return proposeActivation(createServiceClient(), { contactId, ...request, answers: parseSetupAnswers(answers) });
}

/** Switches Guidance on. Takes the answers again, never the proposal: the
 * targets are recomputed from them on the server, so the numbers shown at
 * the review step cannot come back altered. */
export async function confirmGuidanceAction(
  surface: GuidanceSurface,
  contactId: string,
  answers: unknown
): Promise<ConfirmResult> {
  const request = await resolveGuidanceActor(surface);
  if (!request || typeof contactId !== "string") return NOT_SIGNED_IN;
  return confirmActivation(createServiceClient(), { contactId, ...request, answers: parseSetupAnswers(answers) });
}

export async function returnToTrackingAction(surface: GuidanceSurface, contactId: string): Promise<DeactivateResult> {
  const request = await resolveGuidanceActor(surface);
  if (!request || typeof contactId !== "string") return NOT_SIGNED_IN;
  return returnToTracking(createServiceClient(), { contactId, ...request });
}

/** A coach sets the client's targets by hand. The numbers arrive from the
 * browser untyped; anything that isn't a number becomes NaN here and fails
 * adjustTargets' bounds check with a message naming the field. */
export async function adjustTargetsAction(
  surface: GuidanceSurface,
  contactId: string,
  targets: unknown,
  note: unknown
): Promise<AdjustResult> {
  const request = await resolveGuidanceActor(surface);
  if (!request || typeof contactId !== "string") return NOT_SIGNED_IN;
  const raw = (targets && typeof targets === "object" ? targets : {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" ? v : Number.NaN);
  return adjustTargets(createServiceClient(), {
    contactId,
    ...request,
    targets: {
      caloriesKcal: num(raw.caloriesKcal),
      proteinG: num(raw.proteinG),
      carbsG: num(raw.carbsG),
      fatG: num(raw.fatG),
      fiberG: num(raw.fiberG),
    },
    note: typeof note === "string" ? note : null,
  });
}

// ─── Day to day: plans, skipped meals, the weekly habit ────────────────────
// Same shape as above: resolve the actor from the request, then hand over.
// day-plan.ts and habits.ts check permission, the release gate and that
// Guidance is on, on every call.

const CHANGED = {
  ok: false,
  kind: "invalid",
  message: "That suggestion has changed since the page loaded. Here are the latest options.",
} as const;

/** Plans one of the options on screen. The browser names the option by id
 * and the server recomputes the options from the same data, so the stored
 * foods, portions and estimates are the engine's, not the request's. */
export async function planMealAction(
  surface: GuidanceSurface,
  contactId: string,
  optionId: unknown
): Promise<DailyActionResult<{ planId: string }>> {
  const request = await resolveGuidanceActor(surface);
  if (!request || typeof contactId !== "string" || typeof optionId !== "string") return NOT_SIGNED_IN;
  const db = createServiceClient();
  const dashboard = await loadGuidanceDashboard(db, { contactId, contactType: request.contactType });
  const next = dashboard?.nextSteps?.nextMeal;
  const option = next?.suggestions.kind === "options" ? next.suggestions.options.find((o) => o.id === optionId) : undefined;
  if (!next || !option) return CHANGED;
  return planMeal(db, { contactId, ...request, date: next.date, suggestion: option });
}

export async function cancelPlanAction(surface: GuidanceSurface, contactId: string, planId: unknown): Promise<DailyActionResult> {
  const request = await resolveGuidanceActor(surface);
  if (!request || typeof contactId !== "string" || typeof planId !== "string") return NOT_SIGNED_IN;
  return cancelPlan(createServiceClient(), { contactId, ...request, planId });
}

/** "I had this": logs the planned meal from its planned portions. */
export async function confirmPlannedMealAction(
  surface: GuidanceSurface,
  contactId: string,
  planId: unknown
): Promise<DailyActionResult<{ mealLogId: string }>> {
  const request = await resolveGuidanceActor(surface);
  if (!request || typeof contactId !== "string" || typeof planId !== "string") return NOT_SIGNED_IN;
  return confirmPlannedMeal(createServiceClient(), { contactId, ...request, planId });
}

export async function setMealSkippedAction(
  surface: GuidanceSurface,
  contactId: string,
  input: unknown
): Promise<DailyActionResult> {
  const request = await resolveGuidanceActor(surface);
  if (!request || typeof contactId !== "string") return NOT_SIGNED_IN;
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const slot = MAIN_SLOTS.find((s) => s === raw.slot) as MealSlot | undefined;
  if (!slot || typeof raw.date !== "string") return { ok: false, kind: "invalid", message: "Choose breakfast, lunch or dinner." };
  return setMealSkipped(createServiceClient(), { contactId, ...request, date: raw.date, slot, skipped: raw.skipped !== false });
}

/** Chooses this week's habit ("I'll try this", "Something easier",
 * "Adjust"), or keeps this week's for next week ("Keep this habit"). Only
 * a habit the server proposes now, or the one already chosen, can be
 * picked, and the evidence stored is the server's. */
export async function chooseHabitAction(surface: GuidanceSurface, contactId: string, input: unknown): Promise<HabitActionResult> {
  const request = await resolveGuidanceActor(surface);
  if (!request || typeof contactId !== "string") return NOT_SIGNED_IN;
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const db = createServiceClient();
  const dashboard = await loadGuidanceDashboard(db, { contactId, contactType: request.contactType });
  const habit = dashboard?.nextSteps?.habit;
  if (!habit) return { ok: false, kind: "invalid", message: "Guidance isn't on for this person." };
  const variant = raw.variant === "easier" ? "easier" : "standard";
  const nextWeek = new Date(Date.parse(`${habit.weekStart}T12:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);

  if (raw.when === "next_week") {
    if (!habit.current) return { ok: false, kind: "invalid", message: "Choose a habit for this week first." };
    return chooseHabit(db, {
      contactId,
      ...request,
      weekStart: nextWeek,
      key: habit.current.key,
      variant: habit.current.variant,
      evidence: habit.current.evidence,
    });
  }
  const option = habit.options.find((o) => o.key === raw.key) ?? (habit.current?.key === raw.key ? habit.current : undefined);
  if (!option) return { ok: false, kind: "invalid", message: "That habit isn't on offer this week." };
  return chooseHabit(db, {
    contactId,
    ...request,
    weekStart: habit.weekStart,
    key: option.key as HabitKey,
    variant,
    evidence: option.evidence,
  });
}

// ─── Vitamins and minerals: answers and supplements ───────────────────────
// micronutrient-actions.ts checks permission, the release gate and that
// Guidance is on, as day-plan.ts does. These only shape the input.

/** A clarifying question's answer: a household yes/no/not sure, or the brand
 * of a packaged product. */
export async function answerClarificationAction(surface: GuidanceSurface, contactId: string, input: unknown): Promise<DailyActionResult> {
  const request = await resolveGuidanceActor(surface);
  if (!request || typeof contactId !== "string") return NOT_SIGNED_IN;
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const db = createServiceClient();
  if (raw.key === "product_brand") {
    return confirmProductBrand(db, {
      contactId,
      ...request,
      itemName: typeof raw.itemName === "string" ? raw.itemName : "",
      brand: typeof raw.brand === "string" ? raw.brand : "",
    });
  }
  const key = HOUSEHOLD_FACT_KEYS.find((k) => k === raw.key) as HouseholdFactKey | undefined;
  const answer = (["yes", "no", "unsure"] as const).find((a) => a === raw.answer) as FactAnswer | undefined;
  if (!key || !answer) return { ok: false, kind: "invalid", message: "That answer isn't one of the options." };
  return answerHouseholdFact(db, { contactId, ...request, key, answer });
}

const UNITS = new Set<InputUnit>(["mg", "µg", "ug", "mcg", "IU", "µg DFE", "µg RAE", "g"]);

export async function addSupplementAction(
  surface: GuidanceSurface,
  contactId: string,
  input: unknown
): Promise<DailyActionResult<{ scheduleId: string }>> {
  const request = await resolveGuidanceActor(surface);
  if (!request || typeof contactId !== "string") return NOT_SIGNED_IN;
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const nutrients = (Array.isArray(raw.nutrients) ? raw.nutrients : []).slice(0, 12).map((n) => {
    const r = (n && typeof n === "object" ? n : {}) as Record<string, unknown>;
    return {
      key: (MICRO_KEYS.find((k) => k === r.key) ?? "") as MicroKey,
      amount: typeof r.amount === "number" ? r.amount : Number.NaN,
      unit: (UNITS.has(r.unit as InputUnit) ? r.unit : "mg") as InputUnit,
    };
  });
  const supplement: SupplementInput = {
    name: typeof raw.name === "string" ? raw.name : "",
    brand: typeof raw.brand === "string" ? raw.brand : null,
    nutrients,
  };
  return addSupplement(createServiceClient(), { contactId, ...request, supplement });
}

export async function setSupplementTakenAction(surface: GuidanceSurface, contactId: string, input: unknown): Promise<DailyActionResult> {
  const request = await resolveGuidanceActor(surface);
  if (!request || typeof contactId !== "string") return NOT_SIGNED_IN;
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  if (typeof raw.scheduleId !== "string") return { ok: false, kind: "not_found" };
  return setSupplementTaken(createServiceClient(), { contactId, ...request, scheduleId: raw.scheduleId, taken: raw.taken !== false });
}

export async function stopSupplementAction(surface: GuidanceSurface, contactId: string, scheduleId: unknown): Promise<DailyActionResult> {
  const request = await resolveGuidanceActor(surface);
  if (!request || typeof contactId !== "string" || typeof scheduleId !== "string") return NOT_SIGNED_IN;
  return stopSupplement(createServiceClient(), { contactId, ...request, scheduleId });
}
