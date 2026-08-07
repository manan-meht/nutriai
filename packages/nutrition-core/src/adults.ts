import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchHumanCorrectionsByMealLogId } from "./human-corrections";
import { resolveSignedMealPhotoUrls, resolveSignedContactAvatarUrl } from "./storage";
import { computeMacroWindowSummaries, computeDailyCalories, computeRollingWeekMealCount } from "./macro-summary";
import type { AdultsContact, AdultsContactDetails, AdultsMealLog } from "./types";

interface ContactMealSummary {
  count: number;
  lastAt?: string;
  /** Raw stored path/URL of the most recent meal's photo (first row, since
   * fetchMealsByContact orders by logged_at desc) — signed in bulk by
   * fetchLastMealPhotosByContact, same pattern as fetchAvatarsByContact.
   * Undefined if that meal has no photo, in which case the dashboard shows
   * a placeholder rather than omitting the "Last meal" slot entirely. */
  lastImageUrl?: string;
  mealRows: Array<{
    logged_at: string;
    total_calories_min: number | null;
    total_calories_max: number | null;
    total_protein_min: number | null;
    total_protein_max: number | null;
    total_carbs_min: number | null;
    total_carbs_max: number | null;
    total_fat_min: number | null;
    total_fat_max: number | null;
  }>;
}

function mapContactRow(
  c: any,
  mealsByContact: Record<string, ContactMealSummary>,
  lastMessageByContact: Record<string, string> = {},
  photoUrlByContact: Record<string, string> = {},
  lastMealPhotoByContact: Record<string, string> = {}
): AdultsContact {
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
    lastMessageAt: lastMessageByContact[c.id],
    createdAt: c.created_at,
    deletedAt: c.deleted_at ?? undefined,
    trackedBiomarkers: c.tracked_biomarkers ?? [],
    mealCount: mealsByContact[c.id]?.count ?? 0,
    lastMealAt: mealsByContact[c.id]?.lastAt,
    photoUrl: photoUrlByContact[c.id],
    lastMealPhotoUrl: lastMealPhotoByContact[c.id],
    macroSummary: computeMacroWindowSummaries(mealsByContact[c.id]?.mealRows ?? [], c.timezone ?? "Asia/Kolkata"),
    last7DaysCalories: computeDailyCalories(mealsByContact[c.id]?.mealRows ?? [], c.timezone ?? "Asia/Kolkata"),
    last7DaysMealCount: computeRollingWeekMealCount(mealsByContact[c.id]?.mealRows ?? [], c.timezone ?? "Asia/Kolkata"),
    timezone: c.timezone ?? "Asia/Kolkata",
    remindersEnabled: c.reminders_enabled ?? false,
    reminderTimes: Array.isArray(c.reminder_times) ? c.reminder_times : ["08:00", "12:00", "19:00"],
    dateOfBirth: c.date_of_birth ?? undefined,
    metabolicEquationSex: c.metabolic_equation_sex ?? undefined,
    activityLevel: c.activity_level ?? undefined,
    resistanceTrainingStatus: c.resistance_training_status ?? undefined,
    dailyMovementLevel: c.daily_movement_level ?? undefined,
    weeklyModerateActivity: c.weekly_moderate_activity ?? undefined,
    strengthExerciseFrequency: c.strength_exercise_frequency ?? undefined,
    derivedActivityLevel: c.derived_activity_level ?? undefined,
    activityProfileMigrated: c.activity_profile_migrated ?? false,
    preferredUnits: c.preferred_units ?? undefined,
    nutritionGoals: c.nutrition_goals ?? [],
    targetWeightKg: c.target_weight_kg ?? undefined,
    customMacroTargets: c.custom_macro_targets ?? undefined,
    macroTargetsCustomizedAt: c.macro_targets_customized_at ?? undefined,
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

async function fetchMealsByContact(supabase: SupabaseClient, contactIds: string[]): Promise<Record<string, ContactMealSummary>> {
  const { data: meals } = await supabase
    .from("meal_logs")
    .select(
      "adults_contact_id, logged_at, image_url, total_calories_min, total_calories_max, total_protein_min, total_protein_max, total_carbs_min, total_carbs_max, total_fat_min, total_fat_max"
    )
    .in("adults_contact_id", contactIds)
    .order("logged_at", { ascending: false });

  const mealsByContact: Record<string, ContactMealSummary> = {};
  for (const m of meals ?? []) {
    if (!m.adults_contact_id) continue;
    if (!mealsByContact[m.adults_contact_id]) {
      mealsByContact[m.adults_contact_id] = { count: 0, lastAt: m.logged_at, lastImageUrl: m.image_url ?? undefined, mealRows: [] };
    }
    mealsByContact[m.adults_contact_id].count++;
    mealsByContact[m.adults_contact_id].mealRows.push(m);
  }
  return mealsByContact;
}

/** Signs the most recent meal photo (see ContactMealSummary.lastImageUrl)
 * per contact in one batch, same pattern as fetchAvatarsByContact — meal-
 * photos is a private bucket (0040_private_meal_photos.sql). */
async function fetchLastMealPhotosByContact(admin: SupabaseClient, mealsByContact: Record<string, ContactMealSummary>): Promise<Record<string, string>> {
  const contactIds = Object.keys(mealsByContact);
  const signedUrls = await resolveSignedMealPhotoUrls(admin, contactIds.map((id) => mealsByContact[id].lastImageUrl));
  const byContact: Record<string, string> = {};
  contactIds.forEach((id, i) => {
    if (signedUrls[i]) byContact[id] = signedUrls[i] as string;
  });
  return byContact;
}

/** whatsapp_conversations has RLS enabled with no policies (service-role
 * only, same "internal-only table" convention as payment_webhook_events)
 * — needs the admin client, unlike everything else getContacts reads,
 * which is fine through the RLS-scoped caregiver session. */
async function fetchLastMessageByContact(admin: SupabaseClient, contactIds: string[]): Promise<Record<string, string>> {
  const { data } = await admin
    .from("whatsapp_conversations")
    .select("adults_contact_id, last_message_at")
    .in("adults_contact_id", contactIds);

  const byContact: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.adults_contact_id && row.last_message_at) byContact[row.adults_contact_id] = row.last_message_at;
  }
  return byContact;
}

/** contact-avatars is a private bucket from the outset (see
 * 0049_contact_avatars.sql) — resolves every contact's stored photo_url
 * path to a short-lived signed URL in one batch, service-role only, same
 * convention as fetchLastMessageByContact. */
async function fetchAvatarsByContact(admin: SupabaseClient, contacts: any[]): Promise<Record<string, string>> {
  const signedUrls = await Promise.all(contacts.map((c) => resolveSignedContactAvatarUrl(admin, c.photo_url)));
  const byContact: Record<string, string> = {};
  contacts.forEach((c, i) => {
    if (signedUrls[i]) byContact[c.id] = signedUrls[i] as string;
  });
  return byContact;
}

/** Active (non-removed) contacts for a workspace. `supabase` should be an
 * RLS-scoped client (cookie- or bearer-token-authenticated) — this only
 * returns what that client's policies allow. `admin` is a service-role
 * client, used only for the whatsapp_conversations lookup (see
 * fetchLastMessageByContact's own doc comment). */
export async function getContacts(workspaceId: string, supabase: SupabaseClient, admin: SupabaseClient): Promise<AdultsContact[]> {
  const { data: contacts } = await supabase
    .from("adults_contacts")
    .select("*, goals:adults_contact_goals(*)")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (!contacts?.length) return [];

  const contactIds = contacts.map((c: any) => c.id);
  const mealsByContact = await fetchMealsByContact(supabase, contactIds);
  const [lastMessageByContact, photoUrlByContact, lastMealPhotoByContact] = await Promise.all([
    fetchLastMessageByContact(admin, contactIds),
    fetchAvatarsByContact(admin, contacts),
    fetchLastMealPhotosByContact(admin, mealsByContact),
  ]);
  return contacts.map((c: any) => mapContactRow(c, mealsByContact, lastMessageByContact, photoUrlByContact, lastMealPhotoByContact));
}

/** Previously-removed family members — data preserved and viewable, but they
 * no longer count as active and can't be logged against going forward. */
export async function getRemovedContacts(workspaceId: string, supabase: SupabaseClient, admin: SupabaseClient): Promise<AdultsContact[]> {
  const { data: contacts } = await supabase
    .from("adults_contacts")
    .select("*, goals:adults_contact_goals(*)")
    .eq("workspace_id", workspaceId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  if (!contacts?.length) return [];

  const contactIds = contacts.map((c: any) => c.id);
  const mealsByContact = await fetchMealsByContact(supabase, contactIds);
  const [lastMessageByContact, photoUrlByContact, lastMealPhotoByContact] = await Promise.all([
    fetchLastMessageByContact(admin, contactIds),
    fetchAvatarsByContact(admin, contacts),
    fetchLastMealPhotosByContact(admin, mealsByContact),
  ]);
  return contacts.map((c: any) => mapContactRow(c, mealsByContact, lastMessageByContact, photoUrlByContact, lastMealPhotoByContact));
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
  const mealsByContact: Record<string, ContactMealSummary> = {
    [contactId]: { count: mealsRes.data?.length ?? 0, lastAt: mealsRes.data?.[0]?.logged_at, mealRows: mealsRes.data ?? [] },
  };
  const [lastMessageByContact, photoUrlByContact, lastMealPhotoByContact] = await Promise.all([
    fetchLastMessageByContact(admin, [contactId]),
    fetchAvatarsByContact(admin, [c]),
    fetchLastMealPhotosByContact(admin, mealsByContact),
  ]);
  const contact = mapContactRow(c, mealsByContact, lastMessageByContact, photoUrlByContact, lastMealPhotoByContact);

  const rawMeals = mealsRes.data ?? [];
  const [corrections, signedImageUrls] = await Promise.all([
    fetchHumanCorrectionsByMealLogId(admin, rawMeals.map((m: any) => m.id)),
    // meal-photos is a private bucket (see 0040_private_meal_photos.sql) —
    // resolve each stored path/legacy-URL to a short-lived signed URL here,
    // server-side with the service-role client, rather than exposing the
    // raw storage path or relying on public bucket access.
    resolveSignedMealPhotoUrls(admin, rawMeals.map((m: any) => m.image_url)),
  ]);

  const meals: AdultsMealLog[] = rawMeals.map((m: any, i: number) => ({
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
    imageUrl: signedImageUrls[i],
    humanCorrection: corrections[m.id],
  }));

  return { contact, meals };
}
