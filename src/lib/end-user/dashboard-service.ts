import { createClient } from "@supabase/supabase-js";
import type { ContactType } from "@/lib/end-user/otp";
import { fetchHumanCorrectionsByMealLogId } from "@/lib/nutrition/fetch-human-corrections";
import type { ProfileDashboardData, ProfileDashboardProfile } from "@/lib/dashboard/profile-dashboard-types";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface EndUserAccessEntry {
  role: "caregiver" | "coach";
  label: string;
}

export interface EndUserDashboard {
  contactId: string;
  contactType: ContactType;
  /** Full profile + meal history, shaped for the shared ProfileDashboard
   * component (see src/components/dashboard/ProfileDashboard.tsx) — same
   * data shape the family_admin/coach dashboards render, just fetched via
   * the OTP-authenticated end-user session instead of an owner check. */
  data: ProfileDashboardData;
  accessList: EndUserAccessEntry[];
  isPaused: boolean;
}

/** Selects the same profile-field set as getContactDetails/getClientDetails
 * (src/app/(adults|gym)/.../actions.ts) so the end-user's own dashboard
 * renders identically to the caregiver/coach view of the same person —
 * just gated by a different auth mechanism (OTP session vs. owner check). */
const ADULTS_PROFILE_COLUMNS =
  "id, full_name, whatsapp_number, relationship, relationship_type, timezone, weight_kg, height_cm, age, gender, primary_nutrition_goal, date_of_birth, metabolic_equation_sex, activity_level, resistance_training_status, target_weight_kg, tracked_biomarkers, invite_accepted_at";
const GYM_PROFILE_COLUMNS =
  "id, full_name, whatsapp_number, weight_kg, height_cm, age, gender, primary_nutrition_goal, date_of_birth, metabolic_equation_sex, activity_level, resistance_training_status, target_weight_kg, tracked_biomarkers";

export async function getEndUserDashboard(contactId: string, contactType: ContactType): Promise<EndUserDashboard> {
  const db = admin();
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
  const corrections = await fetchHumanCorrectionsByMealLogId(allRows.map((m: any) => m.id));

  const meals: ProfileDashboardData["meals"] = allRows.map((m: any) => ({
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
    humanCorrection: corrections[m.id],
  }));

  const profile: ProfileDashboardProfile = {
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

  const accessList: EndUserAccessEntry[] = row?.[ownerColumn as keyof typeof row]
    ? [{ role: contactType === "adults" ? "caregiver" : "coach", label: contactType === "adults" ? "Your family contact" : "Your coach" }]
    : [];

  const { data: access } = await db
    .from("end_user_access_settings")
    .select("paused_at")
    .eq("contact_id", contactId)
    .maybeSingle();

  return {
    contactId,
    contactType,
    data: { profile, meals },
    accessList,
    isPaused: !!access?.paused_at,
  };
}

export async function setSharingPaused(contactId: string, contactType: ContactType, paused: boolean): Promise<void> {
  const db = admin();
  await db.from("end_user_access_settings").upsert({
    contact_id: contactId,
    contact_type: contactType,
    paused_at: paused ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  });
}

export async function requestRemoval(contactId: string, contactType: ContactType): Promise<void> {
  const db = admin();
  await db.from("end_user_access_settings").upsert({
    contact_id: contactId,
    contact_type: contactType,
    removal_requested_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}
