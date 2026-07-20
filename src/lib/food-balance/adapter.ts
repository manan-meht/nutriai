import { classifyMeal, applyHumanCorrection, type ClassifiedMeal } from "@nutriai/dashboard-core";
import {
  calculateMacroTargets,
  type FoodBalanceMealInput,
  type FoodBalanceUserProfile,
  type ProcessingLevel,
  type MealPreparationSource,
  type DiversityFoodGroup,
  type MacroTargets,
  type MacroTargetValue,
} from "@nutriai/health-scoring";
import type { AdultsMealLog, MealLog, FoodBalanceProfileFields } from "@nutriai/nutrition-core";

/** Structural subset shared by AdultsMealLog and (gym) MealLog — this
 * mapper only reads these fields, so one function serves both products
 * rather than duplicating it per-product. */
type MealLogLike = Pick<
  AdultsMealLog | MealLog,
  | "id"
  | "loggedAt"
  | "mealType"
  | "foods"
  | "aiSummary"
  | "humanCorrection"
  | "totalCaloriesMin"
  | "totalCaloriesMax"
  | "totalProteinMin"
  | "totalProteinMax"
  | "totalCarbsMin"
  | "totalCarbsMax"
  | "totalFatMin"
  | "totalFatMax"
  | "totalFiberMin"
  | "totalFiberMax"
>;

function midpoint(min: number, max: number): number {
  return (min + max) / 2;
}

/** Approximate 0-3 vegetable/fruit "servings" from the existing categorical
 * vegetableFiberStatus signal (missing/partial/present) — the meal
 * classification pipeline does not yet produce numeric servings (see
 * final-report "fields still needed from the meal-classification
 * pipeline"). This is a documented heuristic, not fabricated precision: it
 * only ever feeds a 0-100 component score, never a displayed gram/serving
 * count. */
function approximateServings(status: ClassifiedMeal["vegetableFiberStatus"]): number {
  if (status === "present") return 1.5;
  if (status === "partial") return 0.75;
  return 0;
}

function processingLevelFrom(classified: ClassifiedMeal): ProcessingLevel {
  if (classified.ultraProcessedLikelihood === "high") return "ultra_processed";
  if (classified.ultraProcessedLikelihood === "medium") return "processed";
  if (classified.ultraProcessedLikelihood === "low") return "minimally_processed";
  return "unknown";
}

function preparationSourceFrom(classified: ClassifiedMeal): MealPreparationSource {
  if (classified.homeCookedLikelihood === "high") return "home_prepared";
  if (classified.homeCookedLikelihood === "low") return "restaurant_prepared";
  return "unknown";
}

/** No food-group tagging exists yet in the classification pipeline, so this
 * derives a coarse guess from the same protein/veg keyword signals already
 * computed — deliberately conservative (only "protein_sources" and
 * "vegetables" are ever inferred; legumes/whole_grains/nuts_and_seeds/fruits
 * are left for a future pipeline enhancement rather than guessed). */
function foodGroupsFrom(classified: ClassifiedMeal): DiversityFoodGroup[] {
  const groups: DiversityFoodGroup[] = [];
  if (classified.proteinAnchorStatus !== "missing") groups.push("protein_sources");
  if (classified.vegetableFiberStatus !== "missing") groups.push("vegetables");
  return groups;
}

/** Maps a stored meal log (already run through classifyMeal/
 * applyHumanCorrection, see @nutriai/dashboard-core) into the scoring
 * package's framework-independent input shape. Confidence/confirmation
 * fields are not yet tracked per-meal in `meal_logs` — every non-deleted,
 * non-duplicate row is treated as user-confirmed, matching how this product
 * actually works today (there is no separate "pending confirmation" meal
 * state); see the Food Balance Score implementation report for what a real
 * per-meal AI-confidence field would improve here. Shared by both the
 * adults and gym products — see MealLogLike above. */
export function mapMealLogToFoodBalanceInput(
  meal: MealLogLike,
  options: { isDeleted?: boolean; isDuplicate?: boolean } = {}
): FoodBalanceMealInput {
  const classified = applyHumanCorrection(
    classifyMeal({ id: meal.id, loggedAt: meal.loggedAt, mealType: meal.mealType, foods: meal.foods, aiSummary: meal.aiSummary }),
    // nutrition-core's HumanCorrectionFields is intentionally loosely typed
    // (plain strings) since it's shared with the mobile API; dashboard-core
    // narrows those same string values to PresenceStatus/BalanceStatus/
    // Likelihood unions for its own display logic — see human-corrections.ts.
    meal.humanCorrection as any
  );

  return {
    id: meal.id,
    loggedAt: meal.loggedAt,
    mealType: meal.mealType,
    isDeleted: options.isDeleted,
    isDuplicate: options.isDuplicate,
    isUserConfirmed: true,
    isUserCorrected: Boolean(meal.humanCorrection),
    calories: midpoint(meal.totalCaloriesMin, meal.totalCaloriesMax),
    proteinG: midpoint(meal.totalProteinMin, meal.totalProteinMax),
    carbsG: midpoint(meal.totalCarbsMin, meal.totalCarbsMax),
    fatG: midpoint(meal.totalFatMin, meal.totalFatMax),
    fibreG: midpoint(meal.totalFiberMin, meal.totalFiberMax),
    fruitServings: approximateServings(classified.vegetableFiberStatus) / 2,
    vegetableServings: approximateServings(classified.vegetableFiberStatus),
    processingLevel: processingLevelFrom(classified),
    processingConfidence: 0.6,
    preparationSource: preparationSourceFrom(classified),
    preparationConfidence: 0.6,
    wholeFoods: meal.foods.map((f) => f.name?.toLowerCase().trim()).filter(Boolean),
    foodGroups: foodGroupsFrom(classified),
  };
}

export interface RawFoodBalanceProfileRow {
  date_of_birth?: string | null;
  age?: number | null;
  weight_kg?: number | null;
  height_cm?: number | null;
  gender?: string | null;
  activity_level?: string | null;
  resistance_training_status?: string | null;
  preferred_units?: string | null;
  nutrition_goals?: string[] | null;
  target_weight_kg?: number | null;
}

/** Wraps a stored min/target/max override (as read straight off the
 * `custom_macro_targets` jsonb column) with the display unit/source, since
 * only the numbers are persisted. */
function toCustomMacroTargetValue(
  raw: { min: number | null; target: number; max: number | null } | undefined,
  unit: MacroTargetValue["unit"]
): MacroTargetValue | undefined {
  if (!raw) return undefined;
  return { min: raw.min, target: raw.target, max: raw.max, unit, source: "user_custom" };
}

/** Tistra's recommended macro targets are always computed live from the
 * profile (never persisted) — `activeMacroTargets` is what the dashboard
 * and recommendations actually use: any macro the user has customized
 * (`customMacroTargets`) overrides that one macro's recommendation, all
 * others still come from the live calculation. Resetting a macro is just
 * clearing its entry in `customMacroTargets`, never a separate stored
 * "reset" value. */
export function resolveMacroTargets(
  profile: FoodBalanceUserProfile,
  customMacroTargets: FoodBalanceProfileFields["customMacroTargets"] | undefined
): { recommendedMacroTargets: MacroTargets; activeMacroTargets: MacroTargets } {
  const recommendedMacroTargets = calculateMacroTargets(profile);
  const activeMacroTargets: MacroTargets = {
    ...recommendedMacroTargets,
    calories: toCustomMacroTargetValue(customMacroTargets?.calories, "kcal") ?? recommendedMacroTargets.calories,
    protein: toCustomMacroTargetValue(customMacroTargets?.protein, "g") ?? recommendedMacroTargets.protein,
    carbs: toCustomMacroTargetValue(customMacroTargets?.carbs, "g") ?? recommendedMacroTargets.carbs,
    fat: toCustomMacroTargetValue(customMacroTargets?.fat, "g") ?? recommendedMacroTargets.fat,
    fiber: toCustomMacroTargetValue(customMacroTargets?.fiber, "g") ?? recommendedMacroTargets.fiber,
  };
  return { recommendedMacroTargets, activeMacroTargets };
}

export function metabolicSexFromGender(gender?: string | null): FoodBalanceUserProfile["metabolicEquationSex"] {
  // The form no longer asks a separate "sex for metabolic estimate"
  // question (see NutritionGoalFields.tsx's git history) — gender is used
  // directly for the BMR equation. "male"/"female" map 1:1; any other
  // value (or none set) leaves this undefined, same as before when the
  // separate question went unanswered — the energy/calorie component is
  // simply omitted, never guessed.
  return gender === "male" || gender === "female" ? gender : undefined;
}

/** Maps the profile columns (see
 * supabase/migrations/0027_food_balance_score.sql,
 * 0035_multi_nutrition_goals.sql) plus the pre-existing age/weight/height/
 * gender fields already on adults_contacts/gym_clients into the scoring
 * package's profile input. Returns undefined when no goal has been
 * selected — Food Foundation is still calculated in that case (see
 * calculate.ts), just without Goal Alignment. */
export function mapRowToFoodBalanceProfile(row: RawFoodBalanceProfileRow): FoodBalanceUserProfile | undefined {
  const goals = (row.nutrition_goals ?? []) as FoodBalanceUserProfile["goals"];
  if (!goals || goals.length === 0) return undefined;

  return {
    goals,
    dateOfBirth: row.date_of_birth ?? undefined,
    age: row.age ?? undefined,
    heightCm: row.height_cm ?? undefined,
    currentWeightKg: row.weight_kg ?? undefined,
    metabolicEquationSex: metabolicSexFromGender(row.gender),
    activityLevel: (row.activity_level as FoodBalanceUserProfile["activityLevel"]) ?? undefined,
    targetWeightKg: row.target_weight_kg ?? undefined,
    resistanceTraining: (row.resistance_training_status as FoodBalanceUserProfile["resistanceTraining"]) ?? undefined,
    preferredUnits: (row.preferred_units as FoodBalanceUserProfile["preferredUnits"]) ?? undefined,
  };
}
