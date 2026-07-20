import {
  isFoodBalanceScoreEligible,
  isMealEligible,
  calculateFoodFoundationScore,
  scoreAgainstRange,
  calculateGoalAlignmentScore,
  calculateRestingEnergy,
  calculateMaintenanceEstimate,
  calculateEnergyTargetRange,
  calculateEnergyAlignmentScore,
  calculateHealthyAgingEnergyAdequacyScore,
  hasSufficientEnergyConfidence,
  calculateFoodBalanceConfidence,
  getFoodBalanceRecommendations,
  calculateFoodBalanceScore,
  calculateHealthyAgingProteinScore,
  calculateHealthyAgingProteinDistribution,
  calculateHealthyAgingCoverage,
  calculateHealthyAgingFoodPattern,
  meaningfulProteinThresholdGrams,
  FOOD_BALANCE_SCORING_VERSION,
  type FoodBalanceMealInput,
  type FoodBalanceUserProfile,
  type FoodBalanceComponentScores,
} from "@nutriai/health-scoring";

function meal(overrides: Partial<FoodBalanceMealInput> & { loggedAt: string }): FoodBalanceMealInput {
  return {
    id: Math.random().toString(36),
    mealType: "lunch",
    isUserConfirmed: true,
    calories: 500,
    proteinG: 25,
    carbsG: 60,
    fatG: 15,
    fibreG: 8,
    fruitServings: 1,
    vegetableServings: 1,
    processingLevel: "minimally_processed",
    preparationSource: "home_prepared",
    wholeFoods: ["rice", "lentils"],
    foodGroups: ["legumes", "whole_grains_or_high_fibre_starches"],
    ...overrides,
  };
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

/** Distinct days across `count` meals, spread one per day starting today. */
function mealsAcrossDays(count: number, mealOverrides: Partial<FoodBalanceMealInput> = {}): FoodBalanceMealInput[] {
  return Array.from({ length: count }, (_, i) => meal({ loggedAt: daysAgo(i % 14), ...mealOverrides }));
}

describe("eligibility", () => {
  it("is not eligible at 5 meals even across enough days", () => {
    const meals = Array.from({ length: 5 }, (_, i) => meal({ loggedAt: daysAgo(i % 6) }));
    expect(isFoodBalanceScoreEligible(meals).eligible).toBe(false);
  });

  it("is eligible at exactly 6 meals across 3 distinct days", () => {
    const meals = Array.from({ length: 6 }, (_, i) => meal({ loggedAt: daysAgo(i % 3) }));
    const result = isFoodBalanceScoreEligible(meals);
    expect(result.eligible).toBe(true);
    expect(result.eligibleMealCount).toBe(6);
  });

  it("is eligible at 7 meals", () => {
    const meals = Array.from({ length: 7 }, (_, i) => meal({ loggedAt: daysAgo(i % 5) }));
    expect(isFoodBalanceScoreEligible(meals).eligible).toBe(true);
  });

  it("requires distinct days even with enough total meals", () => {
    // 6 meals but all logged on the same 2 days.
    const meals = Array.from({ length: 6 }, (_, i) => meal({ loggedAt: daysAgo(i % 2) }));
    expect(isFoodBalanceScoreEligible(meals).eligible).toBe(false);
  });

  it("excludes deleted meals", () => {
    expect(isMealEligible(meal({ loggedAt: daysAgo(0), isDeleted: true }))).toBe(false);
  });

  it("excludes duplicate meals", () => {
    expect(isMealEligible(meal({ loggedAt: daysAgo(0), isDuplicate: true }))).toBe(false);
  });

  it("counts a corrected meal once via isUserCorrected regardless of AI confidence", () => {
    const corrected = meal({ loggedAt: daysAgo(0), isUserCorrected: true, isUserConfirmed: false, aiConfidence: 0.1 });
    expect(isMealEligible(corrected)).toBe(true);
  });

  it("excludes low-confidence uncorrected/unconfirmed meals", () => {
    const lowConfidence = meal({ loggedAt: daysAgo(0), isUserConfirmed: false, aiConfidence: 0.2 });
    expect(isMealEligible(lowConfidence)).toBe(false);
  });

  it("excludes meals with no usable nutrition data", () => {
    const empty = meal({ loggedAt: daysAgo(0), calories: undefined, proteinG: undefined });
    expect(isMealEligible(empty)).toBe(false);
  });
});

describe("scoreAgainstRange", () => {
  const range = { lower: 100, upper: 150, upperTolerance: 50 };
  it("returns 100 within range", () => {
    expect(scoreAgainstRange(120, range)).toBe(100);
  });
  it("scales down below the lower bound", () => {
    expect(scoreAgainstRange(50, range)).toBe(50);
  });
  it("scales down above the upper bound within tolerance", () => {
    expect(scoreAgainstRange(175, range)).toBe(50);
  });
  it("clamps to 0 far beyond tolerance", () => {
    expect(scoreAgainstRange(1000, range)).toBe(0);
  });
});

describe("calculateFoodFoundationScore", () => {
  it("clamps all component scores to 0-100", () => {
    const meals = mealsAcrossDays(15);
    const result = calculateFoodFoundationScore(meals);
    for (const component of Object.values(result.components)) {
      if (component.score != null) {
        expect(component.score).toBeGreaterThanOrEqual(0);
        expect(component.score).toBeLessThanOrEqual(100);
      }
    }
  });

  it("renormalizes when a subcomponent (processing level) is entirely unknown", () => {
    const meals = mealsAcrossDays(15, { processingLevel: "unknown" });
    const result = calculateFoodFoundationScore(meals);
    expect(result.components.minimallyProcessedFoodBalance.score).toBeNull();
    // Score should still be computable from the remaining known components.
    expect(result.score).not.toBeNull();
  });

  it("does not reward ultra-processed variety as diversity", () => {
    const meals = mealsAcrossDays(15, {
      processingLevel: "ultra_processed",
      wholeFoods: [],
      foodGroups: [],
    });
    const result = calculateFoodFoundationScore(meals);
    expect(result.components.foodDiversity.score).toBeNull();
    expect(result.components.minimallyProcessedFoodBalance.score).toBeLessThan(50);
  });

  it("matches the documented ultra-processed examples", () => {
    // 100% ultra-processed -> clamp(100 - 1.5*100, 0, 100) = 0
    const allUltra = mealsAcrossDays(10, { processingLevel: "ultra_processed" });
    const result = calculateFoodFoundationScore(allUltra);
    expect(result.components.minimallyProcessedFoodBalance.score).toBe(0);
  });

  it("gives full home-prepared score at 70% share or greater", () => {
    const meals = mealsAcrossDays(10, { preparationSource: "home_prepared" });
    const result = calculateFoodFoundationScore(meals);
    expect(result.components.homePreparedMealShare.score).toBe(100);
  });
});

describe("goal alignment per goal", () => {
  const baseProfile: FoodBalanceUserProfile = {
    goals: ["reduce_weight"],
    currentWeightKg: 70,
    heightCm: 170,
    age: 30,
    metabolicEquationSex: "male",
    activityLevel: "moderately_active",
  };

  const goalsToTest: FoodBalanceUserProfile["goals"][number][] = [
    "reduce_weight",
    "reduce_body_fat",
    "gain_muscle",
    "body_recomposition",
    "maintain_weight",
  ];

  for (const goal of goalsToTest) {
    it(`computes a result for goal "${goal}"`, () => {
      const meals = mealsAcrossDays(15);
      const result = calculateGoalAlignmentScore(meals, { ...baseProfile, goals: [goal] }, 1, 1);
      expect(result.score).not.toBeNull();
      expect(result.score!).toBeGreaterThanOrEqual(0);
      expect(result.score!).toBeLessThanOrEqual(100);
    });
  }

  it("improve_nutrition returns null (Food Foundation carries the score)", () => {
    const meals = mealsAcrossDays(15);
    const result = calculateGoalAlignmentScore(meals, { ...baseProfile, goals: ["improve_nutrition"] }, 1, 1);
    expect(result.score).toBeNull();
  });

  it("flags the resistance-training note for gain_muscle without training", () => {
    const meals = mealsAcrossDays(15);
    const result = calculateGoalAlignmentScore(
      meals,
      { ...baseProfile, goals: ["gain_muscle"], resistanceTraining: "not_currently" },
      1,
      1
    );
    expect(result.needsResistanceTrainingNote).toBe(true);
  });

  it("does not flag the note when the user trains regularly", () => {
    const meals = mealsAcrossDays(15);
    const result = calculateGoalAlignmentScore(
      meals,
      { ...baseProfile, goals: ["gain_muscle"], resistanceTraining: "regularly" },
      1,
      1
    );
    expect(result.needsResistanceTrainingNote).toBe(false);
  });

  it("omits energy alignment and lists it as missing when profile data is absent", () => {
    const meals = mealsAcrossDays(15);
    const result = calculateGoalAlignmentScore(meals, { goals: ["reduce_weight"] }, 1, 1);
    expect(result.missingInputs).toContain("energy");
    expect(result.components.energyAlignment).toBeUndefined();
  });
});

describe("energy estimation", () => {
  it("uses the male Mifflin-St Jeor equation", () => {
    const rmr = calculateRestingEnergy(70, 170, 30, "male");
    expect(rmr).toBeCloseTo(10 * 70 + 6.25 * 170 - 5 * 30 + 5, 5);
  });

  it("uses the female Mifflin-St Jeor equation", () => {
    const rmr = calculateRestingEnergy(60, 160, 30, "female");
    expect(rmr).toBeCloseTo(10 * 60 + 6.25 * 160 - 5 * 30 - 161, 5);
  });

  it("returns null when required profile fields are missing", () => {
    expect(calculateMaintenanceEstimate({ currentWeightKg: 70 })).toBeNull();
  });

  it("uses a broad range when activity level is unknown", () => {
    const estimate = calculateMaintenanceEstimate({
      currentWeightKg: 70,
      heightCm: 170,
      age: 30,
      metabolicEquationSex: "male",
      activityLevel: "unknown",
    });
    expect(estimate!.isActivityBased).toBe(false);
    expect(estimate!.upperKcal).toBeGreaterThan(estimate!.lowerKcal);
  });

  it("uses an activity-based tolerance range when activity level is known", () => {
    const estimate = calculateMaintenanceEstimate({
      currentWeightKg: 70,
      heightCm: 170,
      age: 30,
      metabolicEquationSex: "male",
      activityLevel: "moderately_active",
    });
    expect(estimate!.isActivityBased).toBe(true);
  });

  it("returns null energy target range for improve_nutrition", () => {
    const range = calculateEnergyTargetRange(
      { currentWeightKg: 70, heightCm: 170, age: 30, metabolicEquationSex: "male", activityLevel: "moderately_active" },
      ["improve_nutrition"]
    );
    expect(range).toBeNull();
  });

  it("scores 100 for calorie intake within the target range", () => {
    const range = { lowerKcal: 1800, upperKcal: 2000, midpointKcal: 1900, isActivityBased: true };
    expect(calculateEnergyAlignmentScore(1900, range)).toBe(100);
  });

  it("scores below 100 for intake outside the target range", () => {
    const range = { lowerKcal: 1800, upperKcal: 2000, midpointKcal: 1900, isActivityBased: true };
    expect(calculateEnergyAlignmentScore(2200, range)).toBeLessThan(100);
    expect(calculateEnergyAlignmentScore(1500, range)).toBeLessThan(100);
  });

  it("requires sufficient confidence before allowing an energy component", () => {
    const profile = { currentWeightKg: 70, heightCm: 170, age: 30, metabolicEquationSex: "male" as const };
    expect(hasSufficientEnergyConfidence(profile, 0.9, 0.9)).toBe(true);
    expect(hasSufficientEnergyConfidence(profile, 0.3, 0.3)).toBe(false);
  });

  it("is insufficient when profile data is missing even with high meal confidence", () => {
    expect(hasSufficientEnergyConfidence({ currentWeightKg: 70 }, 1, 1)).toBe(false);
  });
});

describe("confidence", () => {
  it("never returns a neutral default when there is no data", () => {
    const result = calculateFoodBalanceConfidence([], undefined);
    expect(result.value).toBe(0);
    expect(result.label).toBe("still_learning");
  });

  it("increases with more meals and a more complete profile", () => {
    const fewMeals = calculateFoodBalanceConfidence(mealsAcrossDays(5), undefined);
    const fullProfile: FoodBalanceUserProfile = {
      goals: ["maintain_weight"],
      currentWeightKg: 70,
      heightCm: 170,
      age: 30,
      metabolicEquationSex: "male",
      activityLevel: "moderately_active",
    };
    const manyMeals = calculateFoodBalanceConfidence(mealsAcrossDays(21, { isUserCorrected: true }), fullProfile);
    expect(manyMeals.value).toBeGreaterThan(fewMeals.value);
  });
});

describe("recommendations", () => {
  function componentScores(overrides: Partial<FoodBalanceComponentScores["foodFoundation"]> = {}): FoodBalanceComponentScores {
    return {
      foodFoundation: {
        macroAndFibreBalance: { score: 90, weight: 0.25, label: "Macro and fibre balance", confidence: 0.9 },
        minimallyProcessedFoodBalance: { score: 90, weight: 0.25, label: "Minimally processed", confidence: 0.9 },
        fruitAndVegetableIntake: { score: 90, weight: 0.2, label: "Fruits and vegetables", confidence: 0.9 },
        foodDiversity: { score: 90, weight: 0.2, label: "Food diversity", confidence: 0.9 },
        homePreparedMealShare: { score: 90, weight: 0.1, label: "Home-prepared meals", confidence: 0.9 },
        ...overrides,
      },
      goalAlignment: {},
    };
  }

  it("returns no recommendations when everything scores well", () => {
    expect(getFoodBalanceRecommendations(componentScores())).toHaveLength(0);
  });

  it("returns at most 3 recommendations even with many weak components", () => {
    const scores = componentScores({
      macroAndFibreBalance: { score: 20, weight: 0.25, label: "Macro and fibre balance", confidence: 0.9 },
      minimallyProcessedFoodBalance: { score: 20, weight: 0.25, label: "Minimally processed", confidence: 0.9 },
      fruitAndVegetableIntake: { score: 20, weight: 0.2, label: "Fruits and vegetables", confidence: 0.9 },
      foodDiversity: { score: 20, weight: 0.2, label: "Food diversity", confidence: 0.9 },
      homePreparedMealShare: { score: 20, weight: 0.1, label: "Home-prepared meals", confidence: 0.9 },
    });
    const recommendations = getFoodBalanceRecommendations(scores);
    expect(recommendations.length).toBeLessThanOrEqual(3);
    expect(recommendations.length).toBeGreaterThan(0);
  });

  it("returns only 1 recommendation when just one component has a real gap", () => {
    const scores = componentScores({
      fruitAndVegetableIntake: { score: 30, weight: 0.2, label: "Fruits and vegetables", confidence: 0.9 },
    });
    const recommendations = getFoodBalanceRecommendations(scores);
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].category).toBe("vegetables");
  });

  it("does not recommend from low-confidence data", () => {
    const scores = componentScores({
      fruitAndVegetableIntake: { score: 20, weight: 0.2, label: "Fruits and vegetables", confidence: 0.1 },
    });
    expect(getFoodBalanceRecommendations(scores)).toHaveLength(0);
  });

  it("ranks the largest opportunity first", () => {
    const scores = componentScores({
      macroAndFibreBalance: { score: 40, weight: 0.25, label: "Macro and fibre balance", confidence: 0.9 },
      fruitAndVegetableIntake: { score: 85, weight: 0.2, label: "Fruits and vegetables", confidence: 0.9 },
    });
    const recommendations = getFoodBalanceRecommendations(scores);
    expect(recommendations[0].category).toBe("fibre");
  });
});

describe("calculateFoodBalanceScore (end-to-end)", () => {
  it("returns collecting_data status under 6 meals", () => {
    const result = calculateFoodBalanceScore({ allMeals: mealsAcrossDays(4) });
    expect(result.status).toBe("collecting_data");
    expect(result.score).toBeNull();
  });

  it("returns a foundation_only score with no profile", () => {
    const result = calculateFoodBalanceScore({ allMeals: mealsAcrossDays(15) });
    expect(result.status).toBe("foundation_only");
    expect(result.score).not.toBeNull();
    expect(result.score!).toBeGreaterThanOrEqual(0);
    expect(result.score!).toBeLessThanOrEqual(100);
  });

  it("returns fully_personalized with a complete profile and enough confidence", () => {
    const meals = mealsAcrossDays(21, { isUserCorrected: true });
    const profile: FoodBalanceUserProfile = {
      goals: ["maintain_weight"],
      currentWeightKg: 70,
      heightCm: 170,
      age: 30,
      metabolicEquationSex: "male",
      activityLevel: "moderately_active",
    };
    const result = calculateFoodBalanceScore({ allMeals: meals, profile });
    expect(result.status).toBe("fully_personalized");
    expect(result.foodFoundationScore).not.toBeNull();
    expect(result.goalAlignmentScore).not.toBeNull();
  });

  it("caps the calorie component's influence — swapping only energy score should shift the total by at most ~18%", () => {
    const meals = mealsAcrossDays(21, { isUserCorrected: true });
    const profile: FoodBalanceUserProfile = {
      goals: ["reduce_weight"],
      currentWeightKg: 70,
      heightCm: 170,
      age: 30,
      metabolicEquationSex: "male",
      activityLevel: "moderately_active",
    };
    const now = new Date();
    const normal = calculateFoodBalanceScore({ allMeals: meals, profile, now });
    const overeating = calculateFoodBalanceScore({
      allMeals: meals.map((m) => ({ ...m, calories: (m.calories ?? 0) * 3 })),
      profile,
      now,
    });
    expect(normal.rawScore).not.toBeNull();
    expect(overeating.rawScore).not.toBeNull();
    // 45% Energy Alignment within 40% Goal Alignment = 18% of total.
    expect(Math.abs(normal.rawScore! - overeating.rawScore!)).toBeLessThanOrEqual(19);
  });

  it("applies exponential smoothing against a previous displayed score", () => {
    const meals = mealsAcrossDays(15);
    const now = new Date();
    const result = calculateFoodBalanceScore({ allMeals: meals, previousDisplayedScore: 50, now });
    const rawOnly = calculateFoodBalanceScore({ allMeals: meals, now });
    expect(result.rawScore).toEqual(rawOnly.rawScore);
    const expectedDisplayed = Math.round(0.7 * 50 + 0.3 * result.rawScore!);
    expect(result.score).toBe(expectedDisplayed);
  });

  it("uses the raw score directly for the first calculation (no previous score)", () => {
    const meals = mealsAcrossDays(15);
    const result = calculateFoodBalanceScore({ allMeals: meals });
    expect(result.score).toBe(Math.round(result.rawScore!));
  });

  it("returns refreshing_data when historically eligible but recent coverage has dropped", () => {
    const oldMeals = Array.from({ length: 20 }, (_, i) => meal({ loggedAt: daysAgo(30 + i) }));
    const result = calculateFoodBalanceScore({ allMeals: oldMeals });
    expect(result.status).toBe("refreshing_data");
    expect(result.score).toBeNull();
  });

  it("excludes deleted/duplicate meals from eligibility and scoring", () => {
    const meals = mealsAcrossDays(20).map((m, i) => (i < 16 ? { ...m, isDeleted: true } : m));
    const result = calculateFoodBalanceScore({ allMeals: meals });
    expect(result.dataCoverage.eligibleMealCount).toBe(4);
    expect(result.status).toBe("collecting_data");
  });

  it("stamps the current scoring version", () => {
    const result = calculateFoodBalanceScore({ allMeals: mealsAcrossDays(15) });
    expect(result.scoringVersion).toBe(FOOD_BALANCE_SCORING_VERSION);
  });

  it("never returns Infinity/NaN even with zero eligible window meals but eligible history", () => {
    // Eligible historically, but the scoring window itself now empty of
    // eligible meals due to a long gap — should be refreshing_data, not a
    // NaN score.
    const meals = Array.from({ length: 15 }, (_, i) => meal({ loggedAt: daysAgo(20 + i) }));
    const result = calculateFoodBalanceScore({ allMeals: meals });
    expect(result.status).toBe("refreshing_data");
    expect(Number.isNaN(result.score)).toBe(false);
  });
});

describe("healthy_aging goal", () => {
  const healthyAgingProfile: FoodBalanceUserProfile = {
    goals: ["healthy_aging"],
    currentWeightKg: 70,
    heightCm: 165,
    age: 68,
    metabolicEquationSex: "female",
    activityLevel: "lightly_active",
  };

  it("is accepted as a valid goal by calculateGoalAlignmentScore", () => {
    const meals = mealsAcrossDays(15);
    const result = calculateGoalAlignmentScore(meals, healthyAgingProfile, 1, 1);
    expect(result.score).not.toBeNull();
  });

  it("uses the 35/25/15/15/10 Healthy Aging Alignment weighting", () => {
    const meals = mealsAcrossDays(15);
    const result = calculateGoalAlignmentScore(meals, healthyAgingProfile, 1, 1);
    expect(result.components.energyAlignment?.weight).toBeCloseTo(0.35);
    expect(result.components.proteinAdequacy?.weight).toBeCloseTo(0.25);
    expect(result.components.proteinDistribution?.weight).toBeCloseTo(0.15);
    expect(result.components.nutrientDenseFoodCoverage?.weight).toBeCloseTo(0.15);
    expect(result.components.healthyAgingFoodPattern?.weight).toBeCloseTo(0.1);
  });

  it("does not flag a resistance-training note (that's gain_muscle only)", () => {
    const meals = mealsAcrossDays(15);
    const result = calculateGoalAlignmentScore(meals, healthyAgingProfile, 1, 1);
    expect(result.needsResistanceTrainingNote).toBe(false);
  });

  describe("energy adequacy", () => {
    const range = { lowerKcal: 1800, upperKcal: 2000, midpointKcal: 1900, isActivityBased: true };

    it("scores 100 within the maintenance range", () => {
      expect(calculateHealthyAgingEnergyAdequacyScore(1900, range)).toBe(100);
    });

    it("penalizes intake below the range", () => {
      expect(calculateHealthyAgingEnergyAdequacyScore(1600, range)).toBeLessThan(100);
    });

    it("penalizes intake above the range", () => {
      expect(calculateHealthyAgingEnergyAdequacyScore(2300, range)).toBeLessThan(100);
    });

    it("penalizes an equal deviation below the range more steeply than above it", () => {
      const below = calculateHealthyAgingEnergyAdequacyScore(1700, range); // 100 below L
      const above = calculateHealthyAgingEnergyAdequacyScore(2100, range); // 100 above U
      expect(below).toBeLessThan(above);
    });

    it("uses the maintenance estimate as the target range (no deficit/surplus offset)", () => {
      const maintenance = calculateMaintenanceEstimate(healthyAgingProfile);
      const target = calculateEnergyTargetRange(healthyAgingProfile, ["healthy_aging"]);
      expect(target!.lowerKcal).toBeCloseTo(maintenance!.lowerKcal);
      expect(target!.upperKcal).toBeCloseTo(maintenance!.upperKcal);
    });

    it("omits energy and renormalizes when confidence is below the threshold", () => {
      const result = calculateGoalAlignmentScore(mealsAcrossDays(15), healthyAgingProfile, 0.2, 0.2);
      expect(result.missingInputs).toContain("energy");
      expect(result.components.energyAlignment).toBeUndefined();
      expect(result.score).not.toBeNull();
    });
  });

  describe("protein adequacy", () => {
    it("scores 0 at the very bottom of the low range", () => {
      expect(calculateHealthyAgingProteinScore(0)).toBe(0);
    });
    it("scores 40 at the 0.6 g/kg breakpoint", () => {
      expect(calculateHealthyAgingProteinScore(0.6)).toBeCloseTo(40);
    });
    it("interpolates between 0.6 and 1.0 g/kg", () => {
      const score = calculateHealthyAgingProteinScore(0.8);
      expect(score).toBeGreaterThan(40);
      expect(score).toBeLessThan(100);
    });
    it("scores 100 at 1.0 g/kg", () => {
      expect(calculateHealthyAgingProteinScore(1.0)).toBe(100);
    });
    it("scores 100 at 1.2 g/kg (no extra reward within the target range)", () => {
      expect(calculateHealthyAgingProteinScore(1.2)).toBe(100);
    });
    it("gives no additional reward above 1.2 g/kg", () => {
      expect(calculateHealthyAgingProteinScore(2.0)).toBe(100);
    });
  });

  describe("protein distribution", () => {
    const weightKg = 70;

    it("computes the meaningful-protein threshold as clamp(0.3 * weightKg, 20, 30)", () => {
      expect(meaningfulProteinThresholdGrams(70)).toBe(21);
      expect(meaningfulProteinThresholdGrams(40)).toBe(20); // clamped to the floor
      expect(meaningfulProteinThresholdGrams(200)).toBe(30); // clamped to the ceiling
    });

    it("scores higher with protein across more meals per day", () => {
      const oneMealPerDay = Array.from({ length: 10 }, (_, i) =>
        meal({ loggedAt: daysAgo(i), proteinG: 25, mealType: i % 2 === 0 ? "lunch" : "snack", ...(i % 2 === 0 ? {} : { proteinG: 2 }) })
      );
      const threeMealsPerDay = Array.from({ length: 30 }, (_, i) =>
        meal({ loggedAt: daysAgo(Math.floor(i / 3)), proteinG: 25 })
      );
      const oneResult = calculateHealthyAgingProteinDistribution(oneMealPerDay, weightKg);
      const threeResult = calculateHealthyAgingProteinDistribution(threeMealsPerDay, weightKg);
      expect(threeResult.score!).toBeGreaterThan(oneResult.score!);
    });

    it("reduces confidence rather than score for under-logged days", () => {
      const sparse = [meal({ loggedAt: daysAgo(0), proteinG: 25 }), meal({ loggedAt: daysAgo(1), proteinG: undefined })];
      const result = calculateHealthyAgingProteinDistribution(sparse, weightKg);
      expect(result.confidence).toBeLessThan(1);
    });
  });

  describe("nutrient-dense food coverage", () => {
    it("returns null with no coverage-tagged meals", () => {
      const meals = mealsAcrossDays(10, { healthyAgingCoverageGroups: [] });
      expect(calculateHealthyAgingCoverage(meals).score).toBeNull();
    });

    it("scores higher with complete category coverage than partial", () => {
      const complete = mealsAcrossDays(14, {
        healthyAgingCoverageGroups: [
          "calcium_rich_or_fortified_foods",
          "b12_containing_or_fortified_foods",
          "legumes_or_soy",
          "vegetables_including_leafy_vegetables",
          "fruit",
          "whole_grains_or_high_fibre_starches",
          "nuts_and_seeds",
        ],
      });
      const partial = mealsAcrossDays(14, { healthyAgingCoverageGroups: ["vegetables_including_leafy_vegetables"] });
      const completeResult = calculateHealthyAgingCoverage(complete);
      const partialResult = calculateHealthyAgingCoverage(partial);
      expect(completeResult.score!).toBeGreaterThan(partialResult.score!);
    });

    it("excludes untagged meals from the denominator rather than treating them as missing", () => {
      const mixed = [
        ...mealsAcrossDays(5, { healthyAgingCoverageGroups: ["fruit"] }),
        ...mealsAcrossDays(5, { healthyAgingCoverageGroups: undefined }),
      ];
      const result = calculateHealthyAgingCoverage(mixed);
      expect(result.confidence).toBeCloseTo(0.5, 1);
    });
  });

  describe("healthy-aging food pattern", () => {
    it("is null when coverage is unavailable", () => {
      expect(calculateHealthyAgingFoodPattern([], null, 0).score).toBeNull();
    });

    it("has limited impact from a single celebratory/concern meal", () => {
      const meals = mealsAcrossDays(14, { healthyAgingCoverageGroups: ["fruit", "vegetables_including_leafy_vegetables"] });
      const withOneConcern = meals.map((m, i) => (i === 0 ? { ...m, isHealthyAgingPatternConcern: true } : m));
      const coverage = calculateHealthyAgingCoverage(meals);
      const baseline = calculateHealthyAgingFoodPattern(meals, coverage.score, coverage.confidence);
      const withConcern = calculateHealthyAgingFoodPattern(withOneConcern, coverage.score, coverage.confidence);
      expect(baseline.score! - withConcern.score!).toBeLessThan(5);
    });
  });

  describe("recommendations", () => {
    it("never generates a hydration-category recommendation", () => {
      const scores: FoodBalanceComponentScores = {
        foodFoundation: {
          macroAndFibreBalance: { score: 30, weight: 0.25, label: "Macro and fibre balance", confidence: 0.9 },
          minimallyProcessedFoodBalance: { score: 30, weight: 0.25, label: "Minimally processed", confidence: 0.9 },
          fruitAndVegetableIntake: { score: 30, weight: 0.2, label: "Fruits and vegetables", confidence: 0.9 },
          foodDiversity: { score: 30, weight: 0.2, label: "Food diversity", confidence: 0.9 },
          homePreparedMealShare: { score: 30, weight: 0.1, label: "Home-prepared meals", confidence: 0.9 },
        },
        goalAlignment: {
          energyAlignment: { score: 30, weight: 0.35, label: "Energy alignment", confidence: 0.9 },
          proteinAdequacy: { score: 30, weight: 0.25, label: "Protein adequacy", confidence: 0.9 },
          proteinDistribution: { score: 30, weight: 0.15, label: "Protein distribution", confidence: 0.9 },
          nutrientDenseFoodCoverage: { score: 30, weight: 0.15, label: "Nutrient-dense food coverage", confidence: 0.9 },
          healthyAgingFoodPattern: { score: 30, weight: 0.1, label: "Healthy-aging food pattern", confidence: 0.9 },
        },
      };
      const recommendations = getFoodBalanceRecommendations(scores);
      expect(recommendations.every((r) => !String(r.category).includes("hydrat"))).toBe(true);
      expect(recommendations.every((r) => !r.title.toLowerCase().includes("water"))).toBe(true);
    });
  });

  it("full end-to-end score for healthy_aging stays within 0-100 and status reflects data completeness", () => {
    const meals = mealsAcrossDays(21, {
      isUserCorrected: true,
      healthyAgingCoverageGroups: ["fruit", "legumes_or_soy"],
    });
    const result = calculateFoodBalanceScore({ allMeals: meals, profile: healthyAgingProfile });
    expect(result.score).not.toBeNull();
    expect(result.score!).toBeGreaterThanOrEqual(0);
    expect(result.score!).toBeLessThanOrEqual(100);
    expect(["fully_personalized", "partially_personalized"]).toContain(result.status);
  });
});

describe("existing goals are unaffected by the healthy_aging addition", () => {
  it("reduce_weight still produces the same shape of result", () => {
    const meals = mealsAcrossDays(15);
    const profile: FoodBalanceUserProfile = {
      goals: ["reduce_weight"],
      currentWeightKg: 70,
      heightCm: 170,
      age: 30,
      metabolicEquationSex: "male",
      activityLevel: "moderately_active",
    };
    const result = calculateGoalAlignmentScore(meals, profile, 1, 1);
    expect(result.components.energyAlignment).toBeDefined();
    expect(result.components.nutrientDenseFoodCoverage).toBeUndefined();
    expect(result.components.healthyAgingFoodPattern).toBeUndefined();
  });
});
