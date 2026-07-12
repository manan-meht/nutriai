import { classifyMeal, applyHumanCorrection, type ClassifiedMeal } from "@nutriai/dashboard-core";
import type {
  FoodBalanceMealInput,
  FoodBalanceUserProfile,
  ProcessingLevel,
  MealPreparationSource,
  DiversityFoodGroup,
} from "@nutriai/health-scoring";

// Mirrors src/lib/food-balance/adapter.ts in the main web app — duplicated
// here rather than factored into a shared package, matching this app's
// existing pattern of small local duplicates (e.g. normalizePhone in
// lib/adults.ts/lib/gym.ts) instead of adding a new cross-package
// dependency graph under time pressure. Keep the two in sync manually if
// the scoring adapter logic changes.

function midpoint(min: number, max: number): number {
  return (min + max) / 2;
}

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

function foodGroupsFrom(classified: ClassifiedMeal): DiversityFoodGroup[] {
  const groups: DiversityFoodGroup[] = [];
  if (classified.proteinAnchorStatus !== "missing") groups.push("protein_sources");
  if (classified.vegetableFiberStatus !== "missing") groups.push("vegetables");
  return groups;
}

interface MealLogLike {
  id: string;
  loggedAt: string;
  mealType: string;
  foods: any[];
  aiSummary?: string;
  humanCorrection?: any;
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
}

export function mapMealLogToFoodBalanceInput(meal: MealLogLike): FoodBalanceMealInput {
  const classified = applyHumanCorrection(
    classifyMeal({ id: meal.id, loggedAt: meal.loggedAt, mealType: meal.mealType, foods: meal.foods, aiSummary: meal.aiSummary }),
    meal.humanCorrection
  );

  return {
    id: meal.id,
    loggedAt: meal.loggedAt,
    mealType: meal.mealType,
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
    wholeFoods: meal.foods.map((f: any) => f.name?.toLowerCase().trim()).filter(Boolean),
    foodGroups: foodGroupsFrom(classified),
  };
}

interface RawFoodBalanceProfileRow {
  date_of_birth?: string | null;
  age?: number | null;
  weight_kg?: number | null;
  height_cm?: number | null;
  metabolic_equation_sex?: string | null;
  activity_level?: string | null;
  resistance_training_status?: string | null;
  preferred_units?: string | null;
  primary_nutrition_goal?: string | null;
  target_weight_kg?: number | null;
}

export function mapRowToFoodBalanceProfile(row: RawFoodBalanceProfileRow): FoodBalanceUserProfile | undefined {
  if (!row.primary_nutrition_goal) return undefined;

  return {
    goal: row.primary_nutrition_goal as FoodBalanceUserProfile["goal"],
    dateOfBirth: row.date_of_birth ?? undefined,
    age: row.age ?? undefined,
    heightCm: row.height_cm ?? undefined,
    currentWeightKg: row.weight_kg ?? undefined,
    metabolicEquationSex: (row.metabolic_equation_sex as FoodBalanceUserProfile["metabolicEquationSex"]) ?? undefined,
    activityLevel: (row.activity_level as FoodBalanceUserProfile["activityLevel"]) ?? undefined,
    targetWeightKg: row.target_weight_kg ?? undefined,
    resistanceTraining: (row.resistance_training_status as FoodBalanceUserProfile["resistanceTraining"]) ?? undefined,
    preferredUnits: (row.preferred_units as FoodBalanceUserProfile["preferredUnits"]) ?? undefined,
  };
}
