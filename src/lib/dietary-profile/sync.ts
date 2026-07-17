import type { FoodAnalysisResult } from "@/lib/ai/food-analyzer";
import { buildMealObservation } from "./classify-meal";
import { DEFAULT_DIETARY_PROFILE, DietaryProfile, DietCategory, SENSITIVE_CATEGORIES } from "./types";
import { updateDietaryProfile } from "./update";

interface MinimalDb {
  from: (table: string) => any;
}

/** For sensitive categories (pork/red meat/shellfish/other meat), rule 12
 * requires either an explicit correction or a second high-confidence
 * sighting before updating the profile — rather than adding a new
 * persisted counter field, this counts matches in the contact's own
 * recent meal_logs history (already-stored data), reusing the same
 * best-effort name-keyword classification as the current meal. */
async function countPriorSensitiveObservations(
  db: MinimalDb,
  isAdults: boolean,
  entityId: string,
  categoriesToCheck: DietCategory[]
): Promise<Partial<Record<DietCategory, number>>> {
  const sensitiveToCheck = categoriesToCheck.filter((c) => SENSITIVE_CATEGORIES.has(c));
  if (sensitiveToCheck.length === 0) return {};

  const { data: recentMeals } = await db
    .from("meal_logs")
    .select("foods")
    .eq(isAdults ? "adults_contact_id" : "client_id", entityId)
    .order("logged_at", { ascending: false })
    .limit(30);

  const counts: Partial<Record<DietCategory, number>> = {};
  for (const meal of recentMeals ?? []) {
    const observation = buildMealObservation({ foods: meal.foods ?? [], confidence: "high" } as FoodAnalysisResult);
    for (const category of observation.categories) {
      if (!sensitiveToCheck.includes(category)) continue;
      counts[category] = (counts[category] ?? 0) + 1;
    }
  }
  return counts;
}

/** Best-effort dietary-profile update after a meal is saved — reads the
 * contact/client's current profile, applies this meal's observation, and
 * writes it back only if something actually changed. Never throws: a
 * failure here should never break the WhatsApp reply flow (mirrors
 * notifyCaregiverOfFamilyMeal / recordMealSubmissionForReview's
 * best-effort convention in conversation-handler.ts). */
export async function updateDietaryProfileForSavedMeal(
  db: MinimalDb,
  isAdults: boolean,
  entityId: string,
  analysis: FoodAnalysisResult,
  isUserCorrection = false
): Promise<void> {
  try {
    const table = isAdults ? "adults_contacts" : "gym_clients";
    const { data: contactRow, error: readError } = await db.from(table).select("dietary_profile").eq("id", entityId).single();
    if (readError || !contactRow) {
      console.error("[dietary-profile] failed to read profile:", readError?.message);
      return;
    }

    const currentProfile: DietaryProfile = { ...DEFAULT_DIETARY_PROFILE, ...(contactRow.dietary_profile ?? {}) };
    const observation = buildMealObservation(analysis, isUserCorrection);
    if (observation.categories.length === 0) return;

    const priorCounts = await countPriorSensitiveObservations(db, isAdults, entityId, observation.categories);
    const nextProfile = updateDietaryProfile(currentProfile, observation, priorCounts);

    if (nextProfile === currentProfile) return; // no-op, nothing changed

    const { error: writeError } = await db.from(table).update({ dietary_profile: nextProfile }).eq("id", entityId);
    if (writeError) {
      console.error("[dietary-profile] failed to write profile:", writeError.message);
    }
  } catch (err) {
    console.error("[dietary-profile] update threw:", err instanceof Error ? err.message : err);
  }
}
