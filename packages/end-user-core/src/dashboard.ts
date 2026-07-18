import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContactType } from "./otp";

// Structurally identical to the main web app's ProfileDashboardProfile/
// ProfileDashboardMeal (src/lib/dashboard/profile-dashboard-types.ts) and
// the mobile app's PersonLike/MealLog (apps/mobile/src/lib/api.ts) — kept
// as separate local types here (rather than importing either) since this
// package has no dependency on either app, but every field name matches so
// callers can pass this straight through to their own dashboard renderer
// without an adapter.
export interface EndUserProfile {
  id: string;
  fullName: string;
  whatsappNumber: string;
  age?: number;
  gender?: "male" | "female" | "other";
  weightKg?: number;
  heightCm?: number;
  mealCount: number;
  trackedBiomarkers: string[];
  inviteAcceptedAt?: string;
  relationshipType?: "self" | "family_caregiver";
  relationship?: string;
  timezone?: string;
  dateOfBirth?: string;
  metabolicEquationSex?: "male" | "female";
  activityLevel?: "mostly_sitting" | "lightly_active" | "moderately_active" | "very_active" | "unknown";
  resistanceTrainingStatus?: "regularly" | "sometimes" | "not_currently" | "unknown";
  primaryNutritionGoal?:
    | "reduce_weight"
    | "reduce_body_fat"
    | "gain_muscle"
    | "body_recomposition"
    | "maintain_weight"
    | "improve_nutrition"
    | "healthy_aging";
  targetWeightKg?: number;
}

export interface EndUserMeal {
  id: string;
  profileId: string;
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
}

export interface EndUserDashboardData {
  profile: EndUserProfile;
  meals: EndUserMeal[];
}

const ADULTS_PROFILE_COLUMNS =
  "id, full_name, whatsapp_number, relationship, relationship_type, timezone, weight_kg, height_cm, age, gender, primary_nutrition_goal, date_of_birth, metabolic_equation_sex, activity_level, resistance_training_status, target_weight_kg, tracked_biomarkers, invite_accepted_at";
const GYM_PROFILE_COLUMNS =
  "id, full_name, whatsapp_number, weight_kg, height_cm, age, gender, primary_nutrition_goal, date_of_birth, metabolic_equation_sex, activity_level, resistance_training_status, target_weight_kg, tracked_biomarkers";

/** Fetches the full profile + meal history for a tracked contact, keyed by
 * the contact's own id (not the caregiver/coach's) — same fetch shape as
 * getContactDetails/getClientDetails, just reachable without an owner
 * check (the OTP session itself is the authorization). Shared by the web
 * /my-progress route and the mobile app's end-user dashboard screen. */
export async function getEndUserDashboardData(
  db: SupabaseClient,
  contactId: string,
  contactType: ContactType
): Promise<EndUserDashboardData> {
  const table = contactType === "adults" ? "adults_contacts" : "gym_clients";
  const ownerColumn = contactType === "adults" ? "caregiver_id" : "trainer_id";
  const mealColumn = contactType === "adults" ? "adults_contact_id" : "client_id";

  const selectColumns: string = `${contactType === "adults" ? ADULTS_PROFILE_COLUMNS : GYM_PROFILE_COLUMNS}, ${ownerColumn}`;
  const { data: row } = (await db
    .from(table)
    .select(selectColumns)
    .eq("id", contactId)
    .single()) as { data: any };

  const { data: mealRows } = await db
    .from("meal_logs")
    .select("*")
    .eq(mealColumn, contactId)
    .order("logged_at", { ascending: false });

  const allRows = mealRows ?? [];

  const meals: EndUserMeal[] = allRows.map((m: any) => ({
    id: m.id,
    profileId: contactId,
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
    imageUrl: m.image_url,
  }));

  const profile: EndUserProfile = {
    id: contactId,
    fullName: row?.full_name ?? "there",
    whatsappNumber: row?.whatsapp_number ?? "",
    age: row?.age,
    gender: row?.gender,
    weightKg: row?.weight_kg,
    heightCm: row?.height_cm,
    mealCount: allRows.length,
    trackedBiomarkers: row?.tracked_biomarkers ?? [],
    relationshipType: contactType === "adults" ? row?.relationship_type : undefined,
    relationship: contactType === "adults" ? row?.relationship : undefined,
    timezone: contactType === "adults" ? row?.timezone : undefined,
    inviteAcceptedAt: contactType === "adults" ? row?.invite_accepted_at : undefined,
    dateOfBirth: row?.date_of_birth,
    metabolicEquationSex: row?.metabolic_equation_sex,
    activityLevel: row?.activity_level,
    resistanceTrainingStatus: row?.resistance_training_status,
    primaryNutritionGoal: row?.primary_nutrition_goal,
    targetWeightKg: row?.target_weight_kg,
  };

  return { profile, meals };
}

export interface EndUserAccessEntry {
  role: "caregiver" | "coach";
  label: string;
}

/** Whether this contact currently has an owning caregiver/coach — used to
 * populate the "who has access" list. Separate query from
 * getEndUserDashboardData's select (which already carries the owner column
 * internally) since callers may need this without the full profile fetch. */
export async function getAccessList(db: SupabaseClient, contactId: string, contactType: ContactType): Promise<EndUserAccessEntry[]> {
  const table = contactType === "adults" ? "adults_contacts" : "gym_clients";
  const ownerColumn = contactType === "adults" ? "caregiver_id" : "trainer_id";
  const { data: row } = await db.from(table).select(ownerColumn).eq("id", contactId).maybeSingle();
  const hasOwner = row && (row as any)[ownerColumn];
  return hasOwner
    ? [{ role: contactType === "adults" ? "caregiver" : "coach", label: contactType === "adults" ? "Your family contact" : "Your coach" }]
    : [];
}

export interface Inviter {
  name: string;
  role: "family_owner" | "coach";
}

/** The caregiver's/coach's own display name, for the consent screen copy
 * ("[Family member name] invited you..." / "[Coach name] invited you...").
 * Falls back to a generic role label if the owner has no profile row or
 * hasn't set a name — the consent screen must still render something
 * sensible rather than showing a blank. */
export async function getInviter(db: SupabaseClient, contactId: string, contactType: ContactType): Promise<Inviter | null> {
  const table = contactType === "adults" ? "adults_contacts" : "gym_clients";
  const ownerColumn = contactType === "adults" ? "caregiver_id" : "trainer_id";
  const role: Inviter["role"] = contactType === "adults" ? "family_owner" : "coach";

  const { data: row } = await db.from(table).select(ownerColumn).eq("id", contactId).maybeSingle();
  const ownerId = row ? (row as any)[ownerColumn] : null;
  if (!ownerId) return null;

  const { data: profile } = await db.from("profiles").select("full_name").eq("id", ownerId).maybeSingle();
  return { name: profile?.full_name || (role === "family_owner" ? "Your family member" : "Your coach"), role };
}
