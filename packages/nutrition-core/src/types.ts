// Shared between nutriai-fresh (main web app) and apps/mobile-api. Keep this
// package framework-agnostic (no next/headers, no cookie-based clients) so
// both a cookie-authenticated Next.js app and a bearer-token-authenticated
// edge API can use it — every function here takes an already-constructed
// SupabaseClient rather than building its own.

// Loosely typed on purpose: the main app additionally narrows these fields
// to PresenceStatus/BalanceStatus/Likelihood unions (see
// src/lib/nutrition/human-corrections.ts) for its own classification-display
// logic, which isn't needed by callers that just relay this data (e.g. the
// mobile API). Kept as plain strings here rather than pulling that
// classification module (and its dependents) into this package.
export interface HumanCorrectionFields {
  proteinAnchorStatus?: string;
  vegetableFiberStatus?: string;
  mealBalanceStatus?: string;
  homeCookedLikelihood?: string;
  enjoymentFoodPresent?: boolean;
  sugaryDrinkPresent?: boolean;
  ultraProcessedLikelihood?: string;
  suggestedNextStep?: string;
}

export interface AdultsGoal {
  id: string;
  goalType: string;
  title: string;
  description?: string;
  targetCaloriesMin?: number;
  targetCaloriesMax?: number;
  targetProteinG?: number;
  targetMealsPerDay?: number;
  status: string;
}

// Food Balance Score profile fields (see supabase/migrations/0027_food_balance_score.sql
// and packages/health-scoring) — shared shape reused by both AdultsContact and
// GymClient below rather than duplicated inline.
export interface FoodBalanceProfileFields {
  dateOfBirth?: string;
  metabolicEquationSex?: "male" | "female";
  activityLevel?: "mostly_sitting" | "lightly_active" | "moderately_active" | "very_active" | "unknown";
  resistanceTrainingStatus?: "regularly" | "sometimes" | "not_currently" | "unknown";
  preferredUnits?: "metric" | "imperial";
  primaryNutritionGoal?:
    | "reduce_weight"
    | "reduce_body_fat"
    | "gain_muscle"
    | "body_recomposition"
    | "maintain_weight"
    | "improve_nutrition"
    | "healthy_aging";
  targetWeightKg?: number;
}

export interface AdultsContact extends FoodBalanceProfileFields {
  id: string;
  workspaceId: string;
  fullName: string;
  whatsappNumber: string;
  relationship?: string;
  relationshipType: "self" | "family_caregiver";
  age?: number;
  gender?: "male" | "female" | "other";
  weightKg?: number;
  heightCm?: number;
  healthNotes?: string;
  inviteSentAt?: string;
  inviteAcceptedAt?: string;
  createdAt: string;
  deletedAt?: string;
  trackedBiomarkers: string[];
  goals: AdultsGoal[];
  mealCount: number;
  lastMealAt?: string;
  timezone: string;
  remindersEnabled: boolean;
  reminderTimes: string[];
}

export interface AdultsMealLog {
  id: string;
  contactId: string;
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
  imageUrl?: string;
  humanCorrection?: HumanCorrectionFields;
}

export interface AdultsContactDetails {
  contact: AdultsContact;
  meals: AdultsMealLog[];
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

export interface GymClient extends FoodBalanceProfileFields {
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
  imageUrl?: string;
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
