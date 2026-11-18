// Nutrition Guidance's wire contract, as the app receives it from
// GET/POST .../guidance (apps/mobile-api forwards to the web app's
// src/app/api/mobile/guidance route). Local mirrors, not imports, following
// lib/api.ts's convention: these describe the JSON the server sends.
//
// Mirrors, by source file in the web app (keep in sync by hand):
//   src/lib/guidance/view.ts            GuidanceView, GuidanceDashboard, SetupPrefill
//   src/lib/guidance/next-steps.ts      NextSteps, NextMealView
//   src/lib/guidance/suggestions.ts     MealSuggestion, SuggestionResult
//   src/lib/guidance/habits.ts          HabitView and its parts
//   src/lib/guidance/micronutrient-panel.ts  MicronutrientPanel
//   src/lib/nutrients/assessment.ts     MicronutrientAssessment, NextStep
//   src/lib/guidance/daily-totals.ts    DailyTotals, NutrientDay
//   src/lib/guidance/meal-impact.ts     GuidanceDay, MealImpact, NutrientKey
//   src/lib/guidance/day-plan.ts        PlannedMeal, SkippedMeal
//   src/lib/guidance/activation.ts      GuidanceSetupAnswers, the result types
//
// Dependency-free on purpose (no React, no Expo, no "@/" imports): the
// repo's root jest config maps "@/" to the web app's src, so anything the
// tests import has to resolve by relative path.

// ─── @nutriai/health-scoring ────────────────────────────────────────────────

export type NutritionGoal =
  | 'reduce_weight'
  | 'reduce_body_fat'
  | 'gain_muscle'
  | 'body_recomposition'
  | 'maintain_weight'
  | 'improve_nutrition'
  | 'healthy_aging';

export type ActivityLevel = 'mostly_sitting' | 'lightly_active' | 'moderately_active' | 'very_active' | 'unknown';

export type MetabolicEquationSex = 'male' | 'female';

// ─── daily-totals.ts ────────────────────────────────────────────────────────

export interface ConfirmedMealRow {
  id: string;
  loggedAt: string;
  totalCaloriesMin: number | null;
  totalCaloriesMax: number | null;
  totalProteinMin: number | null;
  totalProteinMax: number | null;
  totalCarbsMin: number | null;
  totalCarbsMax: number | null;
  totalFatMin: number | null;
  totalFatMax: number | null;
  totalFiberMin: number | null;
  totalFiberMax: number | null;
}

export interface DailyTarget {
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export interface NutrientDay {
  /** From the target that applied on this date, not today's target. */
  target: number;
  /** Midpoint of every meal that reported this nutrient. */
  consumed: number;
  /** Never negative: the excess is in `over`. */
  remaining: number;
  over: number;
  /** At least one meal reported nothing for this nutrient: `consumed` is a floor. */
  isIncomplete: boolean;
  mealsMissingData: number;
}

export interface DailyTotals {
  /** Local calendar date in the tracked person's timezone, YYYY-MM-DD. */
  date: string;
  mealCount: number;
  calories: NutrientDay;
  protein: NutrientDay;
  carbs: NutrientDay;
  fat: NutrientDay;
  fiber: NutrientDay;
  hasIncompleteData: boolean;
}

// ─── meal-impact.ts ─────────────────────────────────────────────────────────

export type NutrientKey = 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber';

export interface MealImpact<T extends ConfirmedMealRow = ConfirmedMealRow> {
  meal: T;
  values: Record<NutrientKey, number | null>;
  after: DailyTotals;
}

export interface GuidanceDay {
  /** Local date, YYYY-MM-DD. */
  date: string;
  loggedAt: string;
  totals: DailyTotals;
}

// ─── meal-slots.ts, day-plan.ts ─────────────────────────────────────────────

export type MealSlot = 'breakfast' | 'lunch' | 'snack' | 'dinner';

export type ActivatedVia = 'self_account' | 'end_user_session' | 'whatsapp' | 'caregiver' | 'coach';

export interface PlannedMeal {
  id: string;
  date: string;
  slot: MealSlot;
  suggestion: MealSuggestion;
  mealLogId: string | null;
  plannedVia: ActivatedVia;
  createdAt: string;
}

export interface SkippedMeal {
  date: string;
  slot: MealSlot;
  confirmedVia: ActivatedVia;
}

// ─── nutrients/catalog.ts ───────────────────────────────────────────────────

export type MicroKey =
  | 'calcium'
  | 'iron'
  | 'magnesium'
  | 'potassium'
  | 'zinc'
  | 'folate'
  | 'vitamin_a'
  | 'vitamin_b12'
  | 'vitamin_c'
  | 'vitamin_d'
  | 'iodine';

// ─── suggestions.ts ─────────────────────────────────────────────────────────

export interface SuggestionComponent {
  id: string;
  food: string;
  /** "100 g cooked chicken". */
  portion: string;
  grams: number;
  role: 'protein' | 'dal' | 'base' | 'veg' | 'fruit';
  source: { foodId: string; description: string; dataset: string; version: string };
}

export interface MealSuggestion {
  id: string;
  version: string;
  date: string;
  slot: MealSlot;
  /** "Chicken, dal & vegetables". */
  title: string;
  /** "Make room for protein". */
  headline: string;
  reason: string;
  components: SuggestionComponent[];
  /** Null where the source has no value: never a zero standing in for unknown. */
  estimate: Record<NutrientKey, number | null>;
  familiar: boolean;
  brings?: { nutrient: MicroKey; label: string; amount: number; unit: string } | null;
}

export type SuggestionResult =
  | { kind: 'options'; options: MealSuggestion[]; notes: string[] }
  | { kind: 'fallback'; reason: 'target_reached' | 'no_options'; message: string; notes: string[] };

// ─── next-steps.ts ──────────────────────────────────────────────────────────

export interface NextMealView {
  date: string;
  slot: MealSlot;
  isTomorrow: boolean;
  plan: (PlannedMeal & { logged: { mealId: string } | null }) | null;
  suggestions: SuggestionResult;
}

export interface NextSteps {
  nextMeal: NextMealView | null;
  skipPrompts: MealSlot[];
  habit: HabitView;
}

// ─── habits.ts ──────────────────────────────────────────────────────────────

export type HabitKey = 'protein_breakfast' | 'protein_main_meals' | 'fibre_lunch' | 'log_every_meal';
export type HabitVariant = 'standard' | 'easier';

export interface HabitEvidence {
  observation: string;
  looked: number;
  low: number;
  from: string;
  to: string;
}

export interface HabitOption {
  key: HabitKey;
  title: string;
  shortTitle: string;
  reason: string;
  change: Record<HabitVariant, string>;
  evidence: HabitEvidence;
}

export interface HabitProgress {
  eligible: number;
  successes: number;
  unclear: number;
  marks: boolean[];
  noun: string;
}

export interface HabitView {
  weekStart: string;
  current: (HabitOption & { variant: HabitVariant; progress: HabitProgress; keptForNextWeek: boolean }) | null;
  options: HabitOption[];
}

// ─── nutrients/assessment.ts, references.ts, facts.ts ───────────────────────

export type AssessmentStatus =
  | 'within_range'
  | 'below_reference'
  | 'above_upper_limit'
  | 'no_reliable_source'
  | 'not_enough_information'
  | 'likely_low';

export type ClarificationKey = 'milk_fortified' | 'supplements_in_routine' | 'iodised_salt' | 'product_brand';

export type NextStep =
  | { kind: 'clarify'; key: ClarificationKey; question: string; itemName?: string }
  | { kind: 'food'; foods: Array<{ key: string; label: string; perPortion: number | null; portion: string | null }>; text: string }
  | { kind: 'log'; text: string }
  | { kind: 'profile'; text: string }
  | { kind: 'none' };

export type Trend =
  | { kind: 'insufficient'; currentDays: number; previousDays: number; required: number }
  | { kind: 'change'; current: number; previous: number; delta: number; currentDays: number; previousDays: number };

export interface ResolvedValue {
  kind: 'RDA' | 'AI' | 'EAR' | 'UL';
  amount: number;
  unit: string;
  edition: string;
  editionVersion: string;
  lifeStage: string;
}

export interface MicronutrientAssessment {
  nutrient: MicroKey;
  label: string;
  unit: string;
  status: AssessmentStatus;
  period: { start: string; end: string };
  days: { documented: number; total: number };
  food: { average: number | null; isFloor: boolean };
  supplements: { average: number | null; unconfirmedScheduledDoses: number };
  total: number | null;
  reference: ResolvedValue | null;
  upperLimit: (ResolvedValue & { appliesTo: string; fallbackFrom?: string }) | null;
  percentOfReference: number | null;
  trend: Trend;
  mainSources: Array<{ key: string; label: string; share: number }>;
  observation: string;
  nextStep: NextStep;
  explanation: string;
  evidence: number;
}

export type FactAnswer = 'yes' | 'no' | 'unsure';
export type HouseholdFacts = Partial<Record<'milk_fortified' | 'iodised_salt' | 'supplements_in_routine', FactAnswer>>;

// ─── micronutrient-panel.ts ─────────────────────────────────────────────────

export type PeriodKind = 'week' | 'month';

export interface MicronutrientPeriodView {
  start: string;
  end: string;
  assessments: MicronutrientAssessment[];
  concerns: MicronutrientAssessment[];
}

export interface SupplementView {
  id: string;
  name: string;
  brand: string | null;
  perDose: Array<{ key: MicroKey; label: string; amount: number; unit: string }>;
  takenToday: boolean;
}

export interface MicronutrientPanel {
  periods: Record<PeriodKind, MicronutrientPeriodView>;
  clarification: Extract<NextStep, { kind: 'clarify' }> | null;
  edition: { id: string; name: string; version: string; reviewStatus: string; urls: string[] };
  household: HouseholdFacts;
  supplements: SupplementView[];
  datasets: string[];
}

// ─── policy.ts, activation.ts ───────────────────────────────────────────────

export interface ProposedTargets {
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export type CookingAccess = 'full_kitchen' | 'limited' | 'none' | 'unknown';

export interface GuidanceSetupAnswers {
  ageYears: number | null;
  heightCm: number | null;
  weightKg: number | null;
  metabolicEquationSex: MetabolicEquationSex | null;
  activityLevel: ActivityLevel | null;
  goals: NutritionGoal[];
  isPregnantOrBreastfeeding: boolean | null;
  hasEatingDisorderHistory: boolean | null;
  conditionsOrMedications: string | null;
  /** Never sent: the server uses the contact's own timezone. */
  timezone?: string;
  mealsPerDay: number | null;
  usualMealTimes?: string[] | null;
  cookingAccess: CookingAccess | null;
  cuisines: string[];
  allergies: string[];
  avoidedFoods: string[];
}

/** A policy or screening "no": a question to answer, or a referral. */
export interface DeclinedPolicy {
  outcome: 'needs_more_detail' | 'needs_professional_review';
  reasons: string[];
  message: string;
}

export type ActivationFailure =
  | { ok: false; kind: 'not_found'; message?: string }
  | { ok: false; kind: 'forbidden'; reason: string; message: string }
  | { ok: false; kind: 'unavailable'; blockers: string[]; message: string }
  | { ok: false; kind: 'declined'; policy: DeclinedPolicy }
  | { ok: false; kind: 'write_failed'; message: string }
  /** Added by the app: the request never got an answer (offline, 5xx). */
  | { ok: false; kind: 'request_failed'; message?: string };

export type ProposalResult =
  | {
      ok: true;
      targets: ProposedTargets;
      explanation: string;
      notes: string[];
      policyVersion: string;
      isPreviewOnly: boolean;
    }
  | ActivationFailure;

export type ConfirmResult =
  | { ok: true; mode: 'guidance'; targets: ProposedTargets; effectiveFrom: string; activatedVia: ActivatedVia }
  | ActivationFailure;

// ─── view.ts ────────────────────────────────────────────────────────────────

export type SetupPrefill = Partial<
  Pick<
    GuidanceSetupAnswers,
    | 'ageYears'
    | 'heightCm'
    | 'weightKg'
    | 'metabolicEquationSex'
    | 'activityLevel'
    | 'goals'
    | 'mealsPerDay'
    | 'cookingAccess'
    | 'cuisines'
    | 'allergies'
    | 'avoidedFoods'
  >
>;

export interface TodayProgress {
  date: string;
  totals: DailyTotals;
  target: { effectiveFrom: string; policyVersion: string; explanation: string };
}

/** Whose targets these are, as seen by the viewer. */
export type GuidancePerson = { isSelf: true } | { isSelf: false; name: string };

export interface TargetAdjustView {
  current: ProposedTargets;
  recommended: ProposedTargets;
  isAdjusted: boolean;
  note: string | null;
}

export type GuidanceView =
  | { kind: 'not_found' }
  | { kind: 'feature_off' }
  | { kind: 'unavailable'; message: string }
  | {
      kind: 'setup';
      person: GuidancePerson;
      prefill: SetupPrefill;
      isPreviewOnly: boolean;
      policyVersion: string;
      hasEverActivated: boolean;
      canAdjustTargets: boolean;
    }
  | {
      kind: 'active';
      person: GuidancePerson;
      activatedVia: ActivatedVia | null;
      isPreviewOnly: boolean;
      policyVersion: string;
      activatedAt: string | null;
      today: TodayProgress | null;
      /** False for a coach client, who stays in Guidance. */
      canReturnToTracking: boolean;
      adjust: TargetAdjustView | null;
    }
  | { kind: 'paused'; message: string; canReturnToTracking: boolean };

export interface GuidanceMealRow extends ConfirmedMealRow {
  mealType: string | null;
  foods: Array<{ name: string; quantity: string | null }>;
}

export interface GuidanceDashboard {
  isPreviewOnly: boolean;
  timezone: string;
  /** Today, YYYY-MM-DD, in the tracked person's timezone. */
  date: string;
  today: {
    target: DailyTarget;
    totals: DailyTotals;
    meals: Array<MealImpact<GuidanceMealRow>>;
  } | null;
  /** Every Guidance day so far, newest first. */
  history: GuidanceDay[];
  /** The meals behind `history`, newest first. */
  meals: GuidanceMealRow[];
  expectedMealsPerDay: number;
  expectedMealsIsDefault: boolean;
  goals: NutritionGoal[];
  weights: Array<{ measuredAt: string; weightKg: number }>;
  logMealHref: string | null;
  skips: SkippedMeal[];
  nextSteps: NextSteps | null;
  micronutrients: MicronutrientPanel | null;
  generatedAt: string;
}

// ─── The app's own request shapes ───────────────────────────────────────────

/** Who the Guidance request is about: a family contact or a coach client. */
export type GuidanceSubject = { kind: 'adults'; id: string } | { kind: 'gym'; id: string };

/** GET .../guidance. A 404 (not found, or not this viewer's to see) arrives
 * as null from api.getGuidance. */
export interface GuidanceResponse {
  view: GuidanceView;
  dashboard: GuidanceDashboard | null;
}

export type GuidanceOp =
  | 'propose'
  | 'confirm'
  | 'off'
  | 'plan'
  | 'cancel-plan'
  | 'confirm-plan'
  | 'skip'
  | 'habit'
  | 'clarify'
  | 'supplement-add'
  | 'supplement-taken'
  | 'supplement-stop';

/** Every POST answers { ok: true, ... } or { ok: false, kind, message? }. */
export type GuidanceActionResult = { ok: true; [key: string]: unknown } | { ok: false; kind: string; message?: string };
