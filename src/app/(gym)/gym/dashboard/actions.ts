"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getOrCreateInvite, findLatestInvite, regenerateInvite, revokeInvite, markInviteLinkOpened, toInviteSummary, withInviteErrorHandling } from "@/lib/invites/service";
import { trackInviteEvent } from "@/lib/invites/analytics";
import type { InviteSummary } from "@/lib/invites/types";
import {
  GYM_LIMIT_REACHED_MESSAGE,
  GYM_MONTHLY_QUOTA_REACHED_MESSAGE,
  effectiveGymLimit,
  gymLimitReachedMessage,
  gymMonthlyQuotaReachedMessage,
  startOfCalendarMonthUTC,
} from "@/lib/limits";
import { getEntitlementSnapshot, startTrialIfNeeded } from "@/lib/entitlements/entitlements";
import { GYM_LIMIT_ENFORCEMENT_ENABLED } from "@/lib/billing/feature-flags";
import { now } from "@/lib/time/clock";
import { findContactByWhatsappNumber } from "@/lib/end-user/otp";
import type { HumanCorrectionFields } from "@nutriai/dashboard-core";
import { fetchHumanCorrectionsByMealLogId } from "@/lib/nutrition/fetch-human-corrections";
import {
  getClients as getClientsCore,
  getRemovedClients as getRemovedClientsCore,
  getOrCreateWorkspace as getOrCreateWorkspaceCore,
} from "@nutriai/nutrition-core";
import type { GymClient, GymClientGoal, BiomarkerLog, WorkoutLog } from "@nutriai/nutrition-core";
// GymClient/GymClientGoal/BiomarkerLog/WorkoutLog come from
// @nutriai/nutrition-core, shared with apps/mobile-api (see
// packages/nutrition-core and that app's README) — re-exported here so
// existing importers of these types from this module don't need to change.
// Written as a direct `export type ... from` re-export (rather than
// `import type` + a separate `export type {}`) because "use server" files
// are scanned by Next for server-action exports before type erasure, and
// that scanner doesn't reliably recognize the two-statement form as
// type-only. MealLog/ClientDetails stay defined locally below: MealLog
// carries the human-correction fields narrowly typed against this app's
// own classification unions (PresenceStatus/BalanceStatus/Likelihood, see
// src/lib/nutrition/human-corrections.ts), which the shared package
// deliberately does not depend on.
export type { GymClient, GymClientGoal, BiomarkerLog, WorkoutLog } from "@nutriai/nutrition-core";

export async function getOrCreateWorkspace(userId: string, coachName?: string): Promise<{ id: string; name: string; extraCapacity: number }> {
  const admin = createServiceClient();
  return getOrCreateWorkspaceCore(admin, userId, "gym", coachName);
}

export async function getClients(workspaceId: string): Promise<GymClient[]> {
  const supabase = await createClient();
  return getClientsCore(workspaceId, supabase);
}

/** Previously-removed clients — data preserved and viewable, but they no
 * longer count as active and can't be logged against going forward. */
export async function getRemovedClients(workspaceId: string): Promise<GymClient[]> {
  const supabase = await createClient();
  return getRemovedClientsCore(workspaceId, supabase);
}

/** Soft-delete: preserves the client's historical data (meals, workouts,
 * biomarkers, goals) while freeing an *active* slot. Does not refund this
 * calendar month's add quota — see
 * supabase/migrations/0004_soft_delete_and_monthly_quota.sql. */
export async function removeClient(clientId: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("gym_clients")
    .update({ deleted_at: now().toISOString() })
    .eq("id", clientId)
    .eq("trainer_id", user.id);

  if (error) throw new Error(error.message);
}

export interface MealLog {
  id: string;
  clientId: string;
  mealType: string;
  loggedAt: string;
  foods: Array<{
    name: string;
    quantity: string;
    protein_min: number;
    protein_max: number;
    calories_min: number;
    calories_max: number;
    carbs_min: number;
    carbs_max: number;
    fat_min: number;
    fat_max: number;
    fiber_min?: number;
    fiber_max?: number;
  }>;
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

export interface ClientDetails {
  client: GymClient;
  meals: MealLog[];
  workouts: WorkoutLog[];
  biomarkers: BiomarkerLog[];
}

export async function getClientDetails(clientId: string): Promise<ClientDetails | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [clientRes, mealsRes, workoutsRes, biomarkersRes] = await Promise.all([
    supabase
      .from("gym_clients")
      .select("*, goals:gym_client_goals(*)")
      .eq("id", clientId)
      .eq("trainer_id", user.id)
      .single(),
    supabase
      .from("meal_logs")
      .select("*")
      .eq("client_id", clientId)
      .gte("logged_at", since.toISOString())
      .order("logged_at", { ascending: false }),
    supabase
      .from("workout_logs")
      .select("*")
      .eq("client_id", clientId)
      .gte("logged_at", since.toISOString())
      .order("logged_at", { ascending: false }),
    supabase
      .from("biomarker_logs")
      .select("*")
      .eq("client_id", clientId)
      .order("logged_at", { ascending: true }),
  ]);

  if (!clientRes.data) return null;
  const c = clientRes.data;

  const client: GymClient = {
    id: c.id,
    workspaceId: c.workspace_id,
    fullName: c.full_name,
    whatsappNumber: c.whatsapp_number,
    age: c.age,
    gender: c.gender,
    weightKg: c.weight_kg,
    heightCm: c.height_cm,
    bmi: c.bmi,
    inviteSentAt: c.invite_sent_at,
    createdAt: c.created_at,
    mealCount: mealsRes.data?.length ?? 0,
    lastMealAt: mealsRes.data?.[0]?.logged_at,
    trackedBiomarkers: c.tracked_biomarkers ?? [],
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
      targetWeightKg: g.target_weight_kg,
      targetProteinG: g.target_protein_g,
      targetCaloriesMin: g.target_calories_min,
      targetCaloriesMax: g.target_calories_max,
      targetMealsPerDay: g.target_meals_per_day,
      deadline: g.deadline,
      status: g.status,
    })),
  };

  const rawMeals = mealsRes.data ?? [];
  const corrections = await fetchHumanCorrectionsByMealLogId(rawMeals.map((m: any) => m.id));

  const meals: MealLog[] = rawMeals.map((m: any) => ({
    id: m.id,
    clientId: m.client_id,
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

  const workouts: WorkoutLog[] = (workoutsRes.data ?? []).map((w: any) => ({
    id: w.id,
    clientId: w.client_id,
    loggedAt: w.logged_at,
    description: w.description,
    workoutType: w.workout_type,
    durationMinutes: w.duration_minutes,
  }));

  const biomarkers: BiomarkerLog[] = (biomarkersRes.data ?? []).map((b: any) => ({
    id: b.id,
    clientId: b.client_id,
    loggedAt: b.logged_at,
    weightKg: b.weight_kg,
    bmi: b.bmi,
    waistCm: b.waist_cm,
    hipCm: b.hip_cm,
    waistHipRatio: b.waist_hip_ratio,
    bodyFatPct: b.body_fat_pct,
    neckCm: b.neck_cm,
    chestCm: b.chest_cm,
    bicepCm: b.bicep_cm,
    thighCm: b.thigh_cm,
    notes: b.notes,
  }));

  return { client, meals, workouts, biomarkers };
}

export async function updateTrackedBiomarkers(clientId: string, markers: string[]): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("gym_clients")
    .update({ tracked_biomarkers: markers })
    .eq("id", clientId);
  if (error) throw new Error(error.message);
}

export async function logBiomarker(clientId: string, data: {
  loggedAt: string;
  weightKg?: number;
  bmi?: number;
  waistCm?: number;
  hipCm?: number;
  bodyFatPct?: number;
  neckCm?: number;
  chestCm?: number;
  bicepCm?: number;
  thighCm?: number;
  notes?: string;
}): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: clientRow } = await supabase
    .from("gym_clients")
    .select("workspace_id")
    .eq("id", clientId)
    .single();

  const { error } = await supabase.from("biomarker_logs").insert({
    client_id: clientId,
    workspace_id: clientRow?.workspace_id,
    trainer_id: user.id,
    logged_at: data.loggedAt,
    weight_kg: data.weightKg ?? null,
    bmi: data.bmi ?? null,
    waist_cm: data.waistCm ?? null,
    hip_cm: data.hipCm ?? null,
    body_fat_pct: data.bodyFatPct ?? null,
    neck_cm: data.neckCm ?? null,
    chest_cm: data.chestCm ?? null,
    bicep_cm: data.bicepCm ?? null,
    thigh_cm: data.thighCm ?? null,
    notes: data.notes ?? null,
  });
  if (error) throw new Error(error.message);
}


export async function addClient(formData: {
  workspaceId: string;
  fullName: string;
  whatsappNumber: string;
  age?: number;
  gender?: string;
  weightKg?: number;
  heightCm?: number;
  /** Food Balance Score profile fields (see
   * supabase/migrations/0027_food_balance_score.sql) — replaces the old
   * gym_client_goals checklist entirely; protein/calorie targets shown on
   * the dashboard are now computed from these via @nutriai/health-scoring
   * instead of being typed in by hand. */
  primaryNutritionGoal?: string;
  dateOfBirth?: string;
  metabolicEquationSex?: string;
  activityLevel?: string;
  resistanceTrainingStatus?: string;
  targetWeightKg?: number;
  /** Optional at signup — a coach may know some of a client's eating
   * habits upfront rather than waiting for meals to be logged. Explicit
   * choices always take priority over anything later inferred from meal
   * photos (see @/lib/dietary-profile). */
  dietaryPreferences?: import("@/lib/dietary-profile").FoodPreferenceSelections;
}): Promise<{ clientId: string; error?: undefined } | { clientId?: undefined; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Fast, friendly pre-check. Not authoritative on its own — the DB trigger
  // (enforce_gym_client_limit, see supabase/migrations/0002_account_limits.sql
  // and 0003_purchasable_capacity.sql) is the source of truth, runs
  // unconditionally regardless of GYM_LIMIT_ENFORCEMENT_ENABLED, and is
  // safe under concurrent requests via an advisory lock. This block only
  // avoids a round-trip + raw Postgres error in the common (non-racing)
  // case, and can be turned off via the flag without weakening the actual
  // server-authoritative limit.
  if (GYM_LIMIT_ENFORCEMENT_ENABLED) {
    const monthStart = startOfCalendarMonthUTC(now()).toISOString();
    // extra_capacity is read via the service-role client, not the
    // RLS-bound `supabase` client above — the "workspaces: member access"
    // RLS policy requires a workspace_members row that workspace creation
    // never inserts for the owner, so this select would otherwise always
    // return no row and silently default extra_capacity to 0, blocking
    // purchased-capacity customers at the base limit regardless of what
    // they actually paid for. This value isn't user-sensitive, so bypassing
    // RLS here (same pattern as getOrCreateGymWorkspace) is safe.
    const { createClient: createServiceClient } = await import("@supabase/supabase-js");
    const admin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const [{ count: activeCount }, { count: monthCount }, { data: workspace }] = await Promise.all([
      supabase
        .from("gym_clients")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", formData.workspaceId)
        .is("deleted_at", null),
      supabase
        .from("gym_clients")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", formData.workspaceId)
        .gte("created_at", monthStart),
      admin
        .from("workspaces")
        .select("extra_capacity")
        .eq("id", formData.workspaceId)
        .single(),
    ]);

    const limit = effectiveGymLimit(workspace?.extra_capacity ?? 0);
    if ((activeCount ?? 0) >= limit) {
      return { error: gymLimitReachedMessage(limit) };
    }
    // Removing a client frees an active slot but does not refund this month's
    // add quota — a new invite is only allowed once the calendar month rolls
    // over. See supabase/migrations/0004_soft_delete_and_monthly_quota.sql.
    if ((monthCount ?? 0) >= limit) {
      return { error: gymMonthlyQuotaReachedMessage(limit) };
    }
  }

  // Server-authoritative: block adding new clients once the trial (or a
  // paid period) has lapsed, regardless of what the UI shows.
  const entitlement = await getEntitlementSnapshot(formData.workspaceId, "gym");
  if (entitlement.isReadOnly) {
    return { error: "Your Coaching trial has ended. Subscribe to invite more clients." };
  }

  // A number already registered as an adults contact (or another gym client)
  // can't be added again — the WhatsApp bot resolves a number to exactly one
  // entity, and a shared number previously caused the conversation lock to
  // get stuck permanently (see src/lib/whatsapp/conversation-handler.ts).
  const existingContact = await findContactByWhatsappNumber(formData.whatsappNumber);
  if (existingContact) {
    return {
      error:
        existingContact.contactType === "adults"
          ? "This WhatsApp number is already registered as a family member."
          : "This WhatsApp number is already registered as a coaching client.",
    };
  }

  const { applyExplicitPreferences, DEFAULT_DIETARY_PROFILE } = await import("@/lib/dietary-profile");
  const dietaryProfile =
    formData.dietaryPreferences && Object.keys(formData.dietaryPreferences).length > 0
      ? applyExplicitPreferences(DEFAULT_DIETARY_PROFILE, formData.dietaryPreferences)
      : DEFAULT_DIETARY_PROFILE;

  const { data: client, error } = await supabase
    .from("gym_clients")
    .insert({
      workspace_id: formData.workspaceId,
      trainer_id: user.id,
      full_name: formData.fullName,
      whatsapp_number: formData.whatsappNumber,
      age: formData.age || null,
      gender: formData.gender || null,
      weight_kg: formData.weightKg || null,
      height_cm: formData.heightCm || null,
      invite_sent_at: new Date().toISOString(),
      primary_nutrition_goal: formData.primaryNutritionGoal || null,
      date_of_birth: formData.dateOfBirth || null,
      metabolic_equation_sex: formData.metabolicEquationSex || null,
      activity_level: formData.activityLevel || null,
      resistance_training_status: formData.resistanceTrainingStatus || null,
      target_weight_kg: formData.targetWeightKg || null,
      dietary_profile: dietaryProfile,
    })
    .select("id")
    .single();

  if (error?.message?.includes("GYM_CLIENT_LIMIT_REACHED")) {
    return { error: GYM_LIMIT_REACHED_MESSAGE };
  }
  if (error?.message?.includes("GYM_CLIENT_MONTHLY_QUOTA_REACHED")) {
    return { error: GYM_MONTHLY_QUOTA_REACHED_MESSAGE };
  }
  if (error || !client) throw new Error(error?.message ?? "Failed to add client");

  // Starts the Coaching trial on first successful invite; a no-op for every
  // subsequent client (see startTrialIfNeeded — idempotent per workspace).
  await startTrialIfNeeded(formData.workspaceId, user.id, "gym");

  return { clientId: client.id };
}

/** Edit an existing client's profile details and Food Balance Score goal —
 * gym's equivalent of the adults product's updateContact. There was
 * previously no edit path for a client at all (goals were write-once, set
 * only at addClient time); this is the first one. */
export async function updateClient(
  clientId: string,
  formData: {
    fullName: string;
    age?: number;
    gender?: string;
    weightKg?: number;
    heightCm?: number;
    primaryNutritionGoal?: string;
    dateOfBirth?: string;
    metabolicEquationSex?: string;
    activityLevel?: string;
    resistanceTrainingStatus?: string;
    targetWeightKg?: number;
    dietaryPreferences?: import("@/lib/dietary-profile").FoodPreferenceSelections;
  }
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  let dietaryProfileUpdate: object = {};
  if (formData.dietaryPreferences && Object.keys(formData.dietaryPreferences).length > 0) {
    const { applyExplicitPreferences, DEFAULT_DIETARY_PROFILE } = await import("@/lib/dietary-profile");
    const { data: clientRow } = await supabase.from("gym_clients").select("dietary_profile").eq("id", clientId).single();
    const currentProfile = { ...DEFAULT_DIETARY_PROFILE, ...(clientRow?.dietary_profile ?? {}) };
    dietaryProfileUpdate = { dietary_profile: applyExplicitPreferences(currentProfile, formData.dietaryPreferences) };
  }

  const { error } = await supabase
    .from("gym_clients")
    .update({
      full_name: formData.fullName,
      age: formData.age || null,
      gender: formData.gender || null,
      weight_kg: formData.weightKg || null,
      height_cm: formData.heightCm || null,
      primary_nutrition_goal: formData.primaryNutritionGoal || null,
      date_of_birth: formData.dateOfBirth || null,
      metabolic_equation_sex: formData.metabolicEquationSex || null,
      activity_level: formData.activityLevel || null,
      resistance_training_status: formData.resistanceTrainingStatus || null,
      target_weight_kg: formData.targetWeightKg || null,
      ...dietaryProfileUpdate,
    })
    .eq("id", clientId)
    .eq("trainer_id", user.id);

  if (error) return { error: error.message };
  return {};
}

/** Reads a client's current dietary profile, expressed back as the same
 * FoodPreferenceSelections shape the editor UI uses — lets EditClientModal
 * pre-fill the three-state toggles from what's already been explicitly
 * set (observed_* alone, with no explicit avoid, intentionally shows as
 * "unset" here — this is about the coach's own prior explicit input, not
 * everything the profile has inferred from meals). */
export async function getClientDietaryPreferences(clientId: string): Promise<import("@/lib/dietary-profile").FoodPreferenceSelections> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: clientRow } = await supabase
    .from("gym_clients")
    .select("dietary_profile")
    .eq("id", clientId)
    .eq("trainer_id", user.id)
    .single();

  const p = clientRow?.dietary_profile ?? {};
  const selections: import("@/lib/dietary-profile").FoodPreferenceSelections = {};
  if (p.prefers_plant_based_suggestions) selections.prefersPlantBasedSuggestions = true;
  if (p.explicit_vegetarian) selections.eatsVegetarian = true;
  if (p.explicit_avoids_eggs) selections.eatsEggs = false;
  if (p.explicit_avoids_chicken) selections.eatsChicken = false;
  if (p.explicit_avoids_fish) selections.eatsFishOrSeafood = false;
  if (p.explicit_avoids_red_meat) selections.eatsRedMeat = false;
  if (p.explicit_avoids_dairy) selections.avoidsDairy = true;
  if (p.explicit_avoids_lactose) selections.avoidsLactose = true;
  if (p.explicit_avoids_pork) selections.avoidsPork = true;
  return selections;
}

/** Gym-side equivalent of the adults product's recordFoodSuggestionFeedback
 * — see src/lib/food-balance/feedback.ts. */
export async function recordClientFoodSuggestionFeedback(
  clientId: string,
  feedback: import("@/lib/food-balance/feedback").RecommendationFeedback,
  foodIds: string[]
): Promise<{ error?: string }> {
  const { applyRecommendationFeedback } = await import("@/lib/food-balance/feedback");
  const { DEFAULT_DIETARY_PROFILE } = await import("@/lib/dietary-profile");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: clientRow, error: readError } = await supabase
    .from("gym_clients")
    .select("dietary_profile")
    .eq("id", clientId)
    .eq("trainer_id", user.id)
    .single();
  if (readError || !clientRow) return { error: readError?.message ?? "Client not found" };

  const currentProfile = { ...DEFAULT_DIETARY_PROFILE, ...(clientRow.dietary_profile ?? {}) };
  const nextProfile = applyRecommendationFeedback(currentProfile, feedback, foodIds);

  const { error } = await supabase
    .from("gym_clients")
    .update({ dietary_profile: nextProfile })
    .eq("id", clientId)
    .eq("trainer_id", user.id);

  if (error) return { error: error.message };
  return {};
}

// -----------------------------------------------------------------------
// WhatsApp-first invites (see src/lib/invites) — the coach shares a wa.me
// link themselves; the bot never sends the first message, so this doesn't
// depend on an approved WhatsApp template or business verification.
// -----------------------------------------------------------------------

async function requireOwnedClient(clientId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, client: null };

  const { data: client } = await supabase
    .from("gym_clients")
    .select("id, workspace_id, full_name")
    .eq("id", clientId)
    .eq("trainer_id", user.id)
    .single();

  return { user, client };
}

export async function getOrCreateCoachClientInvite(clientId: string): Promise<InviteSummary | { error: string }> {
  const { user, client } = await requireOwnedClient(clientId);
  if (!user) return { error: "Your session has expired. Please sign in again." };
  if (!client) return { error: "Client not found" };

  return withInviteErrorHandling(async () => {
    const admin = createServiceClient();
    const existing = await findLatestInvite(admin, { workspaceId: client.workspace_id, inviteType: "coach_client", targetProfileId: clientId });
    const invite = await getOrCreateInvite(
      admin,
      { workspaceId: client.workspace_id, inviteType: "coach_client", targetProfileId: clientId },
      { inviteType: "coach_client", createdByUserId: user.id, workspaceId: client.workspace_id, targetProfileId: clientId }
    );
    if (!existing || existing.id !== invite.id) trackInviteEvent("invite_created", { inviteType: "coach_client", clientId });
    return toInviteSummary(invite, client.full_name.split(" ")[0]);
  });
}

export async function regenerateCoachClientInvite(clientId: string): Promise<InviteSummary | { error: string }> {
  const { user, client } = await requireOwnedClient(clientId);
  if (!user) return { error: "Your session has expired. Please sign in again." };
  if (!client) return { error: "Client not found" };

  return withInviteErrorHandling(async () => {
    const admin = createServiceClient();
    const current = await findLatestInvite(admin, { workspaceId: client.workspace_id, inviteType: "coach_client", targetProfileId: clientId });
    if (!current) return { error: "No invite to regenerate" };

    const fresh = await regenerateInvite(admin, current);
    trackInviteEvent("invite_regenerated", { inviteType: "coach_client", clientId });
    return toInviteSummary(fresh, client.full_name.split(" ")[0]);
  });
}

export async function revokeCoachClientInvite(clientId: string): Promise<{ ok: true } | { error: string }> {
  const { user, client } = await requireOwnedClient(clientId);
  if (!user) return { error: "Your session has expired. Please sign in again." };
  if (!client) return { error: "Client not found" };

  return withInviteErrorHandling(async () => {
    const admin = createServiceClient();
    const current = await findLatestInvite(admin, { workspaceId: client.workspace_id, inviteType: "coach_client", targetProfileId: clientId });
    if (!current) return { error: "No invite to revoke" };

    await revokeInvite(admin, current.id);
    trackInviteEvent("invite_revoked", { inviteType: "coach_client", clientId });
    return { ok: true } as const;
  });
}

/** See markFamilyInviteLinkOpened (adults) — coach_client equivalent. */
export async function markCoachClientInviteLinkOpened(clientId: string): Promise<{ ok: true } | { error: string }> {
  const { user, client } = await requireOwnedClient(clientId);
  if (!user) return { error: "Your session has expired. Please sign in again." };
  if (!client) return { error: "Client not found" };

  return withInviteErrorHandling(async () => {
    const admin = createServiceClient();
    const current = await findLatestInvite(admin, { workspaceId: client.workspace_id, inviteType: "coach_client", targetProfileId: clientId });
    if (current) await markInviteLinkOpened(admin, current.id);
    return { ok: true } as const;
  });
}

// -----------------------------------------------------------------------
// Temporary Access Codes — gym-side equivalent of the adults product's
// generateAccessCodeAction/regenerateAccessCodeAction/revokeAccessCodeAction.
// -----------------------------------------------------------------------

export interface ClientAccessCodeResult {
  code: string;
  formattedCode: string;
  expiresAt: string;
  error?: undefined;
}

function formatClientAccessCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

async function requireOwnedGymClient(clientId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: clientRow } = await supabase
    .from("gym_clients")
    .select("id, full_name, whatsapp_number")
    .eq("id", clientId)
    .eq("trainer_id", user.id)
    .maybeSingle();
  if (!clientRow || !clientRow.whatsapp_number) return { user, contact: null };

  return {
    user,
    contact: {
      contactId: clientRow.id,
      contactType: "gym" as const,
      whatsappNumber: clientRow.whatsapp_number as string,
      fullName: clientRow.full_name as string,
    },
  };
}

export async function generateClientAccessCodeAction(clientId: string, ttlHours: 1 | 24 = 24): Promise<ClientAccessCodeResult | { error: string }> {
  const { generateAccessCode } = await import("@/lib/end-user/otp");
  const { user, contact } = await requireOwnedGymClient(clientId);
  if (!contact) return { error: "Client not found, or missing a WhatsApp number." };

  const { code, expiresAt } = await generateAccessCode(contact, user.id, "coach", ttlHours * 60 * 60 * 1000);
  return { code, formattedCode: formatClientAccessCode(code), expiresAt };
}

export async function regenerateClientAccessCodeAction(clientId: string, ttlHours: 1 | 24 = 24): Promise<ClientAccessCodeResult | { error: string }> {
  const { regenerateAccessCode } = await import("@/lib/end-user/otp");
  const { user, contact } = await requireOwnedGymClient(clientId);
  if (!contact) return { error: "Client not found, or missing a WhatsApp number." };

  const { code, expiresAt } = await regenerateAccessCode(contact, user.id, "coach", ttlHours * 60 * 60 * 1000);
  return { code, formattedCode: formatClientAccessCode(code), expiresAt };
}

export async function revokeClientAccessCodeAction(clientId: string): Promise<{ ok: boolean }> {
  const { revokeAccessCode } = await import("@/lib/end-user/otp");
  const { user, contact } = await requireOwnedGymClient(clientId);
  if (!contact) return { ok: false };

  await revokeAccessCode(contact, user.id);
  return { ok: true };
}
