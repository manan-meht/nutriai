import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "./supabase";
import type { HumanCorrectionFields } from "./adults";

// Read-only mirror of the relevant parts of the main app's
// src/app/(gym)/gym/dashboard/actions.ts — see adults.ts's top comment for
// why this is duplicated rather than imported.

const APPLICABLE_REVIEW_STATUSES = new Set(["correct", "partially_correct", "incorrect"]);

function definedAndKnown(value: string | null | undefined): string | undefined {
  return value && value !== "unknown" ? value : undefined;
}

async function fetchHumanCorrectionsByMealLogId(mealLogIds: string[]): Promise<Record<string, HumanCorrectionFields>> {
  if (mealLogIds.length === 0) return {};
  const db = createServiceClient();
  const { data } = await db
    .from("meal_submissions")
    .select("meal_log_id, human_meal_reviews(*)")
    .in("meal_log_id", mealLogIds);

  const result: Record<string, HumanCorrectionFields> = {};
  for (const row of data ?? []) {
    if (!row.meal_log_id) continue;
    const reviews: any[] = row.human_meal_reviews ?? [];
    if (!reviews.length) continue;
    const latest = [...reviews].sort((a, b) => new Date(b.reviewed_at).getTime() - new Date(a.reviewed_at).getTime())[0];
    if (!APPLICABLE_REVIEW_STATUSES.has(latest.review_status)) continue;

    result[row.meal_log_id] = {
      proteinAnchorStatus: definedAndKnown(latest.corrected_protein_anchor_status),
      vegetableFiberStatus: definedAndKnown(latest.corrected_vegetable_fiber_status),
      mealBalanceStatus: definedAndKnown(latest.corrected_meal_balance_status),
      homeCookedLikelihood: definedAndKnown(latest.corrected_home_cooked_likelihood),
      enjoymentFoodPresent: latest.corrected_enjoyment_food_present ?? undefined,
      sugaryDrinkPresent: latest.corrected_sugary_drink_present ?? undefined,
      ultraProcessedLikelihood: definedAndKnown(latest.corrected_ultra_processed_likelihood),
      suggestedNextStep: latest.corrected_suggestion ?? undefined,
    };
  }
  return result;
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
  goals: GymClientGoal[];
  mealCount: number;
  lastMealAt?: string;
  trackedBiomarkers: string[];
}

export interface MealLog {
  id: string;
  clientId: string;
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
  humanCorrection?: HumanCorrectionFields;
}

export interface WorkoutLog {
  id: string;
  clientId: string;
  loggedAt: string;
  description?: string;
  workoutType?: string;
  durationMinutes?: number;
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

export interface ClientDetails {
  client: GymClient;
  meals: MealLog[];
  workouts: WorkoutLog[];
  biomarkers: BiomarkerLog[];
}

export async function getOrCreateWorkspace(
  userId: string,
  coachName?: string
): Promise<{ id: string; name: string; extraCapacity: number }> {
  const admin = createServiceClient();

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

async function fetchMealsByClient(supabase: SupabaseClient, clientIds: string[]) {
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

export async function getClients(workspaceId: string, supabase: SupabaseClient): Promise<GymClient[]> {
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

export async function getClientDetails(clientId: string, supabase: SupabaseClient): Promise<ClientDetails | null> {
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
