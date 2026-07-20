// Canonical, role-agnostic shape ProfileDashboard renders from. Both
// AdultsContactDetails (src/app/(adults)/adults/dashboard/actions.ts) and
// ClientDetails (src/app/(gym)/gym/dashboard/actions.ts) are adapted into
// this shape at the call site — this file never talks to Supabase directly,
// keeping "data comes from the tracked profile" fetches exactly where they
// already are (getContactDetails/getClientDetails), not duplicated here.

import type { AdultsContactDetails, AdultsMealLog } from "@/app/(adults)/adults/dashboard/actions";
import type { ClientDetails, MealLog as GymMealLog } from "@/app/(gym)/gym/dashboard/actions";
import type { HumanCorrectionFields } from "@nutriai/dashboard-core";

export interface ProfileDashboardMeal {
  id: string;
  profileId: string;
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

export interface ProfileDashboardWorkout {
  id: string;
  loggedAt: string;
  description?: string;
  workoutType?: string;
  durationMinutes?: number;
}

export interface ProfileDashboardBiomarker {
  id: string;
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

/** The tracked profile itself — a subset of AdultsContact/GymClient fields
 * common to both, plus the Food Balance Score profile fields both already
 * extend. Fields only one side has (e.g. adults' relationship/timezone,
 * gym's bmi) are optional here rather than widening either source type. */
export interface ProfileDashboardProfile {
  id: string;
  fullName: string;
  whatsappNumber: string;
  age?: number;
  gender?: "male" | "female" | "other";
  weightKg?: number;
  heightCm?: number;
  mealCount: number;
  trackedBiomarkers: string[];
  inviteAcceptedAt?: string;
  /** adults-only: "self" hides the invite card and changes header copy. */
  relationshipType?: "self" | "family_caregiver";
  /** adults-only free-text relationship (son/daughter/parent/etc). */
  relationship?: string;
  /** adults-only — used to format meal timestamps in the contact's own zone. */
  timezone?: string;
  // Food Balance Score profile fields (shared by both AdultsContact/GymClient).
  dateOfBirth?: string;
  metabolicEquationSex?: "male" | "female";
  activityLevel?: "mostly_sitting" | "lightly_active" | "moderately_active" | "very_active" | "unknown";
  resistanceTrainingStatus?: "regularly" | "sometimes" | "not_currently" | "unknown";
  nutritionGoals?: Array<
    | "reduce_weight"
    | "reduce_body_fat"
    | "gain_muscle"
    | "body_recomposition"
    | "maintain_weight"
    | "improve_nutrition"
    | "healthy_aging"
  >;
  targetWeightKg?: number;
}

export interface ProfileDashboardData {
  profile: ProfileDashboardProfile;
  meals: ProfileDashboardMeal[];
  /** Undefined on the adults/family product — gym-only. */
  workouts?: ProfileDashboardWorkout[];
  /** Undefined on the adults/family product — gym-only. */
  biomarkers?: ProfileDashboardBiomarker[];
}

function adaptMeal(m: AdultsMealLog | GymMealLog, profileId: string): ProfileDashboardMeal {
  return {
    id: m.id,
    profileId,
    mealType: m.mealType,
    loggedAt: m.loggedAt,
    foods: m.foods,
    totalCaloriesMin: m.totalCaloriesMin,
    totalCaloriesMax: m.totalCaloriesMax,
    totalProteinMin: m.totalProteinMin,
    totalProteinMax: m.totalProteinMax,
    totalCarbsMin: m.totalCarbsMin,
    totalCarbsMax: m.totalCarbsMax,
    totalFatMin: m.totalFatMin,
    totalFatMax: m.totalFatMax,
    totalFiberMin: m.totalFiberMin,
    totalFiberMax: m.totalFiberMax,
    aiSummary: m.aiSummary,
    imageUrl: m.imageUrl,
    humanCorrection: m.humanCorrection,
  };
}

export function adaptAdultsContactDetails({ contact, meals }: AdultsContactDetails): ProfileDashboardData {
  return {
    profile: {
      id: contact.id,
      fullName: contact.fullName,
      whatsappNumber: contact.whatsappNumber,
      age: contact.age,
      gender: contact.gender,
      weightKg: contact.weightKg,
      heightCm: contact.heightCm,
      mealCount: contact.mealCount,
      trackedBiomarkers: contact.trackedBiomarkers,
      inviteAcceptedAt: contact.inviteAcceptedAt,
      relationshipType: contact.relationshipType,
      relationship: contact.relationship,
      timezone: contact.timezone,
      dateOfBirth: contact.dateOfBirth,
      metabolicEquationSex: contact.metabolicEquationSex,
      activityLevel: contact.activityLevel,
      resistanceTrainingStatus: contact.resistanceTrainingStatus,
      nutritionGoals: contact.nutritionGoals,
      targetWeightKg: contact.targetWeightKg,
    },
    meals: meals.map((m) => adaptMeal(m, contact.id)),
  };
}

export function adaptClientDetails({ client, meals, workouts, biomarkers }: ClientDetails): ProfileDashboardData {
  return {
    profile: {
      id: client.id,
      fullName: client.fullName,
      whatsappNumber: client.whatsappNumber,
      age: client.age,
      gender: client.gender,
      weightKg: client.weightKg,
      heightCm: client.heightCm,
      mealCount: client.mealCount,
      trackedBiomarkers: client.trackedBiomarkers,
      dateOfBirth: client.dateOfBirth,
      metabolicEquationSex: client.metabolicEquationSex,
      activityLevel: client.activityLevel,
      resistanceTrainingStatus: client.resistanceTrainingStatus,
      nutritionGoals: client.nutritionGoals,
      targetWeightKg: client.targetWeightKg,
    },
    meals: meals.map((m) => adaptMeal(m, client.id)),
    workouts,
    biomarkers,
  };
}
