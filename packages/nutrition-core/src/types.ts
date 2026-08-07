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
  /** Legacy subjective activity-level answer — kept for audit/back-compat
   * only. New code should read derivedActivityLevel (computed from
   * dailyMovementLevel/weeklyModerateActivity via
   * @nutriai/health-scoring's deriveActivityLevel) instead. */
  activityLevel?: "mostly_sitting" | "lightly_active" | "moderately_active" | "very_active" | "unknown";
  /** Legacy "resistance training" answer — kept for audit/back-compat
   * only. New code should read strengthExerciseFrequency instead. */
  resistanceTrainingStatus?: "regularly" | "sometimes" | "not_currently" | "unknown";
  /** "What does a typical day look like?" — see
   * @nutriai/health-scoring's DailyMovementLevel for the full doc. */
  dailyMovementLevel?: "mostly_seated" | "mixed_light_movement" | "moving_several_hours" | "physically_demanding" | "not_sure";
  /** "In a typical week, how much activity makes you breathe faster?" —
   * see @nutriai/health-scoring's WeeklyModerateActivity. */
  weeklyModerateActivity?: "under_30" | "30_to_89" | "90_to_149" | "150_to_299" | "300_plus" | "not_sure";
  /** "How many days a week do you do strength-building exercises?" — see
   * @nutriai/health-scoring's StrengthExerciseFrequency. */
  strengthExerciseFrequency?: "zero_days" | "less_than_weekly" | "one_day" | "two_days" | "three_plus_days" | "not_sure";
  /** Computed from dailyMovementLevel + weeklyModerateActivity via
   * @nutriai/health-scoring's deriveActivityLevel — the category
   * calorie/macro/recommendation logic actually consumes. Recomputed
   * whenever either behavioural answer changes. */
  derivedActivityLevel?: "not_active" | "lightly_active" | "moderately_active" | "very_active";
  /** True when the three fields above were approximated from the legacy
   * activityLevel/resistanceTrainingStatus values by the one-time backfill
   * migration, rather than directly answered — see
   * supabase/migrations/0041_activity_profile_behavioural_questions.sql. */
  activityProfileMigrated?: boolean;
  preferredUnits?: "metric" | "imperial";
  /** One or more simultaneous goals — see packages/health-scoring's
   * FoodBalanceUserProfile.goals doc comment for how multiple goals are
   * blended into a single energy/protein target rather than picking one
   * "primary" winner. */
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
  /** A user's (or coach's) manual override of one or more of Tistra's
   * recommended macro targets — see @nutriai/health-scoring's
   * calculateMacroTargets, which always computes the *recommendation*
   * live from goals + profile data and is never itself persisted. Only
   * present when the user has actually edited a target; absent/undefined
   * means "use Tistra's recommendation for every macro". Keyed by macro,
   * each value matching @nutriai/health-scoring's MacroTargetValue shape
   * (min/target/max only — unit/source are re-derived by the caller). */
  customMacroTargets?: Partial<Record<"calories" | "protein" | "carbs" | "fat" | "fiber", { min: number | null; target: number; max: number | null }>>;
  macroTargetsCustomizedAt?: string;
}

/** Sum of a person's logged macros over a window — always computed from
 * the midpoint of each meal's min/max range (same convention as
 * src/lib/food-balance/adapter.ts's `midpoint`), so this is a single
 * representative number rather than another min/max range. Used as the
 * selection-screen fallback when there isn't enough data yet for a Food
 * Balance Score (see PersonCard) — "not much information on this screen"
 * otherwise. */
export interface MacroWindowSummary {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  mealCount: number;
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
  /** Timestamp of the contact's most recent inbound WhatsApp message (any
   * message, not just ones that resulted in a logged meal) — sourced from
   * whatsapp_conversations.last_message_at. Used to distinguish "never
   * connected" (inviteAcceptedAt unset) from "connected but gone quiet"
   * (inviteAcceptedAt set, but lastMessageAt more than 24h ago — meal
   * reminders stop being sent past that point). Undefined if the contact
   * has no conversation row yet (same as never having messaged). */
  lastMessageAt?: string;
  createdAt: string;
  deletedAt?: string;
  trackedBiomarkers: string[];
  goals: AdultsGoal[];
  mealCount: number;
  lastMealAt?: string;
  /** Short-lived signed URL (see resolveSignedContactAvatarUrl), not the
   * raw stored path — undefined when no photo has been uploaded, in which
   * case the UI falls back to a colored-initials placeholder. */
  photoUrl?: string;
  /** Short-lived signed URL for the most recent logged meal's photo —
   * undefined if that meal has no photo (or there are no meals yet), in
   * which case the UI shows a placeholder rather than omitting the "Last
   * meal" slot. Not the meal itself — just its thumbnail, for dashboard
   * cards; the full meal list lives in AdultsContactDetails.meals. */
  lastMealPhotoUrl?: string;
  /** Total logged calories per day for the rolling 7 days ending today,
   * oldest first, always 7 entries (0 for days with no meals) — feeds the
   * family dashboard's MiniTrendChart sparkline. Optional only because
   * mapContactRow is the sole computer of it (same convention as
   * macroSummary above). */
  last7DaysCalories?: number[];
  /** Meal count for a true rolling 7-day window ending today (see
   * computeRollingWeekMealCount) — distinct from macroSummary.week's
   * Monday-reset calendar-week count. Optional for the same reason as
   * last7DaysCalories above. */
  last7DaysMealCount?: number;
  timezone: string;
  remindersEnabled: boolean;
  reminderTimes: string[];
  /** Computed in the contact's own timezone (see computeMacroWindowSummaries
   * in adults.ts) — both always present (zeroed if no meals in that
   * window) whenever this is populated at all. Optional because only
   * mapContactRow (shared by mobile-api and the main web app's
   * getContacts/getRemovedContacts) computes it — the web app's own
   * separate getContactDetails action doesn't need it (no PersonCard
   * equivalent there) and doesn't populate it. */
  macroSummary?: { today: MacroWindowSummary; week: MacroWindowSummary };
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
  /** See AdultsContact.macroSummary's identical doc (both the "optional"
   * rationale and gym_clients having no timezone column, so this is
   * computed against a fixed default — see computeMacroWindowSummaries's
   * caller in gym.ts — rather than a per-client one). */
  macroSummary?: { today: MacroWindowSummary; week: MacroWindowSummary };
  /** See AdultsContact.last7DaysMealCount's identical doc — gym_clients has
   * no timezone column, so this is computed against the same fixed default
   * as macroSummary (see computeRollingWeekMealCount's caller in gym.ts). */
  last7DaysMealCount?: number;
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
