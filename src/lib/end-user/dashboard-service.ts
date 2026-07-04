import { createClient } from "@supabase/supabase-js";
import type { ContactType } from "@/lib/end-user/otp";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface EndUserMealSummary {
  id: string;
  loggedAt: string;
  mealType: string | null;
  foods: Array<{ name: string; quantity?: string }>;
  proteinGrams: { min: number; max: number };
  caloriesKcal: { min: number; max: number };
}

export interface EndUserWeeklyStats {
  mealsLoggedThisWeek: number;
  daysWithProteinSource: number;
  daysWithVegOrFruit: number;
}

export interface EndUserAccessEntry {
  role: "caregiver" | "coach";
  label: string;
}

export interface EndUserDashboard {
  contactName: string;
  contactType: ContactType;
  recentMeals: EndUserMealSummary[];
  weeklyStats: EndUserWeeklyStats;
  suggestion: string;
  accessList: EndUserAccessEntry[];
  isPaused: boolean;
}

const PROTEIN_KEYWORDS = ["chicken", "egg", "paneer", "dal", "lentil", "fish", "meat", "tofu", "yogurt", "curd", "milk", "bean", "nuts"];
const VEG_FRUIT_KEYWORDS = ["salad", "vegetable", "veggie", "fruit", "spinach", "carrot", "banana", "apple", "greens", "sabzi"];

export async function getEndUserDashboard(contactId: string, contactType: ContactType): Promise<EndUserDashboard> {
  const db = admin();
  const table = contactType === "adults" ? "adults_contacts" : "gym_clients";
  const ownerColumn = contactType === "adults" ? "caregiver_id" : "trainer_id";
  const mealColumn = contactType === "adults" ? "adults_contact_id" : "client_id";

  const { data: contact } = await db
    .from(table)
    .select(`full_name, ${ownerColumn}`)
    .eq("id", contactId)
    .single();

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: meals } = await db
    .from("meal_logs")
    .select("*")
    .eq(mealColumn, contactId)
    .gte("logged_at", weekAgo)
    .order("logged_at", { ascending: false })
    .limit(30);

  const mealRows = meals ?? [];

  const recentMeals: EndUserMealSummary[] = mealRows.slice(0, 10).map((m: any) => ({
    id: m.id,
    loggedAt: m.logged_at,
    mealType: m.meal_type,
    foods: m.foods ?? [],
    proteinGrams: { min: m.total_protein_min ?? 0, max: m.total_protein_max ?? 0 },
    caloriesKcal: { min: m.total_calories_min ?? 0, max: m.total_calories_max ?? 0 },
  }));

  const dayHasKeyword = (keywords: string[]) => {
    const days = new Set<string>();
    for (const m of mealRows) {
      const text = ((m.foods ?? []).map((f: any) => f.name).join(" ") + " " + (m.ai_summary ?? "")).toLowerCase();
      if (keywords.some((k) => text.includes(k))) {
        days.add(new Date(m.logged_at).toDateString());
      }
    }
    return days.size;
  };

  const weeklyStats: EndUserWeeklyStats = {
    mealsLoggedThisWeek: mealRows.length,
    daysWithProteinSource: dayHasKeyword(PROTEIN_KEYWORDS),
    daysWithVegOrFruit: dayHasKeyword(VEG_FRUIT_KEYWORDS),
  };

  let suggestion = "You're doing great — keep logging your meals to see your trends! 🌟";
  if (weeklyStats.mealsLoggedThisWeek > 0 && weeklyStats.daysWithVegOrFruit === 0) {
    suggestion = "Try adding a vegetable or fruit to a meal today — small additions add up! 🥦";
  } else if (weeklyStats.mealsLoggedThisWeek > 0 && weeklyStats.daysWithProteinSource < 3) {
    suggestion = "A protein source at more meals can help keep energy steady through the day. 💪";
  }

  const accessList: EndUserAccessEntry[] = contact?.[ownerColumn as keyof typeof contact]
    ? [{ role: contactType === "adults" ? "caregiver" : "coach", label: contactType === "adults" ? "Your family contact" : "Your coach" }]
    : [];

  const { data: access } = await db
    .from("end_user_access_settings")
    .select("paused_at")
    .eq("contact_id", contactId)
    .maybeSingle();

  return {
    contactName: contact?.full_name ?? "there",
    contactType,
    recentMeals,
    weeklyStats,
    suggestion,
    accessList,
    isPaused: !!access?.paused_at,
  };
}

export async function setSharingPaused(contactId: string, contactType: ContactType, paused: boolean): Promise<void> {
  const db = admin();
  await db.from("end_user_access_settings").upsert({
    contact_id: contactId,
    contact_type: contactType,
    paused_at: paused ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  });
}

export async function requestRemoval(contactId: string, contactType: ContactType): Promise<void> {
  const db = admin();
  await db.from("end_user_access_settings").upsert({
    contact_id: contactId,
    contact_type: contactType,
    removal_requested_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}
