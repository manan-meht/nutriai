import type { SupabaseClient } from "@supabase/supabase-js";
import { mapMealLogToFoodBalanceInput, mapRowToFoodBalanceProfile } from "./adapter";
import { DEFAULT_DIETARY_PROFILE } from "@/lib/dietary-profile";
import type { FoodBalanceMealInput, FoodBalanceUserProfile, NutritionGoal } from "@nutriai/health-scoring";
import type { DietaryProfile } from "@/lib/dietary-profile";
import type { RecentFocusHistoryEntry } from "./todays-focus";

/** Shared DB-fetching for "Today's Focus" — used by both the scheduled
 * morning cron (src/app/api/cron/send-meal-reminders/route.ts) and the
 * WhatsApp "change focus" reply handler
 * (src/lib/whatsapp/conversation-handler.ts), so the two trigger paths
 * don't duplicate how meals/profile/history are loaded and mapped. Kept
 * separate from todays-focus.ts itself, which stays a pure/deterministic
 * module with no database access at all (see that file's own module doc).
 */

export type TodaysFocusContactType = "adults_contact" | "gym_client";

export interface TodaysFocusInputs {
  meals: FoodBalanceMealInput[];
  dietaryProfile: DietaryProfile;
  profile?: FoodBalanceUserProfile;
  goal?: NutritionGoal;
  style: "concise" | "explanatory";
  history: RecentFocusHistoryEntry[];
}

const ANALYSIS_WINDOW_DAYS = 7;
const HISTORY_LOOKBACK_DAYS = 10;

export async function fetchTodaysFocusInputs(
  db: SupabaseClient,
  contactId: string,
  contactType: TodaysFocusContactType
): Promise<TodaysFocusInputs> {
  const contactColumn = contactType === "adults_contact" ? "adults_contact_id" : "client_id";
  const table = contactType === "adults_contact" ? "adults_contacts" : "gym_clients";

  const since = new Date();
  since.setDate(since.getDate() - ANALYSIS_WINDOW_DAYS);

  const [{ data: mealRows }, { data: profileRow }, { data: historyRows }] = await Promise.all([
    db.from("meal_logs").select("*").eq(contactColumn, contactId).gte("logged_at", since.toISOString()),
    db
      .from(table)
      .select(
        "date_of_birth, age, weight_kg, height_cm, gender, activity_level, resistance_training_status, preferred_units, nutrition_goals, target_weight_kg, dietary_profile, todays_focus_style"
      )
      .eq("id", contactId)
      .maybeSingle(),
    db
      .from("todays_focus_recommendations")
      .select("local_date, category, feedback")
      .eq("contact_id", contactId)
      .eq("contact_type", contactType)
      .order("local_date", { ascending: false })
      .limit(HISTORY_LOOKBACK_DAYS),
  ]);

  const meals = (mealRows ?? []).map((m: any) =>
    mapMealLogToFoodBalanceInput({
      id: m.id,
      loggedAt: m.logged_at,
      mealType: m.meal_type,
      foods: m.foods ?? [],
      aiSummary: m.ai_summary ?? undefined,
      humanCorrection: undefined,
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
    })
  );

  return {
    meals,
    dietaryProfile: { ...DEFAULT_DIETARY_PROFILE, ...(profileRow?.dietary_profile ?? {}) },
    profile: profileRow ? mapRowToFoodBalanceProfile(profileRow) : undefined,
    goal: profileRow?.nutrition_goals?.[0],
    style: (profileRow?.todays_focus_style as "concise" | "explanatory") ?? "concise",
    history: (historyRows ?? []).map((h: any) => ({ localDate: h.local_date, category: h.category, feedback: h.feedback })),
  };
}
