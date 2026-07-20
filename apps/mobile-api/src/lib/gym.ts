import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getClients as getClientsCore,
  getClientDetails as getClientDetailsCore,
  getOrCreateWorkspace as getOrCreateWorkspaceCore,
} from "@nutriai/nutrition-core";
import { createServiceClient } from "./supabase";

// Mirrors the main app's src/app/(gym)/gym/dashboard/actions.ts read paths
// via the shared @nutriai/nutrition-core package (see
// packages/nutrition-core and this app's README) rather than duplicating
// them. addClient/updateClient below are a deliberately lean subset of the
// main app's write path — the account-limit friendly pre-check, WhatsApp
// invite auto-send, and trial-start bookkeeping stay exclusively in the
// main app; the DB-level enforce_gym_client_limit trigger still applies
// regardless of which app performs the insert.

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

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

export interface AddClientInput {
  fullName: string;
  whatsappNumber: string;
  age?: number;
  gender?: string;
  weightKg?: number;
  heightCm?: number;
  nutritionGoals?: string[];
  activityLevel?: string;
  resistanceTrainingStatus?: string;
  targetWeightKg?: number;
}

export async function addClient(
  workspaceId: string,
  trainerId: string,
  input: AddClientInput,
  supabase: SupabaseClient
): Promise<{ clientId: string; error?: undefined } | { clientId?: undefined; error: string }> {
  if (await isWhatsappNumberTaken(input.whatsappNumber)) {
    return { error: "This WhatsApp number is already registered to another contact or client." };
  }

  const { data: client, error } = await supabase
    .from("gym_clients")
    .insert({
      workspace_id: workspaceId,
      trainer_id: trainerId,
      full_name: input.fullName,
      whatsapp_number: input.whatsappNumber,
      age: input.age ?? null,
      gender: input.gender || null,
      weight_kg: input.weightKg ?? null,
      height_cm: input.heightCm ?? null,
      invite_sent_at: new Date().toISOString(),
      nutrition_goals: input.nutritionGoals ?? [],
      activity_level: input.activityLevel || null,
      resistance_training_status: input.resistanceTrainingStatus || null,
      target_weight_kg: input.targetWeightKg ?? null,
    })
    .select("id")
    .single();

  if (error?.message?.includes("GYM_CLIENT_LIMIT_REACHED")) {
    return { error: "You've reached your Coaching plan's client limit." };
  }
  if (error?.message?.includes("GYM_CLIENT_MONTHLY_QUOTA_REACHED")) {
    return { error: "You've reached this month's limit for adding new clients." };
  }
  if (error || !client) return { error: error?.message ?? "Failed to add client" };

  return { clientId: client.id };
}

export interface UpdateClientInput {
  fullName: string;
  age?: number;
  gender?: string;
  weightKg?: number;
  heightCm?: number;
  nutritionGoals?: string[];
  activityLevel?: string;
  resistanceTrainingStatus?: string;
  targetWeightKg?: number;
}

export async function updateClient(
  clientId: string,
  trainerId: string,
  input: UpdateClientInput,
  supabase: SupabaseClient
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("gym_clients")
    .update({
      full_name: input.fullName,
      age: input.age ?? null,
      gender: input.gender || null,
      weight_kg: input.weightKg ?? null,
      height_cm: input.heightCm ?? null,
      nutrition_goals: input.nutritionGoals ?? [],
      activity_level: input.activityLevel || null,
      resistance_training_status: input.resistanceTrainingStatus || null,
      target_weight_kg: input.targetWeightKg ?? null,
    })
    .eq("id", clientId)
    .eq("trainer_id", trainerId);

  if (error) return { error: error.message };
  return {};
}

export async function getOrCreateWorkspace(userId: string, coachName?: string) {
  const admin = createServiceClient();
  return getOrCreateWorkspaceCore(admin, userId, "gym", coachName);
}

export async function getClients(workspaceId: string, supabase: SupabaseClient) {
  return getClientsCore(workspaceId, supabase);
}

// 30-day window matches the main app's gym dashboard — see
// packages/nutrition-core/src/gym.ts.
const CLIENT_DETAILS_SINCE_DAYS = 30;

export async function getClientDetails(clientId: string, supabase: SupabaseClient) {
  const admin = createServiceClient();
  return getClientDetailsCore(clientId, supabase, admin, CLIENT_DETAILS_SINCE_DAYS);
}
