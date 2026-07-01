import { createClient } from "@/lib/supabase/server";
import type { ConfirmedMeal, MealSource, MealType, WorkspaceType } from "@/types";

export async function createMeal(params: {
  workspaceId: string;
  workspaceType: WorkspaceType;
  mealLoggerId: string;
  source: MealSource;
  mealType?: MealType;
  rawInput?: string;
  loggedAt?: Date;
}): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meals")
    .insert({
      workspace_id: params.workspaceId,
      workspace_type: params.workspaceType,
      meal_logger_id: params.mealLoggerId,
      source: params.source,
      meal_type: params.mealType,
      raw_input: params.rawInput,
      logged_at: (params.loggedAt ?? new Date()).toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create meal");
  return data.id;
}

export async function getMealById(mealId: string): Promise<ConfirmedMeal | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meals")
    .select("*, meal_items(*), meal_images(*)")
    .eq("id", mealId)
    .single();

  if (error || !data) return null;
  return mapMeal(data);
}

export async function confirmMeal(
  mealId: string,
  userId: string
): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("meals")
    .update({ confirmed_by_user: true, confirmed_at: new Date().toISOString() })
    .eq("id", mealId)
    .eq("meal_logger_id", userId);
}

export async function getMealsForUser(
  workspaceId: string,
  userId: string,
  limit = 20
): Promise<ConfirmedMeal[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meals")
    .select("*, meal_items(*), meal_images(*)")
    .eq("workspace_id", workspaceId)
    .eq("meal_logger_id", userId)
    .order("logged_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data.map(mapMeal);
}

export async function getMealsForWorkspaceSince(
  workspaceId: string,
  since: Date,
  limit = 100
): Promise<ConfirmedMeal[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meals")
    .select("*, meal_items(*)")
    .eq("workspace_id", workspaceId)
    .gte("logged_at", since.toISOString())
    .order("logged_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data.map(mapMeal);
}

export async function updateMealNutrition(
  mealId: string,
  nutrition: {
    caloriesMin?: number;
    caloriesMax?: number;
    proteinGramsMin?: number;
    proteinGramsMax?: number;
    carbohydratesGramsMin?: number;
    carbohydratesGramsMax?: number;
    fatGramsMin?: number;
    fatGramsMax?: number;
    fibreGramsMin?: number;
    fibreGramsMax?: number;
    foodGroups?: string[];
    analysisConfidence?: "low" | "medium" | "high";
  }
): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("meals")
    .update({
      calories_min: nutrition.caloriesMin,
      calories_max: nutrition.caloriesMax,
      protein_grams_min: nutrition.proteinGramsMin,
      protein_grams_max: nutrition.proteinGramsMax,
      carbohydrates_grams_min: nutrition.carbohydratesGramsMin,
      carbohydrates_grams_max: nutrition.carbohydratesGramsMax,
      fat_grams_min: nutrition.fatGramsMin,
      fat_grams_max: nutrition.fatGramsMax,
      fibre_grams_min: nutrition.fibreGramsMin,
      fibre_grams_max: nutrition.fibreGramsMax,
      food_groups: nutrition.foodGroups,
      analysis_confidence: nutrition.analysisConfidence,
    })
    .eq("id", mealId);
}

function mapMeal(row: any): ConfirmedMeal {
  const items = row.meal_items ?? [];
  const images = row.meal_images ?? [];

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    workspaceType: row.workspace_type,
    mealLoggerId: row.meal_logger_id,
    loggedAt: new Date(row.logged_at),
    mealType: row.meal_type,
    source: row.source,
    foods: items.map((item: any) => ({
      id: item.id,
      name: item.name,
      nameLocal: item.name_local,
      quantityDescription: item.quantity_description,
      quantityGrams: item.quantity_grams,
      caloriesEstimated: item.calories_estimated,
      proteinGramsEstimated: item.protein_grams_estimated,
      carbohydratesGramsEstimated: item.carbohydrates_grams_estimated,
      fatGramsEstimated: item.fat_grams_estimated,
      fibreGramsEstimated: item.fibre_grams_estimated,
      indbFoodCode: item.indb_food_code,
      indbMatchConfidence: item.indb_match_confidence,
      aiIdentified: item.ai_identified,
      userCorrected: item.user_corrected,
    })),
    nutritionEstimate: {
      calories: { min: row.calories_min, max: row.calories_max },
      proteinGrams: { min: row.protein_grams_min, max: row.protein_grams_max },
      carbohydratesGrams: { min: row.carbohydrates_grams_min, max: row.carbohydrates_grams_max },
      fatGrams: { min: row.fat_grams_min, max: row.fat_grams_max },
      fibreGrams: { min: row.fibre_grams_min, max: row.fibre_grams_max },
    },
    foodGroups: row.food_groups ?? [],
    amountEaten: row.amount_eaten,
    appetiteRating: row.appetite_rating,
    hydrationRecorded: row.hydration_recorded,
    analysisConfidence: row.analysis_confidence ?? "medium",
    confirmedByUser: row.confirmed_by_user,
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at) : undefined,
    rawInput: row.raw_input,
    notes: row.notes,
    imageUrls: images.map((img: any) => img.public_url).filter(Boolean),
  };
}
