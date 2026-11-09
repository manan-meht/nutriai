import type { SupabaseClient } from "@supabase/supabase-js";

import { MICRO_KEYS, toCanonical, type InputUnit, type MicroKey } from "@/lib/nutrients/catalog";
import { HOUSEHOLD_FACT_KEYS, type FactAnswer, type HouseholdFactKey } from "@/lib/nutrients/facts";
import { recomputeAfterFactChange } from "@/lib/nutrients/pipeline";
import { confirmSupplementDose, saveHouseholdFact, type Subject } from "@/lib/nutrients/store";

import { guidanceSubjectColumn, writeFailed, type ContactFacts } from "./activation";
import type { GuidanceActor, GuidanceContactType } from "./authorization";
import { localDate } from "./daily-totals";
import { guardDailyAction, type DailyActionResult } from "./day-plan";

// The answers that sharpen vitamin and mineral estimates (migration 0071):
// household defaults ("is the milk fortified?"), the brand of a packaged
// product, and supplements with the doses someone confirms taking. Each
// goes through the same front door as every Guidance write
// (guardDailyAction): the person or the account holder tracking them,
// Guidance released and on.
//
// Two rules from the spec carry through here:
//   - A household default is not a fact about every meal. It's stored apart
//     from meal-specific facts, and the estimate doesn't apply it to food
//     known to be eaten outside the home (lib/nutrients/facts.ts).
//   - A supplement schedule is not intake. Only a confirmed dose is, once
//     per schedule, day and slot, and it's kept apart from food.
//
// An answer that changes how meals are estimated recomputes the recent
// estimates (the last five weeks, capped), so the totals and statuses on
// screen follow it.

const ANSWERS = new Set<FactAnswer>(["yes", "no", "unsure"]);
const RECOMPUTE_DAYS = 35;
const profileOf = (actor: GuidanceActor) => (actor.kind === "caregiver" ? actor.profileId : null);
const subjectOf = (facts: ContactFacts): Subject => ({ contactType: facts.contactType, contactId: facts.contactId });

async function recompute(db: SupabaseClient, facts: ContactFacts, now: Date) {
  try {
    await recomputeAfterFactChange(db, subjectOf(facts), {
      sinceIso: new Date(now.getTime() - RECOMPUTE_DAYS * 86_400_000).toISOString(),
    });
  } catch {
    // The answer is saved; the estimates catch up on the next recompute.
    console.error("[guidance] recompute after a fact change failed");
  }
}

export async function answerHouseholdFact(
  db: SupabaseClient,
  params: { contactId: string; contactType?: GuidanceContactType; actor: GuidanceActor; key: HouseholdFactKey; answer: FactAnswer; now?: Date }
): Promise<DailyActionResult> {
  if (!HOUSEHOLD_FACT_KEYS.includes(params.key) || !ANSWERS.has(params.answer)) {
    return { ok: false, kind: "invalid", message: "That answer isn't one of the options." };
  }
  const g = await guardDailyAction(db, params);
  if (!g.ok) return g;
  const saved = await saveHouseholdFact(db, subjectOf(g.facts), {
    key: params.key,
    answer: params.answer,
    profileId: profileOf(params.actor),
    via: g.via,
  });
  if (!saved.ok) return writeFailed("save household answer", { message: saved.error });
  await recompute(db, g.facts, params.now ?? new Date());
  return { ok: true };
}

/** "Which brand is this product?": records the product so this and later
 * meals that name it match it. Without label values its nutrients stay
 * unknown, never zero; the brand alone already stops it being matched to a
 * generic food. */
export async function confirmProductBrand(
  db: SupabaseClient,
  params: { contactId: string; contactType?: GuidanceContactType; actor: GuidanceActor; itemName: string; brand: string; now?: Date }
): Promise<DailyActionResult> {
  const itemName = params.itemName.trim().slice(0, 200);
  const brand = params.brand.trim().slice(0, 200);
  if (!itemName || !brand) return { ok: false, kind: "invalid", message: "Add the brand name." };
  const g = await guardDailyAction(db, params);
  if (!g.ok) return g;
  const { error } = await db.from("nutrition_confirmed_products").insert({
    [guidanceSubjectColumn(g.facts.contactType)]: g.facts.contactId,
    name: itemName,
    brand,
    basis: "per_100g",
    nutrients: {},
    source: "user",
    match_names: [itemName.toLowerCase()],
    confirmed_by_profile_id: profileOf(params.actor),
  });
  if (error) return writeFailed("save product", error);
  await recompute(db, g.facts, params.now ?? new Date());
  return { ok: true };
}

export interface SupplementInput {
  name: string;
  brand?: string | null;
  /** From the label, per dose: the amount and the unit printed. */
  nutrients: Array<{ key: MicroKey; amount: number; unit: InputUnit }>;
}

/** Adds a supplement someone takes. Units are converted to canonical with
 * the catalog's documented conversions only. A value that can't be
 * converted (vitamin A in IU, with no form given) is refused, not guessed. */
export async function addSupplement(
  db: SupabaseClient,
  params: { contactId: string; contactType?: GuidanceContactType; actor: GuidanceActor; supplement: SupplementInput; now?: Date }
): Promise<DailyActionResult<{ scheduleId: string }>> {
  const name = params.supplement.name.trim().slice(0, 200);
  if (!name) return { ok: false, kind: "invalid", message: "Add the supplement's name." };
  if (params.supplement.nutrients.length === 0) {
    return { ok: false, kind: "invalid", message: "Add at least one vitamin or mineral from the label." };
  }
  const perDose: Partial<Record<MicroKey, number>> = {};
  for (const n of params.supplement.nutrients) {
    if (!MICRO_KEYS.includes(n.key) || !(n.amount > 0) || n.amount > 100_000) {
      return { ok: false, kind: "invalid", message: "Check the amounts: each must be a positive number from the label." };
    }
    const converted = toCanonical(n.key, n.amount, n.unit);
    if (!converted.ok) return { ok: false, kind: "invalid", message: converted.reason };
    perDose[n.key] = converted.amount;
  }
  const g = await guardDailyAction(db, params);
  if (!g.ok) return g;
  const today = localDate((params.now ?? new Date()).toISOString(), g.facts.timezone);
  const insert = await db
    .from("supplement_schedules")
    .insert({
      [guidanceSubjectColumn(g.facts.contactType)]: g.facts.contactId,
      name,
      brand: params.supplement.brand?.trim().slice(0, 200) || null,
      nutrients_per_dose: perDose,
      slots: ["daily"],
      effective_from: today,
      source: "label",
      created_by_profile_id: profileOf(params.actor),
    })
    .select("id")
    .single();
  if (insert.error || !insert.data) return writeFailed("add supplement", insert.error ?? { message: "no row returned" });
  return { ok: true, scheduleId: String(insert.data.id) };
}

async function ownSchedule(db: SupabaseClient, facts: ContactFacts, scheduleId: string) {
  const { data } = await db
    .from("supplement_schedules")
    .select("id, slots, effective_from, effective_to")
    .eq("id", scheduleId)
    .eq(guidanceSubjectColumn(facts.contactType), facts.contactId)
    .maybeSingle();
  return data;
}

/** Confirms today's dose was taken, or takes the confirmation back. Once
 * per schedule and day: a second tap changes nothing. */
export async function setSupplementTaken(
  db: SupabaseClient,
  params: { contactId: string; contactType?: GuidanceContactType; actor: GuidanceActor; scheduleId: string; taken: boolean; now?: Date }
): Promise<DailyActionResult> {
  const g = await guardDailyAction(db, params);
  if (!g.ok) return g;
  const schedule = await ownSchedule(db, g.facts, params.scheduleId);
  if (!schedule) return { ok: false, kind: "not_found" };
  const today = localDate((params.now ?? new Date()).toISOString(), g.facts.timezone);
  const slot = Array.isArray(schedule.slots) && schedule.slots.length > 0 ? String(schedule.slots[0]) : "daily";
  if (params.taken) {
    if (String(schedule.effective_from) > today || (schedule.effective_to && String(schedule.effective_to) <= today)) {
      return { ok: false, kind: "invalid", message: "This supplement isn't on the list for today." };
    }
    const saved = await confirmSupplementDose(db, subjectOf(g.facts), {
      scheduleId: params.scheduleId,
      takenOn: today,
      slot,
      profileId: profileOf(params.actor),
      via: g.via,
    });
    if (!saved.ok) return writeFailed("confirm dose", { message: saved.error });
  } else {
    const { error } = await db
      .from("supplement_doses")
      .delete()
      .eq("schedule_id", params.scheduleId)
      .eq(guidanceSubjectColumn(g.facts.contactType), g.facts.contactId)
      .eq("taken_on", today);
    if (error) return writeFailed("undo dose", error);
  }
  return { ok: true };
}

/** Stops a supplement from tomorrow. Doses already confirmed stay. */
export async function stopSupplement(
  db: SupabaseClient,
  params: { contactId: string; contactType?: GuidanceContactType; actor: GuidanceActor; scheduleId: string; now?: Date }
): Promise<DailyActionResult> {
  const g = await guardDailyAction(db, params);
  if (!g.ok) return g;
  const schedule = await ownSchedule(db, g.facts, params.scheduleId);
  if (!schedule) return { ok: false, kind: "not_found" };
  const today = localDate((params.now ?? new Date()).toISOString(), g.facts.timezone);
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const { error } = await db
    .from("supplement_schedules")
    .update({ effective_to: tomorrow })
    .eq("id", params.scheduleId)
    .eq(guidanceSubjectColumn(g.facts.contactType), g.facts.contactId);
  if (error) return writeFailed("stop supplement", error);
  return { ok: true };
}
