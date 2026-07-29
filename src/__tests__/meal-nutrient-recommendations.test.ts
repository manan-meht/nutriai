import type { FoodBalanceMealInput } from "@nutriai/health-scoring";
import { DEFAULT_DIETARY_PROFILE } from "@/lib/dietary-profile";
import {
  buildMealNutritionHistory,
  calculateOverallLoggingCompleteness,
  calculateMealSlotProteinAdequacy,
  calculateMealSlotAdequacy,
  classifyEvidenceType,
  generateMealProteinRecommendationCandidates,
  generateMealRecommendationCandidates,
  scoreRecommendationCandidates,
  applyRecommendationHistoryPenalty,
  selectPersonalisedFoodSuggestions,
  confidenceLevelFor,
  renderFoodBalanceRecommendation,
  renderTodayFocusRecommendation,
  MEAL_RECOMMENDATION_CONFIG,
  RECOMMENDATION_CATEGORIES_MADE_REDUNDANT,
  type MealRecommendationCandidate,
  type RecommendationHistoryEntry,
} from "@/lib/food-balance/meal-nutrient-recommendations";

const TZ = "Asia/Kolkata";
const TODAY = "2026-07-28"; // yesterday under test = 2026-07-27

function dateOffset(daysAgoFromToday: number): string {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - daysAgoFromToday);
  return d.toISOString().slice(0, 10);
}

let mealCounter = 0;
function meal(daysAgo: number, mealType: string, proteinG: number, overrides: Partial<FoodBalanceMealInput> = {}): FoodBalanceMealInput {
  mealCounter++;
  // Fixed at a safely mid-day UTC hour regardless of mealType — meal slot
  // here is decided entirely by the explicit `mealType` field (never
  // time-of-day inference), so the hour only needs to stay clear of the
  // IST (+5:30) calendar-date boundary: 10:00 UTC = 15:30 IST, safely
  // inside the same local date as `daysAgo` intends. A dinner-realistic
  // hour like 20:00 UTC = 01:30 IST the *next* day would otherwise
  // silently shift every dinner fixture by one bucket.
  return {
    id: `meal-${mealCounter}`,
    loggedAt: `${dateOffset(daysAgo)}T10:00:00.000Z`,
    mealType,
    proteinG,
    wholeFoods: [],
    ...overrides,
  };
}

/** Builds 6 days of breakfast+lunch+dinner (days 1-6 ago, i.e. yesterday
 * included) using per-slot protein-gram generator functions — day 7 (a
 * week ago) is left unlogged in most fixtures, mirroring a realistic
 * "logged most days" pattern. */
function sixDaysOfMeals(proteinFor: (mealType: "breakfast" | "lunch" | "dinner", daysAgo: number) => number): FoodBalanceMealInput[] {
  const meals: FoodBalanceMealInput[] = [];
  for (let daysAgo = 1; daysAgo <= 6; daysAgo++) {
    for (const mealType of ["breakfast", "lunch", "dinner"] as const) {
      meals.push(meal(daysAgo, mealType, proteinFor(mealType, daysAgo)));
    }
  }
  return meals;
}

const TARGET_PROTEIN_G = 90; // e.g. ~1.3g/kg for a 70kg user
const TARGET_FIBER_G = 32;
const TARGET_CALORIES = 2000;

/** Builds 6 days of breakfast+lunch+dinner with arbitrary per-meal
 * nutrient overrides, for testing fiber/fruit/vegetable/calories tracks
 * that need more than just a protein number per meal. */
function sixDaysOfMealsWith(
  fieldsFor: (mealType: "breakfast" | "lunch" | "dinner", daysAgo: number) => Partial<FoodBalanceMealInput>
): FoodBalanceMealInput[] {
  const meals: FoodBalanceMealInput[] = [];
  for (let daysAgo = 1; daysAgo <= 6; daysAgo++) {
    for (const mealType of ["breakfast", "lunch", "dinner"] as const) {
      meals.push(meal(daysAgo, mealType, 30, fieldsFor(mealType, daysAgo)));
    }
  }
  return meals;
}

describe("buildMealNutritionHistory / calculateOverallLoggingCompleteness", () => {
  it("does not treat an unlogged meal as zero protein — dinner not logged is simply absent from history", () => {
    const meals = [meal(1, "breakfast", 30), meal(1, "lunch", 25)]; // no dinner yesterday
    const history = buildMealNutritionHistory(meals, TZ, TODAY);
    const dinnerInstances = history.instancesBySlot.dinner;
    expect(dinnerInstances.find((i) => i.date === dateOffset(1))).toBeUndefined();
  });

  it("reduces a partially logged day's completeness weight instead of averaging in a zero", () => {
    // Only 1 of an expected ~3 meals logged yesterday.
    const meals = [
      ...sixDaysOfMeals(() => 30),
      meal(1, "breakfast", 30, { loggedAt: `${dateOffset(1)}T08:00:00.000Z` }),
    ];
    const history = buildMealNutritionHistory(meals, TZ, TODAY);
    // Yesterday (daysAgo=1) already has breakfast/lunch/dinner from
    // sixDaysOfMeals, so completeness should be close to 1, not penalized.
    expect(history.dailyLoggingCompleteness[dateOffset(1)]).toBeCloseTo(1, 1);

    const sparse = buildMealNutritionHistory([...sixDaysOfMeals(() => 30), meal(0, "breakfast", 30)], TZ, TODAY);
    // A day with only one of ~3 expected meals should be well below 1.
    expect(sparse.dailyLoggingCompleteness[dateOffset(1)]).toBeLessThanOrEqual(1);
  });

  it("computes overall logging completeness across the 7-day window", () => {
    const meals = sixDaysOfMeals(() => 30);
    const history = buildMealNutritionHistory(meals, TZ, TODAY);
    const completeness = calculateOverallLoggingCompleteness(history);
    // 6 of 7 days logged, each with 3 meals (>= expected) -> high completeness.
    expect(completeness).toBeGreaterThan(0.7);
  });

  it("a user who normally eats two meals a day is not penalized for never logging a third", () => {
    const meals: FoodBalanceMealInput[] = [];
    for (let daysAgo = 1; daysAgo <= 6; daysAgo++) {
      meals.push(meal(daysAgo, "lunch", 35));
      meals.push(meal(daysAgo, "dinner", 35));
    }
    const history = buildMealNutritionHistory(meals, TZ, TODAY);
    expect(history.expectedMealsPerDay).toBe(2);
    expect(calculateOverallLoggingCompleteness(history)).toBeGreaterThan(0.7);
  });
});

describe("calculateMealSlotProteinAdequacy / classifyEvidenceType", () => {
  it("breakfast protein consistently adequate — no pattern of inadequacy", () => {
    const meals = sixDaysOfMeals((slot) => (slot === "breakfast" ? 35 : 20));
    const history = buildMealNutritionHistory(meals, TZ, TODAY);
    const breakfast = calculateMealSlotProteinAdequacy(history, "breakfast", history.dailyLoggingCompleteness, TARGET_PROTEIN_G);
    expect(breakfast.hasPattern).toBe(false);
  });

  it("dinner protein consistently low — a clear meal-level pattern", () => {
    const meals = sixDaysOfMeals((slot) => (slot === "dinner" ? 8 : 30));
    const history = buildMealNutritionHistory(meals, TZ, TODAY);
    const dinner = calculateMealSlotProteinAdequacy(history, "dinner", history.dailyLoggingCompleteness, TARGET_PROTEIN_G);
    expect(dinner.hasPattern).toBe(true);
    expect(dinner.belowRangeShare).toBeGreaterThanOrEqual(0.5);
  });

  it("lunch and dinner both low, with dinner worse — dinner is picked as the target meal", () => {
    const meals = sixDaysOfMeals((slot) => {
      if (slot === "dinner") return 5;
      if (slot === "lunch") return 14;
      return 35;
    });
    const history = buildMealNutritionHistory(meals, TZ, TODAY);
    const candidates = generateMealProteinRecommendationCandidates({ history, dailyProteinTargetG: TARGET_PROTEIN_G });
    expect(candidates[0]?.mealType).toBe("dinner");
  });

  it("yesterday confirms an established historical pattern", () => {
    const meals = sixDaysOfMeals((slot) => (slot === "dinner" ? 8 : 30)); // yesterday (daysAgo=1) also low
    const history = buildMealNutritionHistory(meals, TZ, TODAY);
    const dinner = calculateMealSlotProteinAdequacy(history, "dinner", history.dailyLoggingCompleteness, TARGET_PROTEIN_G);
    expect(classifyEvidenceType(dinner)).toBe("yesterday_confirms_pattern");
  });

  it("yesterday contradicts an established historical pattern (yesterday was actually fine)", () => {
    const meals = sixDaysOfMeals((slot, daysAgo) => {
      if (slot !== "dinner") return 30;
      return daysAgo === 1 ? 35 : 8; // yesterday's dinner was good, days before were low
    });
    const history = buildMealNutritionHistory(meals, TZ, TODAY);
    const dinner = calculateMealSlotProteinAdequacy(history, "dinner", history.dailyLoggingCompleteness, TARGET_PROTEIN_G);
    // Historical pattern still holds (5 of 6 low), but must not claim
    // yesterday itself was low — evidenceType must not be
    // yesterday_confirms_pattern.
    expect(classifyEvidenceType(dinner)).toBe("historical_pattern");
    expect(dinner.yesterdayBelowRange).toBe(false);
  });

  it("a single unusual day is not presented as a recurring habit", () => {
    // Dinner is fine on 5 of 6 days; yesterday alone was unusually low.
    const meals = sixDaysOfMeals((slot, daysAgo) => {
      if (slot !== "dinner") return 30;
      return daysAgo === 1 ? 5 : 30;
    });
    const history = buildMealNutritionHistory(meals, TZ, TODAY);
    const dinner = calculateMealSlotProteinAdequacy(history, "dinner", history.dailyLoggingCompleteness, TARGET_PROTEIN_G);
    expect(classifyEvidenceType(dinner)).toBe("single_unusual_day");
  });
});

describe("generateMealProteinRecommendationCandidates — meal selection", () => {
  it("does not recommend protein at breakfast when breakfast is already consistently adequate", () => {
    const meals = sixDaysOfMeals((slot) => (slot === "dinner" ? 8 : 32));
    const history = buildMealNutritionHistory(meals, TZ, TODAY);
    const candidates = generateMealProteinRecommendationCandidates({ history, dailyProteinTargetG: TARGET_PROTEIN_G });
    expect(candidates.every((c) => c.mealType !== "breakfast")).toBe(true);
    expect(candidates[0]?.mealType).toBe("dinner");
  });

  it("does not generate a recommendation from one isolated low meal (insufficient instances)", () => {
    // Dinner only logged twice in the window — below minInstancesForPattern.
    const meals = [
      ...sixDaysOfMeals((slot) => (slot === "dinner" ? 0 : 30)).filter((m) => m.mealType !== "dinner"),
      meal(1, "dinner", 5),
      meal(2, "dinner", 5),
    ];
    const history = buildMealNutritionHistory(meals, TZ, TODAY);
    const candidates = generateMealProteinRecommendationCandidates({ history, dailyProteinTargetG: TARGET_PROTEIN_G });
    expect(candidates.find((c) => c.mealType === "dinner" && c.category === "protein_low")).toBeUndefined();
  });

  it("overall protein adequate but unevenly distributed — flags distribution, not total inadequacy", () => {
    // Breakfast well above its own range (55% of daily target), lunch/
    // dinner each still clear their own per-slot minimum (25g target,
    // 25% of 90 = 22.5g) so neither is individually "problematic" — total
    // (50+25+25=100) is also above the 90*0.85=76.5 overall-adequacy floor.
    const meals = sixDaysOfMeals((slot) => {
      if (slot === "breakfast") return 50;
      return 25;
    });
    const history = buildMealNutritionHistory(meals, TZ, TODAY);
    const candidates = generateMealProteinRecommendationCandidates({ history, dailyProteinTargetG: TARGET_PROTEIN_G });
    expect(candidates[0]?.category).toBe("protein_distribution");
    expect(candidates[0]?.issueType).toBe("distribution_gap");
  });

  it("overall protein low across all meals — issueType is overall_gap", () => {
    const meals = sixDaysOfMeals(() => 8);
    const history = buildMealNutritionHistory(meals, TZ, TODAY);
    const candidates = generateMealProteinRecommendationCandidates({ history, dailyProteinTargetG: TARGET_PROTEIN_G });
    expect(candidates[0]?.issueType).toBe("overall_gap");
  });

  it("genuinely fine distribution and adequacy produces no candidate at all", () => {
    const meals = sixDaysOfMeals(() => 30); // even distribution, well above minimums, near target
    const history = buildMealNutritionHistory(meals, TZ, TODAY);
    const candidates = generateMealProteinRecommendationCandidates({ history, dailyProteinTargetG: TARGET_PROTEIN_G });
    expect(candidates).toHaveLength(0);
  });

  it("includes positive context only when a meal is genuinely performing well", () => {
    const meals = sixDaysOfMeals((slot) => (slot === "dinner" ? 8 : 32));
    const history = buildMealNutritionHistory(meals, TZ, TODAY);
    const candidates = generateMealProteinRecommendationCandidates({ history, dailyProteinTargetG: TARGET_PROTEIN_G });
    expect(candidates[0]?.positiveContext?.slot).toBe("breakfast");
  });
});

describe("scoreRecommendationCandidates", () => {
  it("ranks a severe, consistent, well-logged candidate above a weak one", () => {
    const strong = generateMealProteinRecommendationCandidates({
      history: buildMealNutritionHistory(sixDaysOfMeals((slot) => (slot === "dinner" ? 5 : 32)), TZ, TODAY),
      dailyProteinTargetG: TARGET_PROTEIN_G,
      goal: "gain_muscle",
    })[0];
    expect(strong).toBeDefined();
    const scored = scoreRecommendationCandidates([strong!]);
    expect(scored[0].score).toBeGreaterThan(0);
    expect(scored[0].score).toBeLessThanOrEqual(1);
  });
});

describe("applyRecommendationHistoryPenalty", () => {
  const baseCandidate: MealRecommendationCandidate = {
    category: "protein_low",
    nutrient: "protein",
    mealType: "dinner",
    issueType: "meal_gap",
    evidenceType: "historical_pattern",
    severity: 0.6,
    consistencyScore: 0.6,
    loggingConfidence: 0.8,
    classificationConfidence: 1,
    goalRelevance: 0.6,
    recencyScore: 0.5,
    actionabilityScore: 0.8,
    noveltyScore: 1,
    supportingMetrics: {},
    suggestedFoodIds: [],
  };

  it("strongly penalizes a repeat within the last 2 days", () => {
    const history: RecommendationHistoryEntry[] = [{ localDate: dateOffset(1), category: "protein_low", mealType: "dinner" }];
    const penalized = applyRecommendationHistoryPenalty(baseCandidate, history, TODAY);
    expect(penalized.noveltyScore).toBeLessThan(0.5);
  });

  it("moderately penalizes a repeat within the last 7 days", () => {
    const history: RecommendationHistoryEntry[] = [{ localDate: dateOffset(5), category: "protein_low", mealType: "dinner" }];
    const penalized = applyRecommendationHistoryPenalty(baseCandidate, history, TODAY);
    expect(penalized.noveltyScore).toBeLessThan(1);
    expect(penalized.noveltyScore).toBeGreaterThan(0.15);
  });

  it("does not penalize a different meal/category combination", () => {
    const history: RecommendationHistoryEntry[] = [{ localDate: dateOffset(1), category: "protein_low", mealType: "breakfast" }];
    const penalized = applyRecommendationHistoryPenalty(baseCandidate, history, TODAY);
    expect(penalized.noveltyScore).toBe(1);
  });

  it("a severe persistent issue partially overrides the repetition penalty", () => {
    const severe: MealRecommendationCandidate = {
      ...baseCandidate,
      evidenceType: "yesterday_confirms_pattern",
      severity: 0.9,
    };
    const history: RecommendationHistoryEntry[] = [{ localDate: dateOffset(1), category: "protein_low", mealType: "dinner" }];
    const penalized = applyRecommendationHistoryPenalty(severe, history, TODAY);
    expect(penalized.noveltyScore).toBeGreaterThanOrEqual(0.6);
  });
});

describe("selectPersonalisedFoodSuggestions — dietary restrictions", () => {
  it("does not suggest meat to a vegetarian user", () => {
    const profile = { ...DEFAULT_DIETARY_PROFILE, explicit_vegetarian: true };
    const history = buildMealNutritionHistory([], TZ, TODAY);
    const { text } = selectPersonalisedFoodSuggestions("protein", "dinner", profile, history);
    expect(text.toLowerCase()).not.toMatch(/chicken|fish|beef|pork|mutton/);
  });

  it("does not suggest dairy to a dairy-free user", () => {
    const profile = { ...DEFAULT_DIETARY_PROFILE, explicit_avoids_dairy: true };
    const history = buildMealNutritionHistory([], TZ, TODAY);
    const { text } = selectPersonalisedFoodSuggestions("protein", "dinner", profile, history);
    expect(text.toLowerCase()).not.toMatch(/paneer|yogurt|yoghurt|curd|milk|cheese/);
  });

  it("does not suggest eggs to a user whose preferences exclude eggs", () => {
    const profile = { ...DEFAULT_DIETARY_PROFILE, explicit_avoids_eggs: true };
    const history = buildMealNutritionHistory([], TZ, TODAY);
    const { text } = selectPersonalisedFoodSuggestions("protein", "dinner", profile, history);
    expect(text.toLowerCase()).not.toMatch(/\begg/);
  });

  it("prioritises a food the user already eats at another meal", () => {
    const history = buildMealNutritionHistory(
      [meal(1, "breakfast", 30, { wholeFoods: ["eggs"] }), meal(1, "dinner", 30, { wholeFoods: ["rice"] })],
      TZ,
      TODAY
    );
    // observed_eggs must be true for eggs to be an allowed suggestion at
    // all (isAllowed's "never suggest until actually observed" gate) —
    // reasonable here, since the premise of this test is exactly that
    // this user does eat eggs.
    const profile = { ...DEFAULT_DIETARY_PROFILE, observed_eggs: true };
    const { text } = selectPersonalisedFoodSuggestions("protein", "dinner", profile, history);
    // Whatever the library ranks, a food already eaten at breakfast
    // (eggs) should be boosted to the front when present at all.
    const firstSuggestion = text.split(/,| or /)[0].trim().toLowerCase();
    expect(firstSuggestion).toBe("eggs");
  });
});

describe("confidenceLevelFor / rendering", () => {
  const strongCandidate: MealRecommendationCandidate = {
    category: "protein_low",
    nutrient: "protein",
    mealType: "dinner",
    issueType: "meal_gap",
    evidenceType: "yesterday_confirms_pattern",
    severity: 0.85,
    consistencyScore: 0.85,
    loggingConfidence: 0.9,
    classificationConfidence: 1,
    goalRelevance: 0.8,
    recencyScore: 1,
    actionabilityScore: 1,
    noveltyScore: 1,
    positiveContext: { slot: "breakfast", averageAmount: 32 },
    supportingMetrics: {},
    suggestedFoodIds: [],
  };
  const weakCandidate: MealRecommendationCandidate = {
    ...strongCandidate,
    evidenceType: "yesterday_only",
    loggingConfidence: 0.3,
    consistencyScore: 0.3,
  };
  const foods = { text: "dal, paneer, tofu, or eggs", ids: ["dal", "paneer", "tofu", "eggs"] };

  it("high-confidence wording is direct", () => {
    expect(confidenceLevelFor(strongCandidate)).toBe("high");
    const rendered = renderTodayFocusRecommendation(strongCandidate, foods);
    expect(rendered).toMatch(/lowest-protein meal this week, including yesterday/);
  });

  it("low-confidence wording falls back to a logging prompt, not a strong claim", () => {
    const veryWeak: MealRecommendationCandidate = { ...weakCandidate, loggingConfidence: 0.1, consistencyScore: 0.1 };
    expect(confidenceLevelFor(veryWeak)).toBe("low");
    const rendered = renderTodayFocusRecommendation(veryWeak, foods);
    expect(rendered).toMatch(/keep logging/i);
    expect(rendered).not.toMatch(/dinner has been/i);
  });

  it("Food Balance version contains more explanation than Today's Focus", () => {
    const fb = renderFoodBalanceRecommendation(strongCandidate, foods);
    const focus = renderTodayFocusRecommendation(strongCandidate, foods);
    expect(fb.description.length).toBeGreaterThan(focus.length - 20); // FB explains the "why" more
    expect(focus).toContain("Today's focus:");
  });

  it("Today's Focus stays concise (no raw percentage numbers in the default message)", () => {
    const focus = renderTodayFocusRecommendation(strongCandidate, foods);
    expect(focus).not.toMatch(/%/);
  });

  it("does not use compensatory or shaming language", () => {
    const fb = renderFoodBalanceRecommendation(strongCandidate, foods);
    const focus = renderTodayFocusRecommendation(strongCandidate, foods);
    for (const text of [fb.description, focus]) {
      expect(text.toLowerCase()).not.toMatch(/make up for|compensate|failed|bad job|should have/);
    }
  });

  it("single unusual day wording does not claim a recurring habit", () => {
    const candidate: MealRecommendationCandidate = { ...strongCandidate, evidenceType: "single_unusual_day" };
    const rendered = renderTodayFocusRecommendation(candidate, foods);
    expect(rendered).toMatch(/one day does not require correction/i);
  });

  it("distribution wording never claims total protein is low", () => {
    const candidate: MealRecommendationCandidate = {
      ...strongCandidate,
      category: "protein_distribution",
      issueType: "distribution_gap",
      supportingMetrics: { concentratedSlot: "breakfast" },
    };
    const fb = renderFoodBalanceRecommendation(candidate, foods);
    expect(fb.description).toMatch(/close to target/i);
    expect(fb.description.toLowerCase()).not.toMatch(/you need more protein|protein is low/);
  });
});

describe("configuration", () => {
  it("thresholds are exposed as named configuration, not scattered magic numbers", () => {
    expect(MEAL_RECOMMENDATION_CONFIG.minInstancesForPattern).toBe(3);
    expect(MEAL_RECOMMENDATION_CONFIG.strongEvidenceInstances).toBe(4);
    expect(MEAL_RECOMMENDATION_CONFIG.minOverallLoggingCompleteness).toBe(0.6);
  });
});

describe("fiber — meal pattern analysis", () => {
  it("fiber concentrated in one meal (lunch) is flagged as a distribution issue, not total inadequacy", () => {
    // Lunch carries most of the day's fiber; breakfast (6g, clears both
    // its 3g floor and 32*0.15=4.8g target-based floor) and dinner (9g,
    // clears its 4g floor and 32*0.25=8g target-based floor) are each
    // individually fine. Total (22+6+9=37) is above 32*0.85=27.2, and
    // lunch's 22/32=68.75% share is well past its own 45%+15% buffer.
    const meals = sixDaysOfMealsWith((slot) => ({ fibreG: slot === "lunch" ? 22 : slot === "breakfast" ? 6 : 9 }));
    const history = buildMealNutritionHistory(meals, TZ, TODAY);
    const candidates = generateMealRecommendationCandidates({ history, nutrient: "fiber", dailyTarget: TARGET_FIBER_G });
    expect(candidates[0]?.issueType).toBe("distribution_gap");
    expect(candidates[0]?.supportingMetrics.concentratedSlot).toBe("lunch");
  });

  it("dinner has often contained little fiber this week — a meal-level low-fiber pattern", () => {
    const meals = sixDaysOfMealsWith((slot) => ({ fibreG: slot === "dinner" ? 1 : 10 }));
    const history = buildMealNutritionHistory(meals, TZ, TODAY);
    const candidates = generateMealRecommendationCandidates({ history, nutrient: "fiber", dailyTarget: TARGET_FIBER_G });
    expect(candidates[0]?.mealType).toBe("dinner");
    expect(candidates[0]?.category).toBe("fiber_low");
  });
});

describe("fruit / vegetable — meal pattern analysis", () => {
  it("vegetables present at lunch but absent at dinner — dinner is targeted, not lunch", () => {
    const meals = sixDaysOfMealsWith((slot) => ({
      vegetableServings: slot === "lunch" ? 1.5 : slot === "dinner" ? 0 : 0,
    }));
    const history = buildMealNutritionHistory(meals, TZ, TODAY);
    const candidates = generateMealRecommendationCandidates({ history, nutrient: "vegetable" });
    expect(candidates[0]?.mealType).toBe("dinner");
    expect(candidates.every((c) => c.mealType !== "lunch")).toBe(true);
  });

  it("fruit absent across the week is flagged at a realistic slot (breakfast or snack), not lunch/dinner", () => {
    const meals = sixDaysOfMealsWith(() => ({ fruitServings: 0 }));
    const history = buildMealNutritionHistory(meals, TZ, TODAY);
    const candidates = generateMealRecommendationCandidates({ history, nutrient: "fruit" });
    expect(candidates[0]).toBeDefined();
    expect(["breakfast", "snack"]).toContain(candidates[0]?.mealType);
  });

  it("does not flag lunch/dinner for lacking fruit — fruit is not expected at every meal", () => {
    const meals = sixDaysOfMealsWith((slot) => ({ fruitServings: slot === "breakfast" ? 1 : 0 }));
    const history = buildMealNutritionHistory(meals, TZ, TODAY);
    const candidates = generateMealRecommendationCandidates({ history, nutrient: "fruit" });
    expect(candidates.every((c) => c.mealType !== "lunch" && c.mealType !== "dinner")).toBe(true);
  });
});

describe("calories — meal too light", () => {
  it("dinner consistently too light for a Healthy Aging goal", () => {
    const meals = sixDaysOfMealsWith((slot) => ({ calories: slot === "dinner" ? 150 : 700 }));
    const history = buildMealNutritionHistory(meals, TZ, TODAY);
    const candidates = generateMealRecommendationCandidates({
      history,
      nutrient: "calories",
      dailyTarget: TARGET_CALORIES,
      goal: "healthy_aging",
    });
    expect(candidates[0]?.mealType).toBe("dinner");
    expect(candidates[0]?.category).toBe("calories_low");
    const rendered = renderTodayFocusRecommendation(candidates[0], { text: "a protein source and rice", ids: [] });
    expect(rendered.toLowerCase()).toMatch(/lighter/);
  });

  it("does not generate a low-calorie recommendation when dinner is simply rarely logged, not actually light", () => {
    // Dinner logged only twice — below minInstancesForPattern, so even
    // though those two instances are very low, there isn't enough
    // evidence to claim a pattern.
    const meals = [
      ...sixDaysOfMealsWith((slot) => ({ calories: slot === "dinner" ? undefined : 700 })).filter((m) => m.mealType !== "dinner"),
      meal(1, "dinner", 30, { calories: 100 }),
      meal(2, "dinner", 30, { calories: 100 }),
    ];
    const history = buildMealNutritionHistory(meals, TZ, TODAY);
    const candidates = generateMealRecommendationCandidates({ history, nutrient: "calories", dailyTarget: TARGET_CALORIES });
    expect(candidates.find((c) => c.mealType === "dinner")).toBeUndefined();
  });
});

describe("generic engine reused across nutrients — calculateMealSlotAdequacy", () => {
  it("produces the same result for protein via the generic function as the backward-compatible wrapper", () => {
    const meals = sixDaysOfMeals((slot) => (slot === "dinner" ? 8 : 30));
    const history = buildMealNutritionHistory(meals, TZ, TODAY);
    const generic = calculateMealSlotAdequacy(history, "dinner", "protein", TARGET_PROTEIN_G);
    const wrapper = calculateMealSlotProteinAdequacy(history, "dinner", history.dailyLoggingCompleteness, TARGET_PROTEIN_G);
    expect(generic.averageAmount).toBe(wrapper.averageProteinG);
    expect(generic.hasPattern).toBe(wrapper.hasPattern);
  });
});

describe("RECOMMENDATION_CATEGORIES_MADE_REDUNDANT — old-system category cleanup", () => {
  // Regression test: reported live as two overlapping recommendations
  // shown at once ("Add fruit to breakfast" alongside the old system's
  // "Add a vegetable or fruit serving") — the old system has no separate
  // "fruit" category at all, only a single combined "vegetables"-
  // categorized recommendation covering both fruit and vegetables (see
  // packages/health-scoring/src/food-balance/recommendations.ts's
  // TEMPLATES.fruitAndVegetableIntake). A naive same-string filter never
  // caught this since "fruit" !== "vegetables".
  it("a fruit candidate also marks the old system's combined vegetables category redundant", () => {
    expect(RECOMMENDATION_CATEGORIES_MADE_REDUNDANT.fruit).toContain("vegetables");
    expect(RECOMMENDATION_CATEGORIES_MADE_REDUNDANT.fruit).toContain("fruit");
  });

  it("a vegetable candidate also marks the old system's combined vegetables category redundant", () => {
    expect(RECOMMENDATION_CATEGORIES_MADE_REDUNDANT.vegetable).toContain("vegetables");
  });

  it("a protein candidate marks both protein adequacy and protein distribution redundant", () => {
    expect(RECOMMENDATION_CATEGORIES_MADE_REDUNDANT.protein).toEqual(expect.arrayContaining(["protein", "protein_distribution"]));
  });
});
