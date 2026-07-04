"use server";

import { createClient } from "@/lib/supabase/server";
import {
  FAMILY_LIMIT_REACHED_MESSAGE,
  FAMILY_MONTHLY_QUOTA_REACHED_MESSAGE,
  effectiveFamilyLimit,
  familyLimitReachedMessage,
  familyMonthlyQuotaReachedMessage,
  startOfCalendarMonthUTC,
} from "@/lib/limits";
import { getEntitlementSnapshot, startTrialIfNeeded } from "@/lib/entitlements/entitlements";
import { FAMILY_LIMIT_ENFORCEMENT_ENABLED } from "@/lib/billing/feature-flags";
import { now } from "@/lib/time/clock";

export interface AdultsContact {
  id: string;
  workspaceId: string;
  fullName: string;
  whatsappNumber: string;
  relationship?: string;
  age?: number;
  gender?: "male" | "female" | "other";
  weightKg?: number;
  heightCm?: number;
  healthNotes?: string;
  inviteSentAt?: string;
  inviteAcceptedAt?: string;
  createdAt: string;
  deletedAt?: string;
  trackedBiomarkers: string[];
  goals: AdultsGoal[];
  mealCount: number;
  lastMealAt?: string;
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
  aiSummary?: string;
}

export interface AdultsContactDetails {
  contact: AdultsContact;
  meals: AdultsMealLog[];
}

export async function getOrCreateAdultsWorkspace(userId: string, caregiverName?: string): Promise<{ id: string; name: string; extraCapacity: number }> {
  const { createClient: createServiceClient } = await import("@supabase/supabase-js");
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: existing } = await admin
    .from("workspaces")
    .select("id, name, extra_capacity")
    .eq("owner_id", userId)
    .eq("type", "adults")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (existing) return { id: existing.id, name: existing.name, extraCapacity: existing.extra_capacity ?? 0 };

  const name = `${caregiverName ?? "My"}'s Family`;
  const slug = `adults-${userId.slice(0, 8)}-${Date.now()}`;

  const { data: created, error } = await admin
    .from("workspaces")
    .insert({ type: "adults", name, slug, owner_id: userId })
    .select("id, name, extra_capacity")
    .single();

  if (error || !created) throw new Error(`Failed to create workspace: ${error?.message}`);
  return { id: created.id, name: created.name, extraCapacity: created.extra_capacity ?? 0 };
}

function mapContactRow(c: any, mealsByContact: Record<string, { count: number; lastAt?: string }>): AdultsContact {
  return {
    id: c.id,
    workspaceId: c.workspace_id,
    fullName: c.full_name,
    whatsappNumber: c.whatsapp_number,
    relationship: c.relationship,
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

async function fetchMealsByContact(supabase: Awaited<ReturnType<typeof createClient>>, contactIds: string[]) {
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

export async function getContacts(workspaceId: string): Promise<AdultsContact[]> {
  const supabase = await createClient();

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
export async function getRemovedContacts(workspaceId: string): Promise<AdultsContact[]> {
  const supabase = await createClient();

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

  const since = new Date();
  since.setDate(since.getDate() - 30);

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

  const meals: AdultsMealLog[] = (mealsRes.data ?? []).map((m: any) => ({
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
    aiSummary: m.ai_summary,
  }));

  return { contact, meals };
}

export async function addContact(formData: {
  workspaceId: string;
  fullName: string;
  whatsappNumber: string;
  relationship?: string;
  age?: number;
  gender?: string;
  weightKg?: number;
  heightCm?: number;
  healthNotes?: string;
  goalType?: string;
  goalTitle?: string;
  goalDescription?: string;
  targetCaloriesMin?: number;
  targetCaloriesMax?: number;
  targetProteinG?: number;
  targetMealsPerDay?: number;
}): Promise<{ contactId: string }> {
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
      supabase
        .from("workspaces")
        .select("extra_capacity")
        .eq("id", formData.workspaceId)
        .single(),
    ]);

    const limit = effectiveFamilyLimit(workspace?.extra_capacity ?? 0);
    if ((activeCount ?? 0) >= limit) {
      throw new Error(familyLimitReachedMessage(limit));
    }
    // Removing a family member frees an active slot but does not refund this
    // month's add quota — a new add is only allowed once the calendar month
    // rolls over. See supabase/migrations/0004_soft_delete_and_monthly_quota.sql.
    if ((monthCount ?? 0) >= limit) {
      throw new Error(familyMonthlyQuotaReachedMessage(limit));
    }
  }

  // Server-authoritative: block adding new family members once the trial
  // (or a paid period) has lapsed, regardless of what the UI shows.
  const entitlement = await getEntitlementSnapshot(formData.workspaceId, "adults");
  if (entitlement.isReadOnly) {
    throw new Error("Your Family trial has ended. Subscribe to add more family members.");
  }

  const { data: contact, error } = await supabase
    .from("adults_contacts")
    .insert({
      workspace_id: formData.workspaceId,
      caregiver_id: user.id,
      full_name: formData.fullName,
      whatsapp_number: formData.whatsappNumber,
      relationship: formData.relationship || null,
      age: formData.age || null,
      gender: formData.gender || null,
      weight_kg: formData.weightKg || null,
      height_cm: formData.heightCm || null,
      health_notes: formData.healthNotes || null,
      invite_sent_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error?.message?.includes("FAMILY_MEMBER_LIMIT_REACHED")) {
    throw new Error(FAMILY_LIMIT_REACHED_MESSAGE);
  }
  if (error?.message?.includes("FAMILY_MEMBER_MONTHLY_QUOTA_REACHED")) {
    throw new Error(FAMILY_MONTHLY_QUOTA_REACHED_MESSAGE);
  }
  if (error || !contact) throw new Error(error?.message ?? "Failed to add contact");

  // Starts the Family trial on first successful add; a no-op for every
  // subsequent contact (see startTrialIfNeeded — idempotent per workspace).
  await startTrialIfNeeded(formData.workspaceId, user.id, "adults");

  if (formData.goalType && formData.goalTitle) {
    await supabase.from("adults_contact_goals").insert({
      contact_id: contact.id,
      caregiver_id: user.id,
      goal_type: formData.goalType,
      title: formData.goalTitle,
      description: formData.goalDescription || null,
      target_calories_min: formData.targetCaloriesMin || null,
      target_calories_max: formData.targetCaloriesMax || null,
      target_protein_g: formData.targetProteinG || null,
      target_meals_per_day: formData.targetMealsPerDay || null,
    });
  }

  try {
    await sendContactInvite(supabase, user.id, formData.fullName, formData.whatsappNumber);
  } catch {
    // Don't fail contact creation if the initial invite send fails — the
    // caregiver can retry via resendContactInvite. sendContactInvite already
    // logs the underlying error.
  }

  return { contactId: contact.id };
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
  const caregiverName = profile?.full_name ?? "Your family member";
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
