"use server";

import { createClient } from "@/lib/supabase/server";
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

export interface GymClient {
  id: string;
  workspaceId: string;
  fullName: string;
  whatsappNumber: string;
  age?: number;
  gender?: "male" | "female" | "other";
  weightKg?: number;
  heightCm?: number;
  bmi?: number;
  inviteSentAt?: string;
  createdAt: string;
  deletedAt?: string;
  goals: GymClientGoal[];
  mealCount: number;
  lastMealAt?: string;
  trackedBiomarkers: string[];
}

export interface BiomarkerLog {
  id: string;
  clientId: string;
  loggedAt: string;
  weightKg?: number;
  bmi?: number;
  waistCm?: number;
  hipCm?: number;
  waistHipRatio?: number;
  bodyFatPct?: number;
  neckCm?: number;
  chestCm?: number;
  bicepCm?: number;
  thighCm?: number;
  notes?: string;
}

export interface GymClientGoal {
  id: string;
  goalType: string;
  title: string;
  description?: string;
  targetWeightKg?: number;
  targetProteinG?: number;
  targetCaloriesMin?: number;
  targetCaloriesMax?: number;
  targetMealsPerDay?: number;
  deadline?: string;
  status: string;
}

export async function getOrCreateWorkspace(userId: string, coachName?: string): Promise<{ id: string; name: string; extraCapacity: number }> {
  const { createClient: createServiceClient } = await import("@supabase/supabase-js");
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: existing } = await admin
    .from("workspaces")
    .select("id, name, extra_capacity")
    .eq("owner_id", userId)
    .eq("type", "gym")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (existing) return { id: existing.id, name: existing.name, extraCapacity: existing.extra_capacity ?? 0 };

  const name = `${coachName ?? "My"}'s Gym`;
  const slug = `gym-${userId.slice(0, 8)}-${Date.now()}`;

  const { data: created, error } = await admin
    .from("workspaces")
    .insert({ type: "gym", name, slug, owner_id: userId })
    .select("id, name, extra_capacity")
    .single();

  if (error || !created) throw new Error(`Failed to create workspace: ${error?.message}`);
  return { id: created.id, name: created.name, extraCapacity: created.extra_capacity ?? 0 };
}

function mapClientRow(c: any, mealsByClient: Record<string, { count: number; lastAt?: string }>): GymClient {
  return {
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
    deletedAt: c.deleted_at ?? undefined,
    mealCount: mealsByClient[c.id]?.count ?? 0,
    lastMealAt: mealsByClient[c.id]?.lastAt,
    trackedBiomarkers: c.tracked_biomarkers ?? [],
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
}

async function fetchMealsByClient(supabase: Awaited<ReturnType<typeof createClient>>, clientIds: string[]) {
  const { data: meals } = await supabase
    .from("meal_logs")
    .select("client_id, logged_at")
    .in("client_id", clientIds)
    .order("logged_at", { ascending: false });

  const mealsByClient: Record<string, { count: number; lastAt?: string }> = {};
  for (const m of meals ?? []) {
    if (!mealsByClient[m.client_id]) {
      mealsByClient[m.client_id] = { count: 0, lastAt: m.logged_at };
    }
    mealsByClient[m.client_id].count++;
  }
  return mealsByClient;
}

export async function getClients(workspaceId: string): Promise<GymClient[]> {
  const supabase = await createClient();

  const { data: clients } = await supabase
    .from("gym_clients")
    .select("*, goals:gym_client_goals(*)")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (!clients?.length) return [];

  const mealsByClient = await fetchMealsByClient(supabase, clients.map((c: any) => c.id));
  return clients.map((c: any) => mapClientRow(c, mealsByClient));
}

/** Previously-removed clients — data preserved and viewable, but they no
 * longer count as active and can't be logged against going forward. */
export async function getRemovedClients(workspaceId: string): Promise<GymClient[]> {
  const supabase = await createClient();

  const { data: clients } = await supabase
    .from("gym_clients")
    .select("*, goals:gym_client_goals(*)")
    .eq("workspace_id", workspaceId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  if (!clients?.length) return [];

  const mealsByClient = await fetchMealsByClient(supabase, clients.map((c: any) => c.id));
  return clients.map((c: any) => mapClientRow(c, mealsByClient));
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
  }>;
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

export interface WorkoutLog {
  id: string;
  clientId: string;
  loggedAt: string;
  description?: string;
  workoutType?: string;
  durationMinutes?: number;
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

  const meals: MealLog[] = (mealsRes.data ?? []).map((m: any) => ({
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
    aiSummary: m.ai_summary,
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

export async function getClientMeals(clientId: string, days = 7): Promise<MealLog[]> {
  const supabase = await createClient();
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data } = await supabase
    .from("meal_logs")
    .select("*")
    .eq("client_id", clientId)
    .gte("logged_at", since.toISOString())
    .order("logged_at", { ascending: false });

  return (data ?? []).map((m: any) => ({
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
    aiSummary: m.ai_summary,
  }));
}

export async function addClient(formData: {
  workspaceId: string;
  fullName: string;
  whatsappNumber: string;
  age?: number;
  gender?: string;
  weightKg?: number;
  heightCm?: number;
  goalType?: string;
  goalTitle?: string;
  goalDescription?: string;
  targetWeightKg?: number;
  targetProteinG?: number;
  targetCaloriesMin?: number;
  targetCaloriesMax?: number;
  targetMealsPerDay?: number;
  deadline?: string;
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
      supabase
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

  if (formData.goalType && formData.goalTitle) {
    await supabase.from("gym_client_goals").insert({
      client_id: client.id,
      trainer_id: user.id,
      goal_type: formData.goalType,
      title: formData.goalTitle,
      description: formData.goalDescription || null,
      target_weight_kg: formData.targetWeightKg || null,
      target_protein_g: formData.targetProteinG || null,
      target_calories_min: formData.targetCaloriesMin || null,
      target_calories_max: formData.targetCaloriesMax || null,
      target_meals_per_day: formData.targetMealsPerDay || null,
      deadline: formData.deadline || null,
    });
  }

  return { clientId: client.id };
}
