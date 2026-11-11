import type { SupabaseClient } from "@supabase/supabase-js";

import { guidanceSubjectColumn } from "@/lib/guidance/activation";
import type { GuidanceContactType } from "@/lib/guidance/authorization";

import { isNutrientKey, type NutrientKey } from "./catalog";
import type { ConfirmedProduct, FactAnswer, HouseholdFactKey, HouseholdFacts, MealFacts } from "./facts";
import { HOUSEHOLD_FACT_KEYS } from "./facts";

// Reads and writes for the 0071 tables. Every query is scoped to one tracked
// person by their subject column, so one person's facts, products, doses or
// estimates can never be read into another's estimate.
//
// These functions don't authorize. The caller must already have checked
// that the actor may act for this person (src/lib/guidance/authorization.ts),
// exactly as for the Guidance tables, and must use the service client
// because RLS has no policies on these tables.

export interface Subject {
  contactType: GuidanceContactType;
  contactId: string;
}

export type FactChannel = "self_account" | "end_user_session" | "whatsapp" | "caregiver" | "coach";

/** meal_logs predates Guidance and names a coach client client_id. */
export function mealLogSubjectColumn(contactType: GuidanceContactType): "adults_contact_id" | "client_id" {
  return contactType === "gym" ? "client_id" : "adults_contact_id";
}

export function subjectColumns(subject: Subject): { adults_contact_id: string | null; gym_client_id: string | null } {
  return subject.contactType === "gym"
    ? { adults_contact_id: null, gym_client_id: subject.contactId }
    : { adults_contact_id: subject.contactId, gym_client_id: null };
}

export async function loadHouseholdFacts(db: SupabaseClient, subject: Subject): Promise<HouseholdFacts> {
  const { data, error } = await db
    .from("nutrition_household_facts")
    .select("fact_key, answer")
    .eq(guidanceSubjectColumn(subject.contactType), subject.contactId);
  if (error) throw new Error(`household facts read failed: ${error.code ?? "unknown"}`);
  const out: HouseholdFacts = {};
  for (const row of (data ?? []) as Array<{ fact_key: string; answer: string }>) {
    if ((HOUSEHOLD_FACT_KEYS as readonly string[]).includes(row.fact_key) && ["yes", "no", "unsure"].includes(row.answer)) {
      out[row.fact_key as HouseholdFactKey] = row.answer as FactAnswer;
    }
  }
  return out;
}

export async function saveHouseholdFact(
  db: SupabaseClient,
  subject: Subject,
  fact: { key: HouseholdFactKey; answer: FactAnswer; profileId: string | null; via: FactChannel }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const column = guidanceSubjectColumn(subject.contactType);
  const { error } = await db.from("nutrition_household_facts").upsert(
    {
      ...subjectColumns(subject),
      fact_key: fact.key,
      answer: fact.answer,
      answered_by_profile_id: fact.profileId,
      answered_via: fact.via,
      updated_at: new Date().toISOString(),
    },
    { onConflict: `${column},fact_key` }
  );
  return error ? { ok: false, error: error.code ?? "write_failed" } : { ok: true };
}

export async function loadMealFacts(db: SupabaseClient, subject: Subject, mealLogIds: string[]): Promise<Map<string, MealFacts>> {
  const out = new Map<string, MealFacts>();
  if (mealLogIds.length === 0) return out;
  const { data, error } = await db
    .from("meal_nutrient_facts")
    .select("meal_log_id, eaten_outside, milk_fortified, products")
    .eq(guidanceSubjectColumn(subject.contactType), subject.contactId)
    .in("meal_log_id", mealLogIds);
  if (error) throw new Error(`meal facts read failed: ${error.code ?? "unknown"}`);
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    out.set(String(row.meal_log_id), {
      eatenOutside: typeof row.eaten_outside === "boolean" ? row.eaten_outside : null,
      milkFortified: (row.milk_fortified as FactAnswer | null) ?? null,
      products: Array.isArray(row.products) ? (row.products as MealFacts["products"]) : [],
    });
  }
  return out;
}

function toProduct(row: Record<string, unknown>): ConfirmedProduct {
  const nutrients: Partial<Record<NutrientKey, number>> = {};
  for (const [k, v] of Object.entries((row.nutrients as Record<string, unknown>) ?? {})) {
    if (isNutrientKey(k) && typeof v === "number" && Number.isFinite(v) && v >= 0) nutrients[k] = v;
  }
  return {
    id: String(row.id),
    name: String(row.name),
    brand: (row.brand as string | null) ?? null,
    basis: row.basis === "per_serving" ? "per_serving" : "per_100g",
    servingGrams: typeof row.serving_grams === "number" ? row.serving_grams : row.serving_grams != null ? Number(row.serving_grams) : null,
    nutrients,
    source: row.source === "label" ? "label" : "user",
    matchNames: Array.isArray(row.match_names) ? (row.match_names as string[]) : [],
  };
}

export async function loadConfirmedProducts(db: SupabaseClient, subject: Subject): Promise<ConfirmedProduct[]> {
  const { data, error } = await db
    .from("nutrition_confirmed_products")
    .select("id, name, brand, basis, serving_grams, nutrients, source, match_names")
    .eq(guidanceSubjectColumn(subject.contactType), subject.contactId);
  if (error) throw new Error(`products read failed: ${error.code ?? "unknown"}`);
  return ((data ?? []) as Array<Record<string, unknown>>).map(toProduct);
}

export interface SupplementSchedule {
  id: string;
  name: string;
  brand: string | null;
  nutrientsPerDose: Partial<Record<NutrientKey, number>>;
  slots: string[];
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface SupplementDose {
  scheduleId: string;
  takenOn: string;
  slot: string;
  quantity: number;
}

export async function loadSupplements(
  db: SupabaseClient,
  subject: Subject,
  range: { start: string; end: string }
): Promise<{ schedules: SupplementSchedule[]; doses: SupplementDose[] }> {
  const column = guidanceSubjectColumn(subject.contactType);
  const [schedulesRes, dosesRes] = await Promise.all([
    db.from("supplement_schedules").select("id, name, brand, nutrients_per_dose, slots, effective_from, effective_to").eq(column, subject.contactId),
    db.from("supplement_doses").select("schedule_id, taken_on, slot, quantity").eq(column, subject.contactId).gte("taken_on", range.start),
  ]);
  if (schedulesRes.error || dosesRes.error) throw new Error("supplements read failed");
  const schedules = ((schedulesRes.data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const nutrientsPerDose: Partial<Record<NutrientKey, number>> = {};
    for (const [k, v] of Object.entries((r.nutrients_per_dose as Record<string, unknown>) ?? {})) {
      if (isNutrientKey(k) && typeof v === "number" && Number.isFinite(v) && v >= 0) nutrientsPerDose[k] = v;
    }
    return {
      id: String(r.id),
      name: String(r.name),
      brand: (r.brand as string | null) ?? null,
      nutrientsPerDose,
      slots: Array.isArray(r.slots) ? (r.slots as string[]) : ["daily"],
      effectiveFrom: String(r.effective_from),
      effectiveTo: (r.effective_to as string | null) ?? null,
    };
  });
  const scheduleIds = new Set(schedules.map((s) => s.id));
  const doses = ((dosesRes.data ?? []) as Array<Record<string, unknown>>)
    .map((r) => ({ scheduleId: String(r.schedule_id), takenOn: String(r.taken_on), slot: String(r.slot), quantity: Number(r.quantity ?? 1) }))
    // A dose belongs to this person only through their own schedule.
    .filter((d) => scheduleIds.has(d.scheduleId) && d.takenOn <= range.end);
  return { schedules, doses };
}

/**
 * Records a dose someone confirmed taking. Idempotent: confirming the same
 * schedule, day and slot again is a no-op, never a second dose.
 */
export async function confirmSupplementDose(
  db: SupabaseClient,
  subject: Subject,
  dose: { scheduleId: string; takenOn: string; slot: string; quantity?: number; profileId: string | null; via: FactChannel }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const column = guidanceSubjectColumn(subject.contactType);
  // The schedule must belong to this person.
  const { data: schedule } = await db.from("supplement_schedules").select("id").eq("id", dose.scheduleId).eq(column, subject.contactId).maybeSingle();
  if (!schedule) return { ok: false, error: "schedule_not_found" };
  const { error } = await db.from("supplement_doses").upsert(
    {
      schedule_id: dose.scheduleId,
      ...subjectColumns(subject),
      taken_on: dose.takenOn,
      slot: dose.slot,
      quantity: dose.quantity ?? 1,
      confirmed_by_profile_id: dose.profileId,
      confirmed_via: dose.via,
    },
    { onConflict: "schedule_id,taken_on,slot", ignoreDuplicates: true }
  );
  return error ? { ok: false, error: error.code ?? "write_failed" } : { ok: true };
}

/** Daily confirmed supplement totals, and scheduled doses nobody confirmed,
 * by local date. Schedules alone never add intake. */
export function supplementTotalsByDate(
  schedules: SupplementSchedule[],
  doses: SupplementDose[],
  dates: string[],
  today: string
): Map<string, { totals: Partial<Record<NutrientKey, number>>; unconfirmed: number }> {
  const byId = new Map(schedules.map((s) => [s.id, s]));
  const out = new Map<string, { totals: Partial<Record<NutrientKey, number>>; unconfirmed: number }>();
  for (const date of dates) {
    const totals: Partial<Record<NutrientKey, number>> = {};
    const taken = doses.filter((d) => d.takenOn === date);
    for (const d of taken) {
      const s = byId.get(d.scheduleId);
      if (!s) continue;
      for (const [k, v] of Object.entries(s.nutrientsPerDose) as Array<[NutrientKey, number]>) {
        totals[k] = (totals[k] ?? 0) + v * d.quantity;
      }
    }
    let unconfirmed = 0;
    if (date < today) {
      for (const s of schedules) {
        if (date < s.effectiveFrom || (s.effectiveTo && date >= s.effectiveTo)) continue;
        for (const slot of s.slots) if (!taken.some((d) => d.scheduleId === s.id && d.slot === slot)) unconfirmed++;
      }
    }
    out.set(date, { totals, unconfirmed });
  }
  return out;
}
