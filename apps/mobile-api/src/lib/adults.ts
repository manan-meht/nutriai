import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getContacts as getContactsCore,
  getContactDetails as getContactDetailsCore,
  getOrCreateWorkspace,
} from "@nutriai/nutrition-core";
import { createServiceClient } from "./supabase";

// Mirrors the main app's src/app/(adults)/adults/dashboard/actions.ts read
// paths via the shared @nutriai/nutrition-core package (see
// packages/nutrition-core and this app's README) rather than duplicating
// them. addContact/updateContact below are a deliberately lean subset of
// the main app's write path (see their own comments) — the account-limit
// friendly pre-check, WhatsApp invite auto-send, and trial-start
// bookkeeping stay exclusively in the main app; the DB-level
// enforce_family_member_limit trigger still applies regardless of which
// app performs the insert.

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Cross-product duplicate-number check (a number already used by another
 * adults contact or a gym client can't be reused) — mirrors
 * src/lib/end-user/otp.ts's findContactByWhatsappNumber. Needs the
 * service-role client since it must see rows across every workspace, not
 * just the caller's own. */
async function isWhatsappNumberTaken(whatsappNumber: string): Promise<boolean> {
  const admin = createServiceClient();
  const normalized = normalizePhone(whatsappNumber);

  const [{ data: contacts }, { data: clients }] = await Promise.all([
    admin.from("adults_contacts").select("whatsapp_number").is("deleted_at", null),
    admin.from("gym_clients").select("whatsapp_number").is("deleted_at", null),
  ]);

  return (
    (contacts ?? []).some((c: any) => normalizePhone(c.whatsapp_number ?? "") === normalized) ||
    (clients ?? []).some((c: any) => normalizePhone(c.whatsapp_number ?? "") === normalized)
  );
}

export interface AddContactInput {
  fullName: string;
  whatsappNumber: string;
  relationship?: string;
  relationshipType?: "self" | "family_caregiver";
  age?: number;
  gender?: string;
  weightKg?: number;
  heightCm?: number;
  healthNotes?: string;
  nutritionGoals?: string[];
  activityLevel?: string;
  resistanceTrainingStatus?: string;
  targetWeightKg?: number;
  /** WhatsApp meal reminders (migration 0016) — gym_clients has no
   * equivalent columns, so these are adults-only, same as `relationship`. */
  timezone?: string;
  remindersEnabled?: boolean;
  reminderTimes?: string[];
}

export async function addContact(
  workspaceId: string,
  caregiverId: string,
  input: AddContactInput,
  supabase: SupabaseClient
): Promise<{ contactId: string; error?: undefined } | { contactId?: undefined; error: string }> {
  if (await isWhatsappNumberTaken(input.whatsappNumber)) {
    return { error: "This WhatsApp number is already registered to another contact or client." };
  }

  const { data: contact, error } = await supabase
    .from("adults_contacts")
    .insert({
      workspace_id: workspaceId,
      caregiver_id: caregiverId,
      full_name: input.fullName,
      whatsapp_number: input.whatsappNumber,
      relationship: input.relationship || null,
      relationship_type: input.relationshipType ?? "family_caregiver",
      age: input.age ?? null,
      gender: input.gender || null,
      weight_kg: input.weightKg ?? null,
      height_cm: input.heightCm ?? null,
      health_notes: input.healthNotes || null,
      invite_sent_at: new Date().toISOString(),
      nutrition_goals: input.nutritionGoals ?? [],
      activity_level: input.activityLevel || null,
      resistance_training_status: input.resistanceTrainingStatus || null,
      target_weight_kg: input.targetWeightKg ?? null,
      ...(input.timezone ? { timezone: input.timezone } : {}),
      ...(input.remindersEnabled !== undefined ? { reminders_enabled: input.remindersEnabled } : {}),
      ...(input.reminderTimes ? { reminder_times: input.reminderTimes } : {}),
    })
    .select("id")
    .single();

  if (error?.message?.includes("FAMILY_MEMBER_LIMIT_REACHED")) {
    return { error: "You've reached your Family plan's member limit." };
  }
  if (error?.message?.includes("FAMILY_MEMBER_MONTHLY_QUOTA_REACHED")) {
    return { error: "You've reached this month's limit for adding new family members." };
  }
  if (error || !contact) return { error: error?.message ?? "Failed to add contact" };

  return { contactId: contact.id };
}

export interface UpdateContactInput {
  fullName: string;
  relationship?: string;
  age?: number;
  gender?: string;
  weightKg?: number;
  heightCm?: number;
  healthNotes?: string;
  nutritionGoals?: string[];
  activityLevel?: string;
  resistanceTrainingStatus?: string;
  targetWeightKg?: number;
  /** WhatsApp meal reminders (migration 0016) — adults-only, see
   * AddContactInput. Omitted (undefined) leaves the existing stored value
   * untouched rather than clearing it, since the mobile edit form doesn't
   * expose a timezone picker yet — only remindersEnabled/reminderTimes. */
  timezone?: string;
  remindersEnabled?: boolean;
  reminderTimes?: string[];
}

export async function updateContact(
  contactId: string,
  caregiverId: string,
  input: UpdateContactInput,
  supabase: SupabaseClient
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("adults_contacts")
    .update({
      full_name: input.fullName,
      relationship: input.relationship || null,
      age: input.age ?? null,
      gender: input.gender || null,
      weight_kg: input.weightKg ?? null,
      height_cm: input.heightCm ?? null,
      health_notes: input.healthNotes || null,
      nutrition_goals: input.nutritionGoals ?? [],
      activity_level: input.activityLevel || null,
      resistance_training_status: input.resistanceTrainingStatus || null,
      target_weight_kg: input.targetWeightKg ?? null,
      ...(input.timezone ? { timezone: input.timezone } : {}),
      ...(input.remindersEnabled !== undefined ? { reminders_enabled: input.remindersEnabled } : {}),
      ...(input.reminderTimes ? { reminder_times: input.reminderTimes } : {}),
    })
    .eq("id", contactId)
    .eq("caregiver_id", caregiverId);

  if (error) return { error: error.message };
  return {};
}

export async function getOrCreateAdultsWorkspace(userId: string, caregiverName?: string) {
  const admin = createServiceClient();
  return getOrCreateWorkspace(admin, userId, "adults", caregiverName);
}

export async function getContacts(workspaceId: string, supabase: SupabaseClient) {
  return getContactsCore(workspaceId, supabase);
}

// 400-day window matches the main app's date-range selector (up to "This
// year"/"All time") — see packages/nutrition-core/src/adults.ts.
const CONTACT_DETAILS_SINCE_DAYS = 400;

export async function getContactDetails(contactId: string, supabase: SupabaseClient) {
  const admin = createServiceClient();
  return getContactDetailsCore(contactId, supabase, admin, CONTACT_DETAILS_SINCE_DAYS);
}
