import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchHumanCorrectionsByMealLogId } from "./human-corrections";
import type { BiomarkerLog, ClientDetails, GymClient, MealLog, WorkoutLog } from "./types";

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

/** Active (non-removed) clients for a workspace. `supabase` should be an
 * RLS-scoped client (cookie- or bearer-token-authenticated). */
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

/** Previously-removed clients — data preserved and viewable. */
export async function getRemovedClients(workspaceId: string, supabase: SupabaseClient): Promise<GymClient[]> {
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

/** A single client's profile plus recent meals/workouts/biomarkers, scoped
 * to the authenticated trainer via the `trainer_id` match below. `admin` is
 * a service-role client, used only for the human-corrections lookup.
 * `sinceDays` bounds the meals/workouts history window (biomarkers are
 * unbounded — a trend line needs the full history). */
export async function getClientDetails(
  clientId: string,
  supabase: SupabaseClient,
  admin: SupabaseClient,
  sinceDays: number
): Promise<ClientDetails | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const since = new Date();
  since.setDate(since.getDate() - sinceDays);

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
  const mealsByClient = {
    [clientId]: { count: mealsRes.data?.length ?? 0, lastAt: mealsRes.data?.[0]?.logged_at },
  };
  const client = mapClientRow(c, mealsByClient);

  const rawMeals = mealsRes.data ?? [];
  const corrections = await fetchHumanCorrectionsByMealLogId(admin, rawMeals.map((m: any) => m.id));

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
