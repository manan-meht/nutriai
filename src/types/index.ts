// ============================================================
// Nutrition Platform — Canonical Type Definitions
// ============================================================

// ---- Workspace ----

export type WorkspaceType = "gym" | "family";

export type WorkspaceMemberRole =
  | "gym_owner"
  | "trainer"
  | "client"
  | "family_owner"
  | "family_supporter"
  | "older_adult"
  | "caregiver"
  | "dietitian";

export interface Workspace {
  id: string;
  type: WorkspaceType;
  name: string;
  slug: string;
  ownerId: string;
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceMemberRole;
  joinedAt: Date;
  isActive: boolean;
}

// ---- Meals ----

export type MealSource = "web" | "whatsapp" | "voice" | "manual";
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type AmountEaten = "little" | "half" | "most" | "all";
export type AnalysisConfidence = "low" | "medium" | "high";

export interface Range {
  min?: number;
  max?: number;
}

export interface ConfirmedFoodItem {
  id: string;
  name: string;
  nameLocal?: string;
  quantityDescription?: string; // "1 katori", "2 rotis"
  quantityGrams?: number;
  caloriesEstimated?: number;
  proteinGramsEstimated?: number;
  carbohydratesGramsEstimated?: number;
  fatGramsEstimated?: number;
  fibreGramsEstimated?: number;
  indbFoodCode?: string; // Indian Nutrition Database code
  indbMatchConfidence?: AnalysisConfidence;
  aiIdentified: boolean;
  userCorrected: boolean;
}

export interface ConfirmedMeal {
  id: string;
  workspaceId: string;
  workspaceType: WorkspaceType;
  mealLoggerId: string;

  loggedAt: Date;
  mealType?: MealType;
  source: MealSource;

  foods: ConfirmedFoodItem[];

  nutritionEstimate: {
    calories?: Range;
    proteinGrams?: Range;
    carbohydratesGrams?: Range;
    fatGrams?: Range;
    fibreGrams?: Range;
  };

  foodGroups: string[];
  amountEaten?: AmountEaten;
  appetiteRating?: number; // 1–5
  hydrationRecorded?: boolean;

  analysisConfidence: AnalysisConfidence;
  confirmedByUser: boolean;
  confirmedAt?: Date;

  rawInput?: string;
  notes?: string;
  imageUrls?: string[];
}

// ---- AI Analysis ----

export interface MealAnalysisRecord {
  id: string;
  mealId: string;
  provider: "gemini" | "openai" | "fallback";
  model: string;
  wasFallback: boolean;
  rawResponse?: unknown;
  processingMs?: number;
  tokensUsed?: number;
  confidence: AnalysisConfidence;
  errorMessage?: string;
  createdAt: Date;
}

export interface FoodRecognitionResult {
  foods: ConfirmedFoodItem[];
  confidence: AnalysisConfidence;
  provider: "gemini" | "openai" | "fallback";
  model: string;
  wasFallback: boolean;
  requiresUserConfirmation: boolean;
  uncertainItems: string[]; // items that could not be confidently identified
}

// ---- Gym Intelligence ----

export interface GymMealInsight {
  mealId: string;
  clientId: string;

  proteinTargetContribution?: number; // 0–1 fraction of daily target
  calorieTargetContribution?: number;
  macroBalance?: {
    protein: string; // e.g. "28%"
    carbohydrates: string;
    fat: string;
  };

  trainingContext?: {
    trainingDay: boolean;
    preWorkoutMeal: boolean;
    postWorkoutMeal: boolean;
    timingObservation?: string;
  };

  targetStatus: {
    protein?: "below" | "within" | "above" | "unknown";
    calories?: "below" | "within" | "above" | "unknown";
    mealTiming?: "on_track" | "worth_reviewing" | "unknown";
  };

  coachReviewRecommended: boolean;
  coachReviewReason?: string;
}

export type GymGoalMetric =
  | "protein_grams"
  | "calorie_range"
  | "macro_distribution"
  | "meals_logged"
  | "protein_meal_frequency"
  | "hydration"
  | "pre_workout_meal"
  | "post_workout_meal"
  | "custom";

export interface GymGoalConfig {
  id: string;
  workspaceId: string;
  clientId: string;
  createdByTrainerId?: string;
  metric: GymGoalMetric;
  targetValue?: number;
  minimumValue?: number;
  maximumValue?: number;
  appliesOn: "all_days" | "training_days" | "rest_days";
  createdByTrainer: boolean;
  trainerApprovalRequired: boolean;
  status: "active" | "paused" | "completed" | "declined";
  startsAt?: Date;
  endsAt?: Date;
  createdAt: Date;
}

export type CoachReviewReason =
  | "low_logging"
  | "protein_target_missed"
  | "report_ready"
  | "goal_declining"
  | "trainer_message_pending";

// ---- Gym Dashboard ----

export interface CoachMealPreview {
  mealId: string;
  clientId: string;
  clientName: string;
  loggedAt: Date;
  mealType?: MealType;
  thumbnailUrl?: string;
  proteinGrams?: number;
}

export interface CoachReportPreview {
  reportId: string;
  clientId: string;
  clientName: string;
  weekStarting: Date;
  status: "draft" | "pending_approval" | "approved" | "sent";
}

export interface CoachDashboard {
  activeClientCount: number;
  clientsNeedingReview: number;
  reportsAwaitingApproval: number;
  mealsLoggedToday: number;

  attentionQueue: Array<{
    clientId: string;
    clientName: string;
    reason: CoachReviewReason;
    severity: "low" | "medium" | "high";
    lastActivityAt: Date;
  }>;

  clients: Array<{
    clientId: string;
    clientName: string;
    programmeGoal: string;
    mealsLoggedThisWeek: number;
    expectedMealsThisWeek?: number;
    proteinAdherence?: number; // 0–1
    calorieAdherence?: number;
    loggingConsistency: number; // 0–1
    overallGoalAdherence: number;
    lastActivityAt?: Date;
    status: "on_track" | "needs_review" | "inactive" | "insufficient_data";
  }>;

  recentMeals: CoachMealPreview[];
  weeklyReports: CoachReportPreview[];
}

export interface CoachClientDetail {
  clientId: string;
  clientName: string;
  programmeGoal: string;
  currentWeightKg?: number;
  targetWeightKg?: number;
  activeGoals: GymGoalConfig[];
  recentMeals: CoachMealPreview[];
  weeklyInsights: GymMealInsight[];
  coachNotes: Array<{ id: string; body: string; createdAt: Date }>;
  loggingConsistency: number;
  weeklyAdherence: Record<string, number>;
}

export interface CoachReviewItem {
  clientId: string;
  clientName: string;
  reason: CoachReviewReason;
  severity: "low" | "medium" | "high";
  lastActivityAt: Date;
  detail?: string;
}

// ---- Family Intelligence ----

export interface FamilyMealInsight {
  mealId: string;
  supportedPersonId: string;

  mealRegularityContribution?: string;
  proteinSourceDetected?: boolean;
  fruitDetected?: boolean;
  vegetableDetected?: boolean;
  foodVarietyContribution?: string;

  quantitySignal?: "usual" | "possibly_lower" | "unknown";
  appetiteSignal?: "normal" | "low" | "unknown";
  hydrationSignal?: "recorded" | "not_recorded" | "unknown";

  baselineChange?: {
    detected: boolean;
    description?: string;
    confidence?: AnalysisConfidence;
  };

  familyAlertCandidate: boolean;
  familyAlertReason?: string;
}

export type FamilyGoalMetric =
  | "meal_regularity"
  | "protein_source_frequency"
  | "fruit_frequency"
  | "vegetable_frequency"
  | "hydration_checkins"
  | "appetite_checkins"
  | "social_meals"
  | "custom";

export type FamilyGoalProposedBy =
  | "self"
  | "family_supporter"
  | "caregiver"
  | "dietitian";

export interface FamilyGoalConfig {
  id: string;
  workspaceId: string;
  olderAdultId: string;
  proposedById?: string;
  proposedBy: FamilyGoalProposedBy;
  metric: FamilyGoalMetric;
  weeklyTarget?: number;
  consentRequired: boolean;
  acceptedByMealLogger: boolean;
  acceptedAt?: Date;
  status: "active" | "paused" | "completed" | "declined";
  description?: string;
  startsAt?: Date;
  endsAt?: Date;
  createdAt: Date;
}

export interface FamilyGoalProgress {
  goal: FamilyGoalConfig;
  currentCount: number;
  weeklyTarget: number;
  progressFraction: number;
  lastActivityAt?: Date;
}

// ---- Family Dashboard ----

export type FamilyIndicatorStatus =
  | "positive"
  | "stable"
  | "worth_watching"
  | "needs_attention"
  | "unknown";

export interface FamilyIndicator {
  status: FamilyIndicatorStatus;
  label: string; // e.g. "Going well", "Worth watching"
  detail?: string; // calm explanation
  dataCompleteness: number; // 0–1
}

export interface FamilyMealPreview {
  mealId: string;
  loggedAt: Date;
  mealType?: MealType;
  description?: string; // only if permission granted
  thumbnailUrl?: string; // only if permission granted
  hadProteinSource?: boolean;
  hadFruit?: boolean;
  hadVegetable?: boolean;
}

export interface FamilyAlertPreview {
  alertId: string;
  alertType: string;
  observedPattern: string;
  timePeriodDays: number;
  confidence: AnalysisConfidence;
  suggestedAction?: string;
  createdAt: Date;
}

export type FamilyWeeklyStatus =
  | "going_well"
  | "improving"
  | "worth_watching"
  | "needs_attention"
  | "insufficient_data";

export interface FamilyDashboard {
  supportedPerson: {
    id: string;
    name: string;
    relationshipLabel: string;
    lastMealAt?: Date;
    lastCheckinAt?: Date;
  };

  weeklyStatus: FamilyWeeklyStatus;
  weeklySummary: string;

  mealsSharedThisWeek: number;
  expectedMealCoverage?: number;

  indicators: {
    mealRegularity: FamilyIndicator;
    proteinFrequency: FamilyIndicator;
    foodVariety: FamilyIndicator;
    fruitAndVegetables: FamilyIndicator;
    hydration: FamilyIndicator;
    appetite: FamilyIndicator;
    mealQuantity: FamilyIndicator;
  };

  activeGoals: FamilyGoalProgress[];
  recentMeals: FamilyMealPreview[];
  alerts: FamilyAlertPreview[];
  suggestedSupportiveAction?: string;
}

export interface FamilyWeeklySummary {
  workspaceId: string;
  supportedPersonId: string;
  weekStarting: Date;
  weeklyStatus: FamilyWeeklyStatus;
  summaryText: string;
  indicators: Record<string, FamilyIndicator>;
  mealsShared: number;
  dataCompleteness: number;
  suggestedAction?: string;
  generatedAt: Date;
}

// ---- Background Events ----

export interface MealConfirmedEvent {
  mealId: string;
  workspaceId: string;
  workspaceType: WorkspaceType;
  mealLoggerId: string;
}

// ---- Permissions ----

export interface GymPermissions {
  canViewClientMeals: boolean;
  canViewCoachNotes: boolean;
  canSetNutritionTargets: boolean;
  canViewReports: boolean;
  canApproveReports: boolean;
  canSendMessages: boolean;
  canManageGoals: boolean;
  canViewAllClients: boolean; // gym admin only
}

export interface FamilySharingPermissions {
  canSeeMealPhotos: boolean;
  canSeeMealDescriptions: boolean;
  canSeeWeeklySummaries: boolean;
  canSeeGoalProgress: boolean;
  canSeeAlerts: boolean;
  canSeeMessages: boolean;
  canProposeGoals: boolean;
}

// ---- Notifications ----

export type NotificationChannel = "in_app" | "email" | "whatsapp" | "push";

export interface NotificationPayload {
  workspaceId: string;
  workspaceType: WorkspaceType;
  recipientId: string;
  channel: NotificationChannel;
  templateKey: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}

// ---- Landing Page / Experiments ----

export type ProductType = "gym" | "adults";
export type LandingVariant = "standard" | "immersive";
export type LandingExperimentVariant = "standard" | "immersive";

export type LandingSelectionMode =
  | "standard_only"
  | "immersive_only"
  | "ab_test"
  | "performance_aware";

export interface LandingExperimentAssignment {
  experimentId: string;
  product: ProductType;
  variant: LandingExperimentVariant;
  assignedAt: number; // unix ms
  selectionMode: LandingSelectionMode;
}

export interface LandingAnalyticsProperties {
  product: ProductType;
  variant: LandingVariant;
  experimentId: string;
  selectionMode: LandingSelectionMode;
  deviceCategory: "mobile" | "tablet" | "desktop";
  connectionCategory?: "fast" | "slow" | "unknown";
}

export type LandingAnalyticsEvent =
  | "landing_variant_assigned"
  | "landing_variant_viewed"
  | "landing_hero_cta_clicked"
  | "landing_secondary_cta_clicked"
  | "landing_scroll_depth"
  | "landing_section_viewed"
  | "landing_signup_started"
  | "landing_signup_completed"
  | "landing_login_clicked"
  | "landing_asset_failure"
  | "landing_fallback_triggered"
  | "landing_reduced_motion_used";

// ---- Shared Route Helpers Params ----

export interface GetSignupUrlParams {
  product: ProductType;
  source: string;
  variant: LandingVariant;
  experimentId?: string;
  /** Overrides the "product" query-string value while `product` above still
   * decides the base route (/signup vs /gym/signup) — lets a CTA say
   * "family"/"me"/"coach" for clarity/attribution even though those all
   * resolve to the same underlying adults/gym product. See
   * resolveProductFromHostname's alias handling in resolve-product.ts. */
  productParam?: string;
}

export interface GetLoginUrlParams {
  product: ProductType;
  source?: string;
}
