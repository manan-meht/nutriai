import type { SupabaseClient } from "@supabase/supabase-js";

import {
  forbidden,
  getGuidanceState,
  guidanceSubjectColumn,
  loadContactFacts,
  unavailable,
  writeFailed,
  type ActivationFailure,
  type ContactFacts,
} from "./activation";
import { authorizeGuidanceDailyAction, type ActivatedVia, type GuidanceActor, type GuidanceContactType } from "./authorization";
import { localDate } from "./daily-totals";
import { loadReleaseState } from "./release";
import type { MealSuggestion } from "./suggestions";

// Planned meals and confirmed skipped meals (migration 0070).
//
// The rule both follow: neither is intake. Totals come from meal_logs
// alone, so planning a meal never adds to the day, and confirming a skip
// never subtracts from it. What they change is what the day *means*:
//
//   - A plan that a logged meal then fills is shown as logged, and the
//     meal's own estimate is what counts. The plan and the meal are never
//     both counted.
//   - A skipped meal completes the day for averaging (aggregation.ts), where
//     an unlogged one leaves it partial: "I didn't eat lunch" and "nobody
//     logged lunch" are different facts.
//
// "I had this" on a plan records consumption the only way the product
// records it: a meal_logs row, estimated from the plan's foods and portions
// and labelled as such (source 'guidance_plan'), linked from the plan.

import { MAIN_SLOTS, slotOfMealType, type MealSlot } from "./meal-slots";

export { MAIN_SLOTS, MEAL_SLOTS, slotOfMealType, type MealSlot } from "./meal-slots";

export interface PlannedMeal {
  id: string;
  date: string;
  slot: MealSlot;
  suggestion: MealSuggestion;
  /** Set when "I had this" created the meal; otherwise a logged meal in the
   * same slot that day links it (linkPlans). */
  mealLogId: string | null;
  plannedVia: ActivatedVia;
  createdAt: string;
}

export interface SkippedMeal {
  date: string;
  slot: MealSlot;
  confirmedVia: ActivatedVia;
}

export type DailyActionResult<T = unknown> = ({ ok: true } & T) | ActivationFailure | { ok: false; kind: "invalid"; message: string };

const VIA = new Set<ActivatedVia>(["self_account", "end_user_session", "whatsapp", "caregiver", "coach"]);
const via = (v: unknown): ActivatedVia => (VIA.has(v as ActivatedVia) ? (v as ActivatedVia) : "caregiver");

/** Live plans and confirmed skips from `sinceDate` on. Cancelled plans stay
 * in the table for the record and are never returned. */
export async function loadPlansAndSkips(
  db: SupabaseClient,
  contactId: string,
  contactType: GuidanceContactType,
  sinceDate: string
): Promise<{ plans: PlannedMeal[]; skips: SkippedMeal[] }> {
  const column = guidanceSubjectColumn(contactType);
  const [plans, skips] = await Promise.all([
    db
      .from("nutrition_meal_plans")
      .select("id, local_date, meal_slot, suggestion, status, meal_log_id, planned_via, created_at")
      .eq(column, contactId)
      .eq("status", "planned")
      .gte("local_date", sinceDate),
    db.from("nutrition_meal_skips").select("local_date, meal_slot, confirmed_via").eq(column, contactId).gte("local_date", sinceDate),
  ]);
  return {
    plans: ((plans.data ?? []) as Array<Record<string, unknown>>)
      .filter((r) => slotOfMealType(String(r.meal_slot)) && r.suggestion && typeof r.suggestion === "object")
      .map((r) => ({
        id: String(r.id),
        date: String(r.local_date),
        slot: r.meal_slot as MealSlot,
        suggestion: r.suggestion as MealSuggestion,
        mealLogId: typeof r.meal_log_id === "string" ? r.meal_log_id : null,
        plannedVia: via(r.planned_via),
        createdAt: String(r.created_at),
      })),
    skips: ((skips.data ?? []) as Array<Record<string, unknown>>)
      .filter((r) => slotOfMealType(String(r.meal_slot)))
      .map((r) => ({ date: String(r.local_date), slot: r.meal_slot as MealSlot, confirmedVia: via(r.confirmed_via) })),
  };
}

/**
 * Which logged meal filled each plan, if any. A plan "I had this" created a
 * meal for is linked by id. Otherwise the first meal logged in the same
 * slot on the same day fills it, and one meal fills one plan at most.
 * Worked out on every read rather than stored, so a meal that's corrected
 * to another slot, or deleted, unlinks itself.
 */
export function linkPlans<M extends { id: string; loggedAt: string; mealType: string | null }>(
  plans: PlannedMeal[],
  meals: M[],
  timezone: string
): Map<string, M> {
  const links = new Map<string, M>();
  const used = new Set<string>();
  const byId = new Map(meals.map((m) => [m.id, m]));
  for (const p of plans) {
    const m = p.mealLogId ? byId.get(p.mealLogId) : undefined;
    if (m) {
      links.set(p.id, m);
      used.add(m.id);
    }
  }
  const sorted = [...meals].sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
  for (const p of plans) {
    if (links.has(p.id) || p.mealLogId) continue;
    const m = sorted.find(
      (x) => !used.has(x.id) && slotOfMealType(x.mealType) === p.slot && localDate(x.loggedAt, timezone) === p.date
    );
    if (m) {
      links.set(p.id, m);
      used.add(m.id);
    }
  }
  return links;
}

/** The shared front door: the contact exists, the actor may act for them,
 * Guidance is released and switched on for them. Every day-to-day Guidance
 * write goes through it (plans, skips, vitamin and mineral answers,
 * supplements). */
export async function guardDailyAction(
  db: SupabaseClient,
  params: { contactId: string; contactType?: GuidanceContactType; actor: GuidanceActor }
): Promise<{ ok: true; facts: ContactFacts; via: ActivatedVia } | ActivationFailure> {
  const facts = await loadContactFacts(db, params.contactId, params.contactType);
  if (!facts) return { ok: false, kind: "not_found" };
  const auth = authorizeGuidanceDailyAction(params.actor, facts);
  if (!auth.allowed) return forbidden(auth);
  const release = await loadReleaseState(db, facts.caregiverId);
  if (!release.canActivate) return unavailable(release);
  const state = await getGuidanceState(db, facts.contactId, facts.contactType);
  if (state.mode !== "guidance") {
    return { ok: false, kind: "forbidden", reason: "not_in_guidance", message: "Guidance isn't on for this person." };
  }
  return { ok: true, facts, via: auth.activatedVia };
}

const profileOf = (actor: GuidanceActor) => (actor.kind === "caregiver" ? actor.profileId : null);

/** Today, or tomorrow: a plan is for a meal still to come. */
function plannable(date: string, today: string): boolean {
  const next = new Date(Date.parse(`${today}T12:00:00Z`) + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return date === today || date === next;
}

/**
 * Plans a meal. The suggestion is computed on the server by the caller (the
 * action recomputes the options and picks the one asked for by id), never
 * taken from the browser, so the stored portions and estimates are ones
 * the engine produced. Replaces any live plan for the same meal.
 */
export async function planMeal(
  db: SupabaseClient,
  params: {
    contactId: string;
    contactType?: GuidanceContactType;
    actor: GuidanceActor;
    date: string;
    suggestion: MealSuggestion;
    now?: Date;
  }
): Promise<DailyActionResult<{ planId: string }>> {
  const g = await guardDailyAction(db, params);
  if (!g.ok) return g;
  const today = localDate((params.now ?? new Date()).toISOString(), g.facts.timezone);
  if (!plannable(params.date, today)) return { ok: false, kind: "invalid", message: "Meals can be planned for today or tomorrow." };

  const column = guidanceSubjectColumn(g.facts.contactType);
  const cancel = await db
    .from("nutrition_meal_plans")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq(column, g.facts.contactId)
    .eq("local_date", params.date)
    .eq("meal_slot", params.suggestion.slot)
    .eq("status", "planned");
  if (cancel.error) return writeFailed("cancel previous plan", cancel.error);

  const insert = await db
    .from("nutrition_meal_plans")
    .insert({
      [column]: g.facts.contactId,
      local_date: params.date,
      meal_slot: params.suggestion.slot,
      suggestion: params.suggestion,
      suggestion_version: params.suggestion.version,
      status: "planned",
      planned_via: g.via,
      planned_by_profile_id: profileOf(params.actor),
    })
    .select("id")
    .single();
  if (insert.error || !insert.data) return writeFailed("plan meal", insert.error ?? { message: "no row returned" });
  return { ok: true, planId: String(insert.data.id) };
}

async function ownPlan(db: SupabaseClient, facts: ContactFacts, planId: string) {
  const { data } = await db
    .from("nutrition_meal_plans")
    .select("id, local_date, meal_slot, suggestion, status, meal_log_id")
    .eq("id", planId)
    .eq(guidanceSubjectColumn(facts.contactType), facts.contactId)
    .maybeSingle();
  return data && data.status === "planned" ? data : null;
}

export async function cancelPlan(
  db: SupabaseClient,
  params: { contactId: string; contactType?: GuidanceContactType; actor: GuidanceActor; planId: string }
): Promise<DailyActionResult> {
  const g = await guardDailyAction(db, params);
  if (!g.ok) return g;
  // Scoped to this person: a plan id from someone else's profile matches
  // nothing.
  if (!(await ownPlan(db, g.facts, params.planId))) return { ok: false, kind: "not_found" };
  const { error } = await db
    .from("nutrition_meal_plans")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", params.planId)
    .eq(guidanceSubjectColumn(g.facts.contactType), g.facts.contactId);
  if (error) return writeFailed("cancel plan", error);
  return { ok: true };
}

/**
 * "I had this": records the planned meal as eaten. Creates the meal_logs
 * row the day's totals read, estimated from the plan's own portions, and
 * links it from the plan so it's never counted twice. A plan already
 * linked, by this or by a photo of the meal, is refused rather than logged
 * again.
 */
export async function confirmPlannedMeal(
  db: SupabaseClient,
  params: {
    contactId: string;
    contactType?: GuidanceContactType;
    actor: GuidanceActor;
    planId: string;
    now?: Date;
  }
): Promise<DailyActionResult<{ mealLogId: string }>> {
  const g = await guardDailyAction(db, params);
  if (!g.ok) return g;
  const plan = await ownPlan(db, g.facts, params.planId);
  if (!plan) return { ok: false, kind: "not_found" };
  const now = params.now ?? new Date();
  if (String(plan.local_date) !== localDate(now.toISOString(), g.facts.timezone)) {
    return { ok: false, kind: "invalid", message: "Only today's planned meals can be confirmed." };
  }
  // Already logged, by "I had this" or by a photo in the same slot: logging
  // it again would count the meal twice.
  const mealColumn = g.facts.contactType === "gym" ? "client_id" : "adults_contact_id";
  const [{ data: recent }, { plans: livePlans }] = await Promise.all([
    db
      .from("meal_logs")
      .select("id, logged_at, meal_type")
      .eq(mealColumn, g.facts.contactId)
      .gte("logged_at", new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString()),
    loadPlansAndSkips(db, g.facts.contactId, g.facts.contactType, String(plan.local_date)),
  ]);
  const meals = ((recent ?? []) as Array<Record<string, unknown>>).map((m) => ({
    id: String(m.id),
    loggedAt: String(m.logged_at),
    mealType: typeof m.meal_type === "string" ? m.meal_type : null,
  }));
  if (plan.meal_log_id || linkPlans(livePlans, meals, g.facts.timezone).has(params.planId)) {
    return { ok: false, kind: "invalid", message: "This meal is already logged." };
  }

  const suggestion = plan.suggestion as MealSuggestion;
  const isGym = g.facts.contactType === "gym";
  const { data: entity } = await db
    .from(isGym ? "gym_clients" : "adults_contacts")
    .select(isGym ? "workspace_id, trainer_id" : "workspace_id, caregiver_id")
    .eq("id", g.facts.contactId)
    .maybeSingle();
  const e = (entity ?? {}) as Record<string, unknown>;
  // Min and max are the same figure: there's no photo to read a range
  // from, only the planned portion. Unknown nutrients stay null.
  const est = suggestion.estimate;
  const insert = await db
    .from("meal_logs")
    .insert({
      [isGym ? "client_id" : "adults_contact_id"]: g.facts.contactId,
      workspace_id: e.workspace_id ?? null,
      trainer_id: (isGym ? e.trainer_id : e.caregiver_id) ?? null,
      meal_type: suggestion.slot,
      logged_at: now.toISOString(),
      foods: suggestion.components.map((c) => ({ name: c.food, quantity: c.portion, estimated_cooked_weight_grams: `${c.grams}g` })),
      total_calories_min: est.calories,
      total_calories_max: est.calories,
      total_protein_min: est.protein,
      total_protein_max: est.protein,
      total_carbs_min: est.carbs,
      total_carbs_max: est.carbs,
      total_fat_min: est.fat,
      total_fat_max: est.fat,
      total_fiber_min: est.fiber,
      total_fiber_max: est.fiber,
      ai_summary: `Logged as planned: ${suggestion.title}. Estimated from the planned portions, not a photo.`,
      image_url: null,
      source: "guidance_plan",
    })
    .select("id")
    .single();
  if (insert.error || !insert.data) return writeFailed("log planned meal", insert.error ?? { message: "no row returned" });

  const mealLogId = String(insert.data.id);
  const link = await db
    .from("nutrition_meal_plans")
    .update({ meal_log_id: mealLogId, updated_at: new Date().toISOString() })
    .eq("id", params.planId)
    .eq(guidanceSubjectColumn(g.facts.contactType), g.facts.contactId);
  if (link.error) {
    // The meal is logged; without the link it would still be counted once
    // (a plan never counts), and linkPlans pairs them by slot anyway.
    console.error("[guidance] link planned meal failed:", link.error.message);
  }
  return { ok: true, mealLogId };
}

/** Marks a main meal as skipped, or takes the mark back. Today or
 * the past week only: older days are history. */
export async function setMealSkipped(
  db: SupabaseClient,
  params: {
    contactId: string;
    contactType?: GuidanceContactType;
    actor: GuidanceActor;
    date: string;
    slot: MealSlot;
    skipped: boolean;
    now?: Date;
  }
): Promise<DailyActionResult> {
  if (!MAIN_SLOTS.includes(params.slot) || !/^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
    return { ok: false, kind: "invalid", message: "Choose breakfast, lunch or dinner on a recent day." };
  }
  const g = await guardDailyAction(db, params);
  if (!g.ok) return g;
  const today = localDate((params.now ?? new Date()).toISOString(), g.facts.timezone);
  const weekAgo = new Date(Date.parse(`${today}T12:00:00Z`) - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (params.date > today || params.date < weekAgo) {
    return { ok: false, kind: "invalid", message: "Skipped meals can be marked for the past week." };
  }
  const column = guidanceSubjectColumn(g.facts.contactType);
  if (params.skipped) {
    const { error } = await db.from("nutrition_meal_skips").upsert(
      {
        [column]: g.facts.contactId,
        local_date: params.date,
        meal_slot: params.slot,
        confirmed_via: g.via,
        confirmed_by_profile_id: profileOf(params.actor),
      },
      { onConflict: `${column},local_date,meal_slot`, ignoreDuplicates: true }
    );
    if (error) return writeFailed("mark meal skipped", error);
  } else {
    const { error } = await db
      .from("nutrition_meal_skips")
      .delete()
      .eq(column, g.facts.contactId)
      .eq("local_date", params.date)
      .eq("meal_slot", params.slot);
    if (error) return writeFailed("unmark skipped meal", error);
  }
  return { ok: true };
}
