export type NutritionGoal =
  | "reduce_weight"
  | "reduce_body_fat"
  | "gain_muscle"
  | "body_recomposition"
  | "maintain_weight"
  | "improve_nutrition"
  | "healthy_aging";

export type ActivityLevel =
  | "mostly_sitting"
  | "lightly_active"
  | "moderately_active"
  | "very_active"
  | "unknown";

export type ProcessingLevel = "minimally_processed" | "processed" | "ultra_processed" | "unknown";

export type MealPreparationSource = "home_prepared" | "restaurant_prepared" | "packaged_ready_to_eat" | "unknown";

export type DiversityFoodGroup =
  | "vegetables"
  | "fruits"
  | "legumes"
  | "whole_grains_or_high_fibre_starches"
  | "nuts_and_seeds"
  | "protein_sources";

export type ResistanceTrainingStatus = "regularly" | "sometimes" | "not_currently" | "unknown";

/** Coverage categories for Healthy Aging's Nutrient-Dense Food Coverage
 * component — presence-based, never a claim of measured micronutrient
 * adequacy (see food-foundation.ts's calculateHealthyAgingCoverage). */
export type HealthyAgingCoverageGroup =
  | "calcium_rich_or_fortified_foods"
  | "b12_containing_or_fortified_foods"
  | "legumes_or_soy"
  | "vegetables_including_leafy_vegetables"
  | "fruit"
  | "whole_grains_or_high_fibre_starches"
  | "nuts_and_seeds";

export type MetabolicEquationSex = "male" | "female";

export type PreferredUnits = "metric" | "imperial";

/** One classified meal as scoring input — deliberately a superset of what
 * meal-classification/human-correction output already provides (see
 * @nutriai/dashboard-core's ClassifiedMeal) plus the additional structured
 * fields this feature needs (fibre, processing level, prep source, fruit/veg
 * servings, whole-food names, food groups, confidence). Callers are
 * responsible for mapping their DB rows into this shape — this package never
 * touches a database. */
export interface FoodBalanceMealInput {
  id: string;
  loggedAt: string;
  mealType: string;
  isDeleted?: boolean;
  isDuplicate?: boolean;
  isUserConfirmed?: boolean;
  /** 0-1. Below the acceptable-confidence threshold, a meal is excluded from
   * eligibility and from any calculation that needs it, per the AI-confidence
   * gating described in the spec. */
  aiConfidence?: number;
  isUserCorrected?: boolean;
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  fibreG?: number;
  fruitServings?: number;
  vegetableServings?: number;
  processingLevel?: ProcessingLevel;
  /** 0-1 confidence in the processingLevel classification. */
  processingConfidence?: number;
  preparationSource?: MealPreparationSource;
  preparationConfidence?: number;
  /** Distinct whole/minimally-processed food names present in this meal,
   * already synonym-normalized by the caller (e.g. "chana"/"garbanzo beans"
   * both become "chickpeas") — this package does not do NLP normalization. */
  wholeFoods?: string[];
  foodGroups?: DiversityFoodGroup[];
  /** Healthy Aging's coverage categories present in this meal — a separate
   * (coarser, nutrient-oriented) tagging from foodGroups above, which is
   * used by the general Food Foundation's diversity component. Unknown/
   * omitted rather than guessed when the classification pipeline hasn't
   * tagged a meal for these categories. */
  healthyAgingCoverageGroups?: HealthyAgingCoverageGroup[];
  /** True when this meal is high-confidence processed meat, an
   * excessively salty packaged food, deep-fried, or a nutritionally
   * limited ultra-processed food — used only for the Healthy-Aging Food
   * Pattern's small "repeated exposure" reduction, never the general Food
   * Foundation (which already scores overall processing level). */
  isHealthyAgingPatternConcern?: boolean;
}

export interface FoodBalanceWeightEntry {
  weightKg: number;
  measuredAt: string;
}

export interface FoodBalanceUserProfile {
  goal: NutritionGoal;
  dateOfBirth?: string;
  age?: number;
  heightCm?: number;
  currentWeightKg?: number;
  metabolicEquationSex?: MetabolicEquationSex;
  activityLevel?: ActivityLevel;
  targetWeightKg?: number;
  resistanceTraining?: ResistanceTrainingStatus;
  preferredUnits?: PreferredUnits;
}

export interface ComponentScore {
  score: number | null;
  weight: number;
  label: string;
  confidence: number;
}

export interface FoodBalanceComponentScores {
  foodFoundation: {
    macroAndFibreBalance: ComponentScore;
    minimallyProcessedFoodBalance: ComponentScore;
    fruitAndVegetableIntake: ComponentScore;
    foodDiversity: ComponentScore;
    homePreparedMealShare: ComponentScore;
  };
  goalAlignment: Partial<{
    energyAlignment: ComponentScore;
    proteinAdequacy: ComponentScore;
    fibreAndMealVolume: ComponentScore;
    fibreAdequacy: ComponentScore;
    intakeConsistency: ComponentScore;
    carbohydrateSupport: ComponentScore;
    proteinDistribution: ComponentScore;
    // Healthy Aging only — energyAlignment/proteinAdequacy/
    // proteinDistribution above are reused (same keys, goal-specific
    // weights/targets), these two are Healthy-Aging-specific:
    nutrientDenseFoodCoverage: ComponentScore;
    healthyAgingFoodPattern: ComponentScore;
  }>;
}

/** Convenience alias matching the spec's suggested shape — components live
 * in FoodBalanceComponentScores["goalAlignment"] above (same object other
 * goals use), this just documents which keys apply to healthy_aging. */
export type HealthyAgingComponentScores = {
  energyAdequacy: ComponentScore | null;
  proteinAdequacy: ComponentScore | null;
  proteinDistribution: ComponentScore | null;
  nutrientDenseFoodCoverage: ComponentScore | null;
  healthyAgingFoodPattern: ComponentScore | null;
};

export interface FoodBalanceDataCoverage {
  eligibleMealCount: number;
  requiredMealCount: number;
  distinctLoggingDays: number;
  requiredLoggingDays: number;
  recentEligibleMealCount: number;
}

export type FoodBalanceStatus =
  | "collecting_data"
  | "refreshing_data"
  | "foundation_only"
  | "partially_personalized"
  | "fully_personalized";

export type RecommendationCategory =
  | "protein"
  | "fibre"
  | "fruit"
  | "vegetables"
  | "diversity"
  | "processing"
  | "home_preparation"
  | "energy"
  | "protein_distribution"
  | "carbohydrate_support"
  | "consistency";

export interface FoodBalanceRecommendation {
  id: string;
  category: RecommendationCategory;
  title: string;
  description: string;
  reason: string;
  priority: number;
  confidence: number;
  estimatedScoreImpact?: number;
}

export interface EnergyTargetRange {
  lowerKcal: number;
  upperKcal: number;
  midpointKcal: number;
  /** True only when this range came from a known activity level; false for
   * the broad unknown-activity maintenance range. */
  isActivityBased: boolean;
}

export interface FoodBalanceConfidenceResult {
  value: number;
  label: "high" | "moderate" | "still_learning";
  componentConfidence: Record<string, number>;
}

export interface FoodBalanceScoreResult {
  score: number | null;
  rawScore: number | null;
  status: FoodBalanceStatus;
  scoringVersion: string;
  foodFoundationScore: number | null;
  goalAlignmentScore: number | null;
  componentScores: FoodBalanceComponentScores | null;
  recommendations: FoodBalanceRecommendation[];
  confidence: number;
  dataCoverage: FoodBalanceDataCoverage;
  missingGoalAlignmentInputs: string[];
  calculatedAt: string | null;
}
