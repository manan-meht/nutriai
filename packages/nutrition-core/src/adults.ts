import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchHumanCorrectionsByMealLogId } from "./human-corrections";
import type { AdultsContact, AdultsContactDetails, AdultsMealLog } from "./types";

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
    deletedAt: c.deleted_at ?? undefined,
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

/** Active (non-removed) contacts for a workspace. `supabase` should be an
 * RLS-scoped client (cookie- or bearer-token-authenticated) — this only
 * returns what that client's policies allow. */
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

/** Previously-removed family members — data preserved and viewable, but they
 * no longer count as active and can't be logged against going forward. */
export async function getRemovedContacts(workspaceId: string, supabase: SupabaseClient): Promise<AdultsContact[]> {
  const { data: contacts } = await supabase
    .from("adults_contacts")
    .select("*, goals:adults_contact_goals(*)")
    .eq("workspace_id", workspaceId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  if (!contacts?.length) return [];

  const mealsByContact = await fetchMealsByContact(supabase, contacts.map((c: any) => c.id));
  return contacts.map((c: any) => mapContactRow(c, mealsByContact));
}

/** A single contact's profile plus recent meal history, scoped to the
 * authenticated caregiver via the `caregiver_id` match below (so `supabase`
 * being RLS-scoped is not itself sufficient — this also double-checks
 * ownership explicitly, matching the pre-extraction behavior of both apps).
 * `admin` is a service-role client, used only for the human-corrections
 * lookup (meal_submissions/human_meal_reviews has no caregiver-facing RLS
 * policy). `sinceDays` bounds the meal history window — the main app widens
 * this to 400 for its date-range selector; the mobile API can pass a
 * tighter window if it doesn't need that range. */
export async function getContactDetails(
  contactId: string,
  supabase: SupabaseClient,
  admin: SupabaseClient,
  sinceDays: number
): Promise<AdultsContactDetails | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const since = new Date();
  since.setDate(since.getDate() - sinceDays);

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
  const mealsByContact = {
    [contactId]: { count: mealsRes.data?.length ?? 0, lastAt: mealsRes.data?.[0]?.logged_at },
  };
  const contact = mapContactRow(c, mealsByContact);

  const rawMeals = mealsRes.data ?? [];
  const corrections = await fetchHumanCorrectionsByMealLogId(admin, rawMeals.map((m: any) => m.id));

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
