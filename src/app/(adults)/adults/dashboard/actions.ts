"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  FAMILY_LIMIT_REACHED_MESSAGE,
  FAMILY_MONTHLY_QUOTA_REACHED_MESSAGE,
  FAMILY_MEMBER_LIMIT,
  SELF_TRACKING_LIMIT,
  effectiveFamilyLimit,
  familyLimitReachedMessage,
  familyMonthlyQuotaReachedMessage,
  startOfCalendarMonthUTC,
} from "@/lib/limits";
import { getEntitlementSnapshot, startTrialIfNeeded } from "@/lib/entitlements/entitlements";
import { FAMILY_LIMIT_ENFORCEMENT_ENABLED } from "@/lib/billing/feature-flags";
import { now } from "@/lib/time/clock";
import type { HumanCorrectionFields } from "@nutriai/dashboard-core";
import { fetchHumanCorrectionsByMealLogId } from "@/lib/nutrition/fetch-human-corrections";
import { getOrCreateInvite, findLatestInvite, regenerateInvite, revokeInvite, updateInviteMetadata, markInviteLinkOpened, toInviteSummary, withInviteErrorHandling } from "@/lib/invites/service";
import { trackInviteEvent } from "@/lib/invites/analytics";
import { findContactByWhatsappNumber } from "@/lib/end-user/otp";
import type { InviteSummary } from "@/lib/invites/types";
import {
  getContacts as getContactsCore,
  getRemovedContacts as getRemovedContactsCore,
  getOrCreateWorkspace,
} from "@nutriai/nutrition-core";
import type { AdultsContact, AdultsGoal } from "@nutriai/nutrition-core";
// AdultsContact/AdultsGoal come from @nutriai/nutrition-core, shared with
// apps/mobile-api (see packages/nutrition-core and that app's README) —
// re-exported here so existing importers of these types from this module
// don't need to change. Written as a direct `export type ... from`
// re-export (rather than `import type` + a separate `export type {}`)
// because "use server" files are scanned by Next for server-action exports
// before type erasure, and that scanner doesn't reliably recognize the
// two-statement form as type-only. AdultsMealLog/AdultsContactDetails stay
// defined locally below: they carry the human-correction fields narrowly
// typed against this app's own classification unions (PresenceStatus/
// BalanceStatus/Likelihood, see src/lib/nutrition/human-corrections.ts),
// which the shared package deliberately does not depend on.
export type { AdultsContact, AdultsGoal } from "@nutriai/nutrition-core";

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
  /** Present when a Tistra reviewer has corrected this meal's classification
   * via the Meal Review Console — dashboards should prefer this over the
   * raw AI/heuristic classification. See src/lib/nutrition/human-corrections.ts. */
  humanCorrection?: HumanCorrectionFields;
}

export interface AdultsContactDetails {
  contact: AdultsContact;
  meals: AdultsMealLog[];
}

export async function getOrCreateAdultsWorkspace(userId: string, caregiverName?: string): Promise<{ id: string; name: string; extraCapacity: number; plan: string }> {
  const admin = createServiceClient();
  const workspace = await getOrCreateWorkspace(admin, userId, "adults", caregiverName);
  return { ...workspace, plan: workspace.plan ?? "family" };
}

/** Persists self-tracking intent on the workspace as soon as it's known
 * (the ?self=1 redirect from /me/add-users), rather than waiting for
 * addSelfContact to flip it once the WhatsApp invite is actually claimed.
 * Without this, a user who lands on the dashboard again before finishing
 * self-setup (e.g. after a refresh, or skipping and coming back later) has
 * no persisted signal that they're on the self plan — the dashboard falls
 * back to family_caregiver copy ("Add someone to get started", family
 * pricing) even though they never intended to track anyone but themselves. */
export async function markWorkspaceSelfPlan(workspaceId: string): Promise<void> {
  const admin = createServiceClient();
  await admin.from("workspaces").update({ plan: "self" }).eq("id", workspaceId).eq("plan", "family");
}

export async function getContacts(workspaceId: string): Promise<AdultsContact[]> {
  const supabase = await createClient();
  return getContactsCore(workspaceId, supabase);
}

/** Previously-removed family members — data preserved and viewable, but they
 * no longer count as active and can't be logged against going forward. */
export async function getRemovedContacts(workspaceId: string): Promise<AdultsContact[]> {
  const supabase = await createClient();
  return getRemovedContactsCore(workspaceId, supabase);
}

/** Soft-delete: preserves the contact's historical data (meals, goals) while
 * freeing an *active* slot. Does not refund this calendar month's add quota
 * — see supabase/migrations/0004_soft_delete_and_monthly_quota.sql. */
export async function removeContact(contactId: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("adults_contacts")
    .update({ deleted_at: now().toISOString() })
    .eq("id", contactId)
    .eq("caregiver_id", user.id);

  if (error) throw new Error(error.message);
}

export async function getContactDetails(contactId: string): Promise<AdultsContactDetails | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Widened from a 30-day window so the dashboard's date-range selector
  // (up to "This year"/"All time") has real data to filter client-side —
  // see DateRangeSelector / getDateRangeBounds in
  // src/lib/dashboard/date-range.ts. 400 days covers a full year plus
  // slack without an unbounded query; there's no pagination here yet, so
  // this is a pragmatic cap rather than a true "all time" fetch.
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
    dateOfBirth: c.date_of_birth ?? undefined,
    metabolicEquationSex: c.metabolic_equation_sex ?? undefined,
    activityLevel: c.activity_level ?? undefined,
    resistanceTrainingStatus: c.resistance_training_status ?? undefined,
    preferredUnits: c.preferred_units ?? undefined,
    primaryNutritionGoal: c.primary_nutrition_goal ?? undefined,
    targetWeightKg: c.target_weight_kg ?? undefined,
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

export async function addContact(formData: {
  workspaceId: string;
  fullName: string;
  whatsappNumber: string;
  relationship?: string;
  relationshipType?: "self" | "family_caregiver";
  age?: number;
  gender?: string;
  weightKg?: number;
  heightCm?: number;
  healthNotes?: string;
  timezone?: string;
  remindersEnabled?: boolean;
  reminderTimes?: string[];
  /** Food Balance Score profile fields (see
   * supabase/migrations/0027_food_balance_score.sql) — replaces the old
   * adults_contact_goals checklist entirely; protein/calorie targets shown
   * on the dashboard are now computed from these via @nutriai/health-scoring
   * instead of being typed in by hand. */
  primaryNutritionGoal?: string;
  dateOfBirth?: string;
  metabolicEquationSex?: string;
  activityLevel?: string;
  resistanceTrainingStatus?: string;
  targetWeightKg?: number;
}): Promise<{ contactId: string; error?: undefined } | { contactId?: undefined; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Fast, friendly pre-check. Not authoritative on its own — the DB trigger
  // (enforce_family_member_limit, see supabase/migrations/0002_account_limits.sql
  // and 0003_purchasable_capacity.sql) is the source of truth, runs
  // unconditionally regardless of FAMILY_LIMIT_ENFORCEMENT_ENABLED, and is
  // safe under concurrent requests via an advisory lock. This block only
  // avoids a round-trip + raw Postgres error in the common (non-racing)
  // case, and can be turned off via the flag without weakening the actual
  // server-authoritative limit.
  if (FAMILY_LIMIT_ENFORCEMENT_ENABLED) {
    const monthStart = startOfCalendarMonthUTC(now()).toISOString();
    // extra_capacity is read via the service-role client, not the
    // RLS-bound `supabase` client above — the "workspaces: member access"
    // RLS policy requires a workspace_members row that workspace creation
    // never inserts for the owner, so this select would otherwise always
    // return no row and silently default extra_capacity to 0, blocking
    // purchased-capacity customers at the base limit regardless of what
    // they actually paid for. This value isn't user-sensitive, so bypassing
    // RLS here (same pattern as getOrCreateAdultsWorkspace) is safe.
    const { createClient: createServiceClient } = await import("@supabase/supabase-js");
    const admin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const [{ count: activeCount }, { count: monthCount }, { data: workspace }] = await Promise.all([
      supabase
        .from("adults_contacts")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", formData.workspaceId)
        .is("deleted_at", null),
      supabase
        .from("adults_contacts")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", formData.workspaceId)
        .gte("created_at", monthStart),
      admin
        .from("workspaces")
        .select("extra_capacity, plan")
        .eq("id", formData.workspaceId)
        .single(),
    ]);

    // Self-tracking workspaces (workspaces.plan = 'self', see migration
    // 0010) include 1 person by default instead of the family plan's 2 —
    // must match the base_limit branch in enforce_family_member_limit
    // exactly, or the friendly pre-check message and the DB trigger's
    // actual enforcement would disagree.
    const basePeopleIncluded = workspace?.plan === "self" ? SELF_TRACKING_LIMIT : FAMILY_MEMBER_LIMIT;
    const limit = effectiveFamilyLimit(workspace?.extra_capacity ?? 0, basePeopleIncluded);
    if ((activeCount ?? 0) >= limit) {
      return { error: familyLimitReachedMessage(limit) };
    }
    // Removing a family member frees an active slot but does not refund this
    // month's add quota — a new add is only allowed once the calendar month
    // rolls over. See supabase/migrations/0004_soft_delete_and_monthly_quota.sql.
    if ((monthCount ?? 0) >= limit) {
      return { error: familyMonthlyQuotaReachedMessage(limit) };
    }
  }

  // Server-authoritative: block adding new family members once the trial
  // (or a paid period) has lapsed, regardless of what the UI shows.
  const entitlement = await getEntitlementSnapshot(formData.workspaceId, "adults");
  if (entitlement.isReadOnly) {
    return { error: "Your Family trial has ended. Subscribe to add more family members." };
  }

  // A number already registered as a gym client (or another adults contact)
  // can't be added again — the WhatsApp bot resolves a number to exactly one
  // entity, and a shared number previously caused the conversation lock to
  // get stuck permanently (see src/lib/whatsapp/conversation-handler.ts).
  const existingContact = await findContactByWhatsappNumber(formData.whatsappNumber);
  if (existingContact) {
    return {
      error:
        existingContact.contactType === "gym"
          ? "This WhatsApp number is already registered as a coaching client."
          : "This WhatsApp number is already registered as a family member.",
    };
  }

  const { data: contact, error } = await supabase
    .from("adults_contacts")
    .insert({
      workspace_id: formData.workspaceId,
      caregiver_id: user.id,
      full_name: formData.fullName,
      whatsapp_number: formData.whatsappNumber,
      relationship: formData.relationship || null,
      relationship_type: formData.relationshipType ?? "family_caregiver",
      age: formData.age || null,
      gender: formData.gender || null,
      weight_kg: formData.weightKg || null,
      height_cm: formData.heightCm || null,
      health_notes: formData.healthNotes || null,
      invite_sent_at: new Date().toISOString(),
      ...(formData.timezone ? { timezone: formData.timezone } : {}),
      reminders_enabled: formData.remindersEnabled ?? false,
      ...(formData.reminderTimes ? { reminder_times: formData.reminderTimes } : {}),
      primary_nutrition_goal: formData.primaryNutritionGoal || null,
      date_of_birth: formData.dateOfBirth || null,
      metabolic_equation_sex: formData.metabolicEquationSex || null,
      activity_level: formData.activityLevel || null,
      resistance_training_status: formData.resistanceTrainingStatus || null,
      target_weight_kg: formData.targetWeightKg || null,
    })
    .select("id")
    .single();

  if (error?.message?.includes("FAMILY_MEMBER_LIMIT_REACHED")) {
    return { error: FAMILY_LIMIT_REACHED_MESSAGE };
  }
  if (error?.message?.includes("FAMILY_MEMBER_MONTHLY_QUOTA_REACHED")) {
    return { error: FAMILY_MONTHLY_QUOTA_REACHED_MESSAGE };
  }
  if (error || !contact) throw new Error(error?.message ?? "Failed to add contact");

  // Starts the Family trial on first successful add; a no-op for every
  // subsequent contact (see startTrialIfNeeded — idempotent per workspace).
  await startTrialIfNeeded(formData.workspaceId, user.id, "adults");

  try {
    await sendContactInvite(supabase, user.id, formData.fullName, formData.whatsappNumber);
  } catch {
    // Don't fail contact creation if the initial invite send fails — the
    // caregiver can retry via resendContactInvite. sendContactInvite already
    // logs the underlying error.
  }

  return { contactId: contact.id };
}

/** Self-tracking onboarding: creates the signed-up user's own tracked
 * profile (relationship_type "self") on the workspace they already own —
 * reuses the exact same insert/limit/trial/invite path as addContact
 * rather than a parallel system, per the self-tracking design principle. */
export async function addSelfContact(
  workspaceId: string,
  fullName: string,
  whatsappNumber: string
): Promise<{ contactId: string; error?: undefined } | { contactId?: undefined; error: string }> {
  // Mark the workspace as self-plan BEFORE the add, so the pre-check and
  // the DB trigger both see basePeopleIncluded=1 for this very insert (see
  // migration 0010) rather than the default family base of 2.
  const { createClient: createServiceClient } = await import("@supabase/supabase-js");
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  await admin.from("workspaces").update({ plan: "self" }).eq("id", workspaceId);

  return addContact({ workspaceId, fullName, whatsappNumber, relationshipType: "self" });
}

// Meta requires the FIRST message to someone who hasn't messaged your
// business number yet to be a pre-approved template — free-form text is
// rejected for that case in both test and production WhatsApp Business
// Accounts. See WHATSAPP_INVITE_TEMPLATE_NAME in .env.example for the
// template this expects (2 body params: first name, caregiver name) and
// its suggested approval-request body text. Shared by addContact (initial
// invite, failure swallowed there) and resendContactInvite (manual resend,
// failure surfaced to the UI there) — this function itself always throws
// on failure; each caller decides whether to swallow or propagate it.
async function sendContactInvite(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  contactFullName: string,
  whatsappNumber: string
): Promise<void> {
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", userId).single();
  // profiles.full_name sometimes ends up populated from the raw auth email
  // (which for the adults product is "+nutriai-adults"-scoped, see
  // scopedEmail in src/lib/auth.ts) rather than a real name — never let
  // that leak into an outbound WhatsApp message.
  const rawName = profile?.full_name ?? "";
  const caregiverName = rawName && !/[@+]/.test(rawName) ? rawName : "Your family member";
  const firstName = contactFullName.split(" ")[0];
  const templateName = process.env.WHATSAPP_INVITE_TEMPLATE_NAME;

  try {
    if (templateName) {
      const { sendTemplateMessage } = await import("@/lib/whatsapp/client");
      await sendTemplateMessage(
        whatsappNumber,
        templateName,
        process.env.WHATSAPP_INVITE_TEMPLATE_LANGUAGE ?? "en_US",
        [firstName, caregiverName]
      );
    } else {
      // No approved template configured yet — best-effort free-form send,
      // which Meta will reject for a genuinely new contact. Kept as a
      // fallback for dev numbers that have already messaged the bot once.
      const { sendTextMessage } = await import("@/lib/whatsapp/client");
      await sendTextMessage(
        whatsappNumber,
        `Hi ${firstName}! 👋\n\n${caregiverName} has set up Tistra Health to help keep an eye on your nutrition.\n\nAll you need to do is send me a photo or describe what you eat — right here on WhatsApp. I'll keep track for you!\n\nWhenever you're ready, just send me a photo of your next meal 😊`
      );
    }
  } catch (err) {
    console.error("[sendContactInvite] WhatsApp invite send failed:", err instanceof Error ? err.message : err);
    throw err;
  }
}

/** Edit an existing contact's name and profile details. These fields also
 * drive the default protein recommendation (see
 * src/lib/nutrition/protein-recommendation.ts) when no goal is manually set,
 * so keeping them current directly improves that suggestion. */
export async function updateContact(
  contactId: string,
  formData: {
    fullName: string;
    relationship?: string;
    age?: number;
    gender?: string;
    weightKg?: number;
    heightCm?: number;
    healthNotes?: string;
    timezone?: string;
    remindersEnabled?: boolean;
    reminderTimes?: string[];
    /** Food Balance Score profile fields — see addContact's own comment on
     * these; replaces the old adults_contact_goals-based upsertContactGoal
     * entirely (targets are now computed, not typed in). */
    primaryNutritionGoal?: string;
    dateOfBirth?: string;
    metabolicEquationSex?: string;
    activityLevel?: string;
    resistanceTrainingStatus?: string;
    targetWeightKg?: number;
  }
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("adults_contacts")
    .update({
      full_name: formData.fullName,
      relationship: formData.relationship || null,
      age: formData.age || null,
      gender: formData.gender || null,
      weight_kg: formData.weightKg || null,
      height_cm: formData.heightCm || null,
      health_notes: formData.healthNotes || null,
      ...(formData.timezone ? { timezone: formData.timezone } : {}),
      ...(formData.remindersEnabled !== undefined ? { reminders_enabled: formData.remindersEnabled } : {}),
      ...(formData.reminderTimes ? { reminder_times: formData.reminderTimes } : {}),
      primary_nutrition_goal: formData.primaryNutritionGoal || null,
      date_of_birth: formData.dateOfBirth || null,
      metabolic_equation_sex: formData.metabolicEquationSex || null,
      activity_level: formData.activityLevel || null,
      resistance_training_status: formData.resistanceTrainingStatus || null,
      target_weight_kg: formData.targetWeightKg || null,
    })
    .eq("id", contactId)
    .eq("caregiver_id", user.id);

  if (error) return { error: error.message };
  return {};
}

/** Saves the "Food preferences" editor's choices — an explicit user
 * statement always outranks anything inferred from logged meals (see
 * @/lib/dietary-profile's applyExplicitPreferences). Only the fields the
 * caller actually passed are changed, so partial saves from the editor
 * never clear unrelated preferences. */
export async function updateFoodPreferences(
  contactId: string,
  selections: import("@/lib/dietary-profile").FoodPreferenceSelections
): Promise<{ error?: string }> {
  const { applyExplicitPreferences, DEFAULT_DIETARY_PROFILE } = await import("@/lib/dietary-profile");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: contactRow, error: readError } = await supabase
    .from("adults_contacts")
    .select("dietary_profile")
    .eq("id", contactId)
    .eq("caregiver_id", user.id)
    .single();
  if (readError || !contactRow) return { error: readError?.message ?? "Contact not found" };

  const currentProfile = { ...DEFAULT_DIETARY_PROFILE, ...(contactRow.dietary_profile ?? {}) };
  const nextProfile = applyExplicitPreferences(currentProfile, selections);

  const { error } = await supabase
    .from("adults_contacts")
    .update({ dietary_profile: nextProfile })
    .eq("id", contactId)
    .eq("caregiver_id", user.id);

  if (error) return { error: error.message };
  return {};
}

export async function getFoodPreferences(contactId: string): Promise<import("@/lib/dietary-profile").DietaryProfile> {
  const { DEFAULT_DIETARY_PROFILE } = await import("@/lib/dietary-profile");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: contactRow } = await supabase
    .from("adults_contacts")
    .select("dietary_profile")
    .eq("id", contactId)
    .eq("caregiver_id", user.id)
    .single();

  return { ...DEFAULT_DIETARY_PROFILE, ...(contactRow?.dietary_profile ?? {}) };
}

/** Records feedback on a Food Balance Recommendation's shown foods
 * ("Helpful", "I don't like this food", "Not available where I live",
 * etc. — see src/lib/food-balance/feedback.ts) so future recommendations
 * respect it. */
export async function recordFoodSuggestionFeedback(
  contactId: string,
  feedback: import("@/lib/food-balance/feedback").RecommendationFeedback,
  foodIds: string[]
): Promise<{ error?: string }> {
  const { applyRecommendationFeedback } = await import("@/lib/food-balance/feedback");
  const { DEFAULT_DIETARY_PROFILE } = await import("@/lib/dietary-profile");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: contactRow, error: readError } = await supabase
    .from("adults_contacts")
    .select("dietary_profile")
    .eq("id", contactId)
    .eq("caregiver_id", user.id)
    .single();
  if (readError || !contactRow) return { error: readError?.message ?? "Contact not found" };

  const currentProfile = { ...DEFAULT_DIETARY_PROFILE, ...(contactRow.dietary_profile ?? {}) };
  const nextProfile = applyRecommendationFeedback(currentProfile, feedback, foodIds);

  const { error } = await supabase
    .from("adults_contacts")
    .update({ dietary_profile: nextProfile })
    .eq("id", contactId)
    .eq("caregiver_id", user.id);

  if (error) return { error: error.message };
  return {};
}

/** Manually resend the WhatsApp invite to an existing family member —
 * e.g. if they never received or missed the original invite. Does not
 * create a new contact or affect the monthly add quota. */
export async function resendContactInvite(contactId: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: contact } = await supabase
    .from("adults_contacts")
    .select("full_name, whatsapp_number")
    .eq("id", contactId)
    .eq("caregiver_id", user.id)
    .single();

  if (!contact) throw new Error("Contact not found");

  await sendContactInvite(supabase, user.id, contact.full_name, contact.whatsapp_number);
  await supabase.from("adults_contacts").update({ invite_sent_at: now().toISOString() }).eq("id", contactId);
}

// -----------------------------------------------------------------------
// WhatsApp-first invites (see src/lib/invites) — the caregiver shares a
// wa.me link themselves rather than the bot sending the first message,
// which needs neither an approved template nor business verification.
// sendContactInvite above remains as a best-effort supplementary channel
// (harmless if it fails) but is no longer the primary onboarding path.
// -----------------------------------------------------------------------

/** Gets the family member's existing pending/claimed invite, or creates a
 * fresh one if none exists (or the last one expired/was revoked). */
export async function getOrCreateFamilyInvite(contactId: string): Promise<InviteSummary | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Your session has expired. Please sign in again." };

  const { data: contact } = await supabase
    .from("adults_contacts")
    .select("id, workspace_id, full_name")
    .eq("id", contactId)
    .eq("caregiver_id", user.id)
    .single();
  if (!contact) return { error: "Contact not found" };

  return withInviteErrorHandling(async () => {
    const admin = createServiceClient();
    const existing = await findLatestInvite(admin, { workspaceId: contact.workspace_id, inviteType: "family", targetProfileId: contactId });
    const invite = await getOrCreateInvite(
      admin,
      { workspaceId: contact.workspace_id, inviteType: "family", targetProfileId: contactId },
      { inviteType: "family", createdByUserId: user.id, workspaceId: contact.workspace_id, targetProfileId: contactId }
    );
    if (!existing || existing.id !== invite.id) trackInviteEvent("invite_created", { inviteType: "family", contactId });
    return toInviteSummary(invite, contact.full_name.split(" ")[0]);
  });
}

export async function regenerateFamilyInvite(contactId: string): Promise<InviteSummary | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Your session has expired. Please sign in again." };

  const { data: contact } = await supabase
    .from("adults_contacts")
    .select("id, workspace_id, full_name")
    .eq("id", contactId)
    .eq("caregiver_id", user.id)
    .single();
  if (!contact) return { error: "Contact not found" };

  return withInviteErrorHandling(async () => {
    const admin = createServiceClient();
    const current = await findLatestInvite(admin, { workspaceId: contact.workspace_id, inviteType: "family", targetProfileId: contactId });
    if (!current) return { error: "No invite to regenerate" };

    const fresh = await regenerateInvite(admin, current);
    trackInviteEvent("invite_regenerated", { inviteType: "family", contactId });
    return toInviteSummary(fresh, contact.full_name.split(" ")[0]);
  });
}

export async function revokeFamilyInvite(contactId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Your session has expired. Please sign in again." };

  const { data: contact } = await supabase
    .from("adults_contacts")
    .select("id, workspace_id")
    .eq("id", contactId)
    .eq("caregiver_id", user.id)
    .single();
  if (!contact) return { error: "Contact not found" };

  return withInviteErrorHandling(async () => {
    const admin = createServiceClient();
    const current = await findLatestInvite(admin, { workspaceId: contact.workspace_id, inviteType: "family", targetProfileId: contactId });
    if (!current) return { error: "No invite to revoke" };

    await revokeInvite(admin, current.id);
    trackInviteEvent("invite_revoked", { inviteType: "family", contactId });
    return { ok: true } as const;
  });
}

/** Marks that the caregiver actually clicked "Send invite on WhatsApp" or
 * "Copy invite link" for this contact — see markInviteLinkOpened. Lets the
 * dashboard tell "just generated, nothing sent yet" apart from "already
 * sent, no action needed" on a later visit. */
export async function markFamilyInviteLinkOpened(contactId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Your session has expired. Please sign in again." };

  const { data: contact } = await supabase
    .from("adults_contacts")
    .select("id, workspace_id")
    .eq("id", contactId)
    .eq("caregiver_id", user.id)
    .single();
  if (!contact) return { error: "Contact not found" };

  return withInviteErrorHandling(async () => {
    const admin = createServiceClient();
    const current = await findLatestInvite(admin, { workspaceId: contact.workspace_id, inviteType: "family", targetProfileId: contactId });
    if (current) await markInviteLinkOpened(admin, current.id);
    return { ok: true } as const;
  });
}

/** Self-tracking invite: unlike family/coach_client, there's no existing
 * adults_contacts row to attach this to — that row is only created once
 * the invite is claimed (see handleInviteClaim in conversation-handler.ts),
 * since asking someone to type their own WhatsApp number into a form
 * before messaging from that very number is redundant. */
export interface SelfDetails {
  fullName: string;
  age?: number;
  gender?: string;
  weightKg?: number;
  heightCm?: number;
  healthNotes?: string;
  /** Food Balance Score profile fields — see addContact's comment on these;
   * materialized into adults_contacts columns at claim time (see
   * handleInviteClaim in conversation-handler.ts), same as the rest of
   * SelfDetails. */
  primaryNutritionGoal?: string;
  dateOfBirth?: string;
  metabolicEquationSex?: string;
  activityLevel?: string;
  resistanceTrainingStatus?: string;
  targetWeightKg?: number;
}

/** Self-tracking's equivalent of addContact — but since there's no
 * adults_contacts row until the WhatsApp invite is actually claimed (no
 * phone number to key it on yet), these details are stashed in the
 * invite's metadata instead and only materialized into a real contact +
 * goal row at claim time (see handleInviteClaim in conversation-handler.ts).
 * The WhatsApp invite link is deliberately not generated until this has
 * been called at least once, so the bot always has real details to work
 * with rather than creating a bare, unconfigured self profile. */
export async function saveSelfDetailsAndCreateInvite(workspaceId: string, details: SelfDetails): Promise<InviteSummary | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Your session has expired. Please sign in again." };

  return withInviteErrorHandling(async () => {
    const admin = createServiceClient();
    const metadata = { ...details };
    const existing = await findLatestInvite(admin, { workspaceId, inviteType: "self", createdByUserId: user.id });

    if (existing && existing.status === "pending") {
      await updateInviteMetadata(admin, existing.id, metadata);
      const refreshed = await findLatestInvite(admin, { workspaceId, inviteType: "self", createdByUserId: user.id });
      return toInviteSummary(refreshed!);
    }

    const invite = await getOrCreateInvite(
      admin,
      { workspaceId, inviteType: "self", createdByUserId: user.id },
      { inviteType: "self", createdByUserId: user.id, workspaceId, metadata }
    );
    trackInviteEvent("invite_created", { inviteType: "self" });
    return toInviteSummary(invite);
  });
}

export async function getOrCreateSelfInvite(workspaceId: string, displayName?: string): Promise<InviteSummary | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Your session has expired. Please sign in again." };

  return withInviteErrorHandling(async () => {
    const admin = createServiceClient();
    const existing = await findLatestInvite(admin, { workspaceId, inviteType: "self", createdByUserId: user.id });
    const invite = await getOrCreateInvite(
      admin,
      { workspaceId, inviteType: "self", createdByUserId: user.id },
      { inviteType: "self", createdByUserId: user.id, workspaceId, metadata: displayName ? { fullName: displayName } : {} }
    );
    if (!existing || existing.id !== invite.id) trackInviteEvent("invite_created", { inviteType: "self" });
    return toInviteSummary(invite);
  });
}

export async function regenerateSelfInvite(workspaceId: string): Promise<InviteSummary | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Your session has expired. Please sign in again." };

  return withInviteErrorHandling(async () => {
    const admin = createServiceClient();
    const current = await findLatestInvite(admin, { workspaceId, inviteType: "self", createdByUserId: user.id });
    if (!current) return { error: "No invite to regenerate" };

    const fresh = await regenerateInvite(admin, current);
    trackInviteEvent("invite_regenerated", { inviteType: "self" });
    return toInviteSummary(fresh);
  });
}

/** See markFamilyInviteLinkOpened — self-invite equivalent. */
export async function markSelfInviteLinkOpened(workspaceId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Your session has expired. Please sign in again." };

  return withInviteErrorHandling(async () => {
    const admin = createServiceClient();
    const current = await findLatestInvite(admin, { workspaceId, inviteType: "self", createdByUserId: user.id });
    if (current) await markInviteLinkOpened(admin, current.id);
    return { ok: true } as const;
  });
}

// -----------------------------------------------------------------------
// Temporary Access Codes — Beta-safe participant login fallback that
// doesn't depend on WhatsApp/SMS OTP delivery (see @/lib/end-user/otp's
// generateAccessCode). A family owner generates a one-time code here and
// shares it manually (usually over WhatsApp); the participant enters it
// on /my-progress, the exact same screen used for OTP.
// -----------------------------------------------------------------------

export interface AccessCodeResult {
  code: string;
  formattedCode: string;
  expiresAt: string;
  error?: undefined;
}

function formatAccessCode(code: string): string {
  // "482913" -> "482 913" (spec's display format) — only meaningful for
  // 6-digit codes; longer/shorter codes are left unspaced rather than
  // guessing a grouping.
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

async function requireOwnedAdultsContact(contactId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: contactRow } = await supabase
    .from("adults_contacts")
    .select("id, full_name, whatsapp_number")
    .eq("id", contactId)
    .eq("caregiver_id", user.id)
    .maybeSingle();
  if (!contactRow || !contactRow.whatsapp_number) return { user, contact: null };

  return {
    user,
    contact: {
      contactId: contactRow.id,
      contactType: "adults" as const,
      whatsappNumber: contactRow.whatsapp_number as string,
      fullName: contactRow.full_name as string,
    },
  };
}

export async function generateAccessCodeAction(contactId: string, ttlHours: 1 | 24 = 24): Promise<AccessCodeResult | { error: string }> {
  const { generateAccessCode } = await import("@/lib/end-user/otp");
  const { user, contact } = await requireOwnedAdultsContact(contactId);
  if (!contact) return { error: "Contact not found, or missing a WhatsApp number." };

  const { code, expiresAt } = await generateAccessCode(contact, user.id, "family_owner", ttlHours * 60 * 60 * 1000);
  return { code, formattedCode: formatAccessCode(code), expiresAt };
}

export async function regenerateAccessCodeAction(contactId: string, ttlHours: 1 | 24 = 24): Promise<AccessCodeResult | { error: string }> {
  const { regenerateAccessCode } = await import("@/lib/end-user/otp");
  const { user, contact } = await requireOwnedAdultsContact(contactId);
  if (!contact) return { error: "Contact not found, or missing a WhatsApp number." };

  const { code, expiresAt } = await regenerateAccessCode(contact, user.id, "family_owner", ttlHours * 60 * 60 * 1000);
  return { code, formattedCode: formatAccessCode(code), expiresAt };
}

export async function revokeAccessCodeAction(contactId: string): Promise<{ ok: boolean }> {
  const { revokeAccessCode } = await import("@/lib/end-user/otp");
  const { user, contact } = await requireOwnedAdultsContact(contactId);
  if (!contact) return { ok: false };

  await revokeAccessCode(contact, user.id);
  return { ok: true };
}
