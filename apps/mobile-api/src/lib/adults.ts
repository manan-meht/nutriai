import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "./supabase";

// Read-only mirror of the relevant parts of the main app's
// src/app/(adults)/adults/dashboard/actions.ts — intentionally duplicated,
// not imported, since this is a separately deployed app (see supabase.ts's
// top comment). Only the read paths this mobile API exposes are ported;
// every write action (add/remove/invite/goals) stays exclusively in the
// main app. Keep in sync manually if the underlying schema/mapping changes.

export interface HumanCorrectionFields {
  proteinAnchorStatus?: string;
  vegetableFiberStatus?: string;
  mealBalanceStatus?: string;
  homeCookedLikelihood?: string;
  enjoymentFoodPresent?: boolean;
  sugaryDrinkPresent?: boolean;
  ultraProcessedLikelihood?: string;
  suggestedNextStep?: string;
}

const APPLICABLE_REVIEW_STATUSES = new Set(["correct", "partially_correct", "incorrect"]);

function definedAndKnown(value: string | null | undefined): string | undefined {
  return value && value !== "unknown" ? value : undefined;
}

async function fetchHumanCorrectionsByMealLogId(mealLogIds: string[]): Promise<Record<string, HumanCorrectionFields>> {
  if (mealLogIds.length === 0) return {};
  const db = createServiceClient();
  const { data } = await db
    .from("meal_submissions")
    .select("meal_log_id, human_meal_reviews(*)")
    .in("meal_log_id", mealLogIds);

  const result: Record<string, HumanCorrectionFields> = {};
  for (const row of data ?? []) {
    if (!row.meal_log_id) continue;
    const reviews: any[] = row.human_meal_reviews ?? [];
    if (!reviews.length) continue;
    const latest = [...reviews].sort((a, b) => new Date(b.reviewed_at).getTime() - new Date(a.reviewed_at).getTime())[0];
    if (!APPLICABLE_REVIEW_STATUSES.has(latest.review_status)) continue;

    result[row.meal_log_id] = {
      proteinAnchorStatus: definedAndKnown(latest.corrected_protein_anchor_status),
      vegetableFiberStatus: definedAndKnown(latest.corrected_vegetable_fiber_status),
      mealBalanceStatus: definedAndKnown(latest.corrected_meal_balance_status),
      homeCookedLikelihood: definedAndKnown(latest.corrected_home_cooked_likelihood),
      enjoymentFoodPresent: latest.corrected_enjoyment_food_present ?? undefined,
      sugaryDrinkPresent: latest.corrected_sugary_drink_present ?? undefined,
      ultraProcessedLikelihood: definedAndKnown(latest.corrected_ultra_processed_likelihood),
      suggestedNextStep: latest.corrected_suggestion ?? undefined,
    };
  }
  return result;
}

export interface AdultsGoal {
  id: string;
  goalType: string;
  title: string;
  description?: string;
  targetCaloriesMin?: number;
  targetCaloriesMax?: number;
  targetProteinG?: number;
  targetMealsPerDay?: number;
  status: string;
}

export interface AdultsContact {
  id: string;
  workspaceId: string;
  fullName: string;
  whatsappNumber: string;
  relationship?: string;
  relationshipType: "self" | "family_caregiver";
  age?: number;
  gender?: "male" | "female" | "other";
  weightKg?: number;
  heightCm?: number;
  healthNotes?: string;
  inviteSentAt?: string;
  inviteAcceptedAt?: string;
  createdAt: string;
  trackedBiomarkers: string[];
  goals: AdultsGoal[];
  mealCount: number;
  lastMealAt?: string;
  timezone: string;
  remindersEnabled: boolean;
  reminderTimes: string[];
}

export interface AdultsMealLog {
  id: string;
  contactId: string;
  mealType: string;
  loggedAt: string;
  foods: any[];
  totalCaloriesMin: number;
  totalCaloriesMax: number;
  totalProteinMin: number;
  totalProteinMax: number;
  totalCarbsMin: number;
  totalCarbsMax: number;
  totalFatMin: number;
  totalFatMax: number;
  totalFiberMin: number;
  totalFiberMax: number;
  aiSummary?: string;
  imageUrl?: string;
  humanCorrection?: HumanCorrectionFields;
}

export interface AdultsContactDetails {
  contact: AdultsContact;
  meals: AdultsMealLog[];
}

export async function getOrCreateAdultsWorkspace(
  userId: string,
  caregiverName?: string
): Promise<{ id: string; name: string; extraCapacity: number; plan: string }> {
  const admin = createServiceClient();

  const { data: existing } = await admin
    .from("workspaces")
    .select("id, name, extra_capacity, plan")
    .eq("owner_id", userId)
    .eq("type", "adults")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (existing) return { id: existing.id, name: existing.name, extraCapacity: existing.extra_capacity ?? 0, plan: existing.plan ?? "family" };

  const name = `${caregiverName ?? "My"}'s Family`;
  const slug = `adults-${userId.slice(0, 8)}-${Date.now()}`;

  const { data: created, error } = await admin
    .from("workspaces")
    .insert({ type: "adults", name, slug, owner_id: userId })
    .select("id, name, extra_capacity, plan")
    .single();

  if (error || !created) throw new Error(`Failed to create workspace: ${error?.message}`);
  return { id: created.id, name: created.name, extraCapacity: created.extra_capacity ?? 0, plan: created.plan ?? "family" };
}

function mapContactRow(c: any, mealsByContact: Record<string, { count: number; lastAt?: string }>): AdultsContact {
  return {
    id: c.id,
    workspaceId: c.workspace_id,
    fullName: c.full_name,
    whatsappNumber: c.whatsapp_number,
    relationship: c.relationship,
    relationshipType: c.relationship_type ?? "family_caregiver",
    age: c.age,
    gender: c.gender,
    weightKg: c.weight_kg,
    heightCm: c.height_cm,
    healthNotes: c.health_notes,
    inviteSentAt: c.invite_sent_at,
    inviteAcceptedAt: c.invite_accepted_at,
    createdAt: c.created_at,
    trackedBiomarkers: c.tracked_biomarkers ?? [],
    mealCount: mealsByContact[c.id]?.count ?? 0,
    lastMealAt: mealsByContact[c.id]?.lastAt,
    timezone: c.timezone ?? "Asia/Kolkata",
    remindersEnabled: c.reminders_enabled ?? false,
    reminderTimes: Array.isArray(c.reminder_times) ? c.reminder_times : ["08:00", "12:00", "19:00"],
    goals: (c.goals ?? []).map((g: any) => ({
      id: g.id,
      goalType: g.goal_type,
      title: g.title,
      description: g.description,
      targetCaloriesMin: g.target_calories_min,
      targetCaloriesMax: g.target_calories_max,
      targetProteinG: g.target_protein_g,
      targetMealsPerDay: g.target_meals_per_day,
      status: g.status,
    })),
  };
}

async function fetchMealsByContact(supabase: SupabaseClient, contactIds: string[]) {
  const { data: meals } = await supabase
    .from("meal_logs")
    .select("adults_contact_id, logged_at")
    .in("adults_contact_id", contactIds)
    .order("logged_at", { ascending: false });

  const mealsByContact: Record<string, { count: number; lastAt?: string }> = {};
  for (const m of meals ?? []) {
    if (!m.adults_contact_id) continue;
    if (!mealsByContact[m.adults_contact_id]) {
      mealsByContact[m.adults_contact_id] = { count: 0, lastAt: m.logged_at };
    }
    mealsByContact[m.adults_contact_id].count++;
  }
  return mealsByContact;
}

export async function getContacts(workspaceId: string, supabase: SupabaseClient): Promise<AdultsContact[]> {
  const { data: contacts } = await supabase
    .from("adults_contacts")
    .select("*, goals:adults_contact_goals(*)")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (!contacts?.length) return [];

  const mealsByContact = await fetchMealsByContact(supabase, contacts.map((c: any) => c.id));
  return contacts.map((c: any) => mapContactRow(c, mealsByContact));
}

export async function getContactDetails(contactId: string, supabase: SupabaseClient): Promise<AdultsContactDetails | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const since = new Date();
  since.setDate(since.getDate() - 400);

  const [contactRes, mealsRes] = await Promise.all([
    supabase
      .from("adults_contacts")
      .select("*, goals:adults_contact_goals(*)")
      .eq("id", contactId)
      .eq("caregiver_id", user.id)
      .single(),
    supabase
      .from("meal_logs")
      .select("*")
      .eq("adults_contact_id", contactId)
      .gte("logged_at", since.toISOString())
      .order("logged_at", { ascending: false }),
  ]);

  if (!contactRes.data) return null;
  const c = contactRes.data;

  const contact: AdultsContact = {
    id: c.id,
    workspaceId: c.workspace_id,
    fullName: c.full_name,
    whatsappNumber: c.whatsapp_number,
    relationship: c.relationship,
    relationshipType: c.relationship_type ?? "family_caregiver",
    age: c.age,
    gender: c.gender,
    weightKg: c.weight_kg,
    heightCm: c.height_cm,
    healthNotes: c.health_notes,
    inviteSentAt: c.invite_sent_at,
    inviteAcceptedAt: c.invite_accepted_at,
    createdAt: c.created_at,
    trackedBiomarkers: c.tracked_biomarkers ?? [],
    mealCount: mealsRes.data?.length ?? 0,
    lastMealAt: mealsRes.data?.[0]?.logged_at,
    timezone: c.timezone ?? "Asia/Kolkata",
    remindersEnabled: c.reminders_enabled ?? false,
    reminderTimes: Array.isArray(c.reminder_times) ? c.reminder_times : ["08:00", "12:00", "19:00"],
    goals: (c.goals ?? []).map((g: any) => ({
      id: g.id,
      goalType: g.goal_type,
      title: g.title,
      description: g.description,
      targetCaloriesMin: g.target_calories_min,
      targetCaloriesMax: g.target_calories_max,
      targetProteinG: g.target_protein_g,
      targetMealsPerDay: g.target_meals_per_day,
      status: g.status,
    })),
  };

  const rawMeals = mealsRes.data ?? [];
  const corrections = await fetchHumanCorrectionsByMealLogId(rawMeals.map((m: any) => m.id));

  const meals: AdultsMealLog[] = rawMeals.map((m: any) => ({
    id: m.id,
    contactId: m.adults_contact_id,
    mealType: m.meal_type,
    loggedAt: m.logged_at,
    foods: m.foods ?? [],
    totalCaloriesMin: m.total_calories_min ?? 0,
    totalCaloriesMax: m.total_calories_max ?? 0,
    totalProteinMin: m.total_protein_min ?? 0,
    totalProteinMax: m.total_protein_max ?? 0,
    totalCarbsMin: m.total_carbs_min ?? 0,
    totalCarbsMax: m.total_carbs_max ?? 0,
    totalFatMin: m.total_fat_min ?? 0,
    totalFatMax: m.total_fat_max ?? 0,
    totalFiberMin: m.total_fiber_min ?? 0,
    totalFiberMax: m.total_fiber_max ?? 0,
    aiSummary: m.ai_summary,
    imageUrl: m.image_url ?? undefined,
    humanCorrection: corrections[m.id],
  }));

  return { contact, meals };
}
