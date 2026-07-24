import { DEFAULT_DIETARY_PROFILE, applyExplicitPreferences } from "@/lib/dietary-profile";
import {
  calculateLoggingCompleteness,
  buildNutritionTrendSummary,
  generateRecommendationCandidates,
  rankRecommendationCandidates,
  applyRepetitionAndFeedbackRules,
  renderTodayFocusMessage,
  bucketMealsByLocalDate,
  recentLocalDates,
  type RecentFocusHistoryEntry,
  type TodaysFocusCandidate,
} from "@/lib/food-balance/todays-focus";
import { violatesSafetyRules } from "@/lib/food-balance/safety";
import type { FoodBalanceMealInput, FoodBalanceUserProfile } from "@nutriai/health-scoring";

// A fixed "today" for every test so date-relative windows are deterministic
// — meals are logged on the days strictly before this one.
const TODAY = "2026-07-24";
const TZ = "UTC";

function meal(daysAgo: number, mealType: string, overrides: Partial<FoodBalanceMealInput> = {}): FoodBalanceMealInput {
  const dates = recentLocalDates(TODAY, 10);
  const date = dates[dates.length - daysAgo];
  return {
    id: `${date}-${mealType}-${Math.random()}`,
    loggedAt: `${date}T08:00:00Z`,
    mealType,
    calories: 500,
    proteinG: 20,
    fibreG: 5,
    fruitServings: 0.5,
    vegetableServings: 0.5,
    processingLevel: "minimally_processed",
    wholeFoods: ["rice"],
    ...overrides,
  };
}

function proteinAdequateProfile(goals: FoodBalanceUserProfile["goals"] = ["maintain_weight"]): FoodBalanceUserProfile {
  return {
    goals,
    age: 35,
    heightCm: 170,
    currentWeightKg: 70,
    metabolicEquationSex: "male",
    activityLevel: "lightly_active",
  };
}

describe("calculateLoggingCompleteness", () => {
  it("scores a fully logged week as high completeness", () => {
    const meals: FoodBalanceMealInput[] = [];
    for (let d = 7; d >= 1; d--) {
      meals.push(meal(d, "breakfast"), meal(d, "lunch"), meal(d, "dinner"));
    }
    const buckets = bucketMealsByLocalDate(meals, TZ);
    const dates = recentLocalDates(TODAY, 7);
    const result = calculateLoggingCompleteness(buckets, dates);
    expect(result.level).toBe("high");
    expect(result.distinctLoggingDays).toBe(7);
    expect(result.hasBreakfastRepresented).toBe(true);
    expect(result.hasDinnerRepresented).toBe(true);
  });

  it("scores one or two logged meals across the whole week as low completeness", () => {
    const meals = [meal(1, "lunch")];
    const buckets = bucketMealsByLocalDate(meals, TZ);
    const dates = recentLocalDates(TODAY, 7);
    const result = calculateLoggingCompleteness(buckets, dates);
    expect(result.level).toBe("low");
  });

  it("does not penalize someone whose normal pattern is one meal a day", () => {
    // Every active day has exactly 1 meal — expectedMealsPerDay should be
    // derived as 1, so these days count as "reliable", not "incomplete".
    const meals = [meal(1, "dinner"), meal(2, "dinner"), meal(3, "dinner"), meal(4, "dinner"), meal(5, "dinner")];
    const buckets = bucketMealsByLocalDate(meals, TZ);
    const dates = recentLocalDates(TODAY, 7);
    const result = calculateLoggingCompleteness(buckets, dates);
    expect(result.expectedMealsPerDay).toBe(1);
    expect(result.reliableDayCount).toBe(5);
  });
});

describe("buildNutritionTrendSummary — 3-day and 7-day windows", () => {
  it("computes distinct averages for yesterday, last 3 days, and last 7 days", () => {
    const meals: FoodBalanceMealInput[] = [];
    // Days 4-7 ago: high protein. Days 1-3 ago: low protein.
    for (let d = 7; d >= 4; d--) meals.push(meal(d, "lunch", { proteinG: 40 }), meal(d, "dinner", { proteinG: 40 }));
    for (let d = 3; d >= 1; d--) meals.push(meal(d, "lunch", { proteinG: 10 }), meal(d, "dinner", { proteinG: 10 }));

    const trend = buildNutritionTrendSummary(meals, TZ, TODAY);
    expect(trend.last3d.avgProteinGPerDay).toBeCloseTo(20, 0);
    expect(trend.last7d.avgProteinGPerDay).toBeGreaterThan(trend.last3d.avgProteinGPerDay!);
    expect(trend.yesterday.avgProteinGPerDay).toBeCloseTo(20, 0);
  });
});

describe("generateRecommendationCandidates — low protein", () => {
  it("flags persistent low protein against the profile's target with high confidence when logging is complete", () => {
    const meals: FoodBalanceMealInput[] = [];
    for (let d = 7; d >= 1; d--) {
      meals.push(meal(d, "breakfast", { proteinG: 5, calories: 400 }), meal(d, "lunch", { proteinG: 5, calories: 400 }), meal(d, "dinner", { proteinG: 5, calories: 400 }));
    }
    const candidates = generateRecommendationCandidates({
      meals,
      timezone: TZ,
      todayLocalDate: TODAY,
      dietaryProfile: DEFAULT_DIETARY_PROFILE,
      profile: proteinAdequateProfile(["gain_muscle"]),
      goal: "gain_muscle",
    });
    const proteinRec = candidates.find((c) => c.category === "protein_low");
    expect(proteinRec).toBeDefined();
    expect(proteinRec!.confidence).toBe("high");
    expect(proteinRec!.message).toMatch(/protein/i);
  });

  it("bumps protein_low to the goal-related tier for gain_muscle", () => {
    const meals: FoodBalanceMealInput[] = [];
    for (let d = 7; d >= 1; d--) meals.push(meal(d, "breakfast", { proteinG: 5 }), meal(d, "lunch", { proteinG: 5 }), meal(d, "dinner", { proteinG: 5 }));
    const candidates = generateRecommendationCandidates({
      meals,
      timezone: TZ,
      todayLocalDate: TODAY,
      dietaryProfile: DEFAULT_DIETARY_PROFILE,
      profile: proteinAdequateProfile(["gain_muscle"]),
      goal: "gain_muscle",
    });
    const proteinRec = candidates.find((c) => c.category === "protein_low");
    expect(proteinRec!.tier).toBe(2);
  });
});

describe("generateRecommendationCandidates — low calorie", () => {
  it("flags persistent low calories when logging is complete", () => {
    const meals: FoodBalanceMealInput[] = [];
    for (let d = 7; d >= 1; d--) {
      meals.push(meal(d, "breakfast", { calories: 150 }), meal(d, "lunch", { calories: 150 }), meal(d, "dinner", { calories: 150 }));
    }
    const candidates = generateRecommendationCandidates({
      meals,
      timezone: TZ,
      todayLocalDate: TODAY,
      dietaryProfile: DEFAULT_DIETARY_PROFILE,
      profile: proteinAdequateProfile(["maintain_weight"]),
      goal: "maintain_weight",
    });
    expect(candidates.some((c) => c.category === "calories_low")).toBe(true);
  });

  it("never generates a calorie-based recommendation when logging is too incomplete to support it", () => {
    // Only 1-2 meals logged across the whole week — insufficient_data must
    // win outright regardless of how those few meals look.
    const meals = [meal(1, "lunch", { calories: 100 }), meal(3, "lunch", { calories: 100 })];
    const candidates = generateRecommendationCandidates({
      meals,
      timezone: TZ,
      todayLocalDate: TODAY,
      dietaryProfile: DEFAULT_DIETARY_PROFILE,
      profile: proteinAdequateProfile(),
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].category).toBe("insufficient_data");
  });
});

describe("generateRecommendationCandidates — high-calorie day", () => {
  it("frames a single unusually high day without compensatory language", () => {
    const meals: FoodBalanceMealInput[] = [];
    // Baseline days sit right at this profile's ~2190 kcal target.
    for (let d = 7; d >= 2; d--) meals.push(meal(d, "breakfast", { calories: 700 }), meal(d, "lunch", { calories: 800 }), meal(d, "dinner", { calories: 700 }));
    // Yesterday: a big spike (~4100 kcal), well above the recent average.
    meals.push(meal(1, "breakfast", { calories: 1300 }), meal(1, "lunch", { calories: 1500 }), meal(1, "dinner", { calories: 1300 }));

    const candidates = generateRecommendationCandidates({
      meals,
      timezone: TZ,
      todayLocalDate: TODAY,
      dietaryProfile: DEFAULT_DIETARY_PROFILE,
      profile: proteinAdequateProfile(),
    });
    const highCal = candidates.find((c) => c.category === "calories_high");
    expect(highCal).toBeDefined();
    expect(violatesSafetyRules(highCal!.message)).toBe(false);
    expect(highCal!.message).not.toMatch(/compensate|burn off|make up for|eat less today/i);
    expect(highCal!.message).toMatch(/one day does not require correction/i);
  });
});

describe("generateRecommendationCandidates — goal-specific behaviour", () => {
  function lightMealsWeek(): FoodBalanceMealInput[] {
    const meals: FoodBalanceMealInput[] = [];
    for (let d = 7; d >= 1; d--) {
      meals.push(meal(d, "breakfast", { calories: 150, proteinG: 5 }), meal(d, "lunch", { calories: 150, proteinG: 5 }), meal(d, "dinner", { calories: 50, proteinG: 2 }));
    }
    return meals;
  }

  it("healthy_aging: recommends regular, adequately sized meals with protein/energy framing", () => {
    const candidates = generateRecommendationCandidates({
      meals: lightMealsWeek(),
      timezone: TZ,
      todayLocalDate: TODAY,
      dietaryProfile: DEFAULT_DIETARY_PROFILE,
      profile: proteinAdequateProfile(["healthy_aging"]),
      goal: "healthy_aging",
    });
    const tooLight = candidates.find((c) => c.category === "meals_too_light");
    expect(tooLight).toBeDefined();
    expect(tooLight!.message).toMatch(/healthy aging/i);
  });

  it("gain_muscle: prioritizes protein distribution across meals", () => {
    const meals: FoodBalanceMealInput[] = [];
    for (let d = 7; d >= 1; d--) {
      meals.push(meal(d, "breakfast", { proteinG: 5 }), meal(d, "lunch", { proteinG: 5 }), meal(d, "dinner", { proteinG: 60 }), meal(d, "snack", { proteinG: 20 }));
    }
    const candidates = generateRecommendationCandidates({
      meals,
      timezone: TZ,
      todayLocalDate: TODAY,
      dietaryProfile: DEFAULT_DIETARY_PROFILE,
      profile: proteinAdequateProfile(["gain_muscle"]),
      goal: "gain_muscle",
    });
    const lateProtein = candidates.find((c) => c.category === "protein_late_day");
    expect(lateProtein).toBeDefined();
    expect(lateProtein!.tier).toBeLessThanOrEqual(5);
  });

  it("reduce_body_fat / reduce_weight: prioritizes fiber and fruit/veg over aggressive restriction language", () => {
    const meals: FoodBalanceMealInput[] = [];
    for (let d = 7; d >= 1; d--) {
      meals.push(
        meal(d, "breakfast", { fibreG: 1, fruitServings: 0, vegetableServings: 0 }),
        meal(d, "lunch", { fibreG: 1, fruitServings: 0, vegetableServings: 0 }),
        meal(d, "dinner", { fibreG: 1, fruitServings: 0, vegetableServings: 0 })
      );
    }
    const candidates = generateRecommendationCandidates({
      meals,
      timezone: TZ,
      todayLocalDate: TODAY,
      dietaryProfile: DEFAULT_DIETARY_PROFILE,
      profile: proteinAdequateProfile(["reduce_body_fat"]),
      goal: "reduce_body_fat",
    });
    expect(candidates.some((c) => c.category === "low_fiber" || c.category === "low_fruit_veg")).toBe(true);
    for (const c of candidates) {
      expect(c.message).not.toMatch(/restrict|cut out|deprive|starve/i);
    }
  });
});

describe("generateRecommendationCandidates — dietary restriction filtering", () => {
  it("never suggests animal products to a vegan profile even when protein is genuinely low", () => {
    const meals: FoodBalanceMealInput[] = [];
    for (let d = 7; d >= 1; d--) meals.push(meal(d, "breakfast", { proteinG: 5 }), meal(d, "lunch", { proteinG: 5 }), meal(d, "dinner", { proteinG: 5 }));
    const veganProfile = applyExplicitPreferences(DEFAULT_DIETARY_PROFILE, { isVegan: true });
    const candidates = generateRecommendationCandidates({
      meals,
      timezone: TZ,
      todayLocalDate: TODAY,
      dietaryProfile: veganProfile,
      profile: proteinAdequateProfile(),
    });
    const proteinRec = candidates.find((c) => c.category === "protein_low");
    expect(proteinRec!.message).not.toMatch(/egg|chicken|fish|paneer|yogurt|dairy/i);
  });
});

describe("rankRecommendationCandidates", () => {
  function candidate(overrides: Partial<TodaysFocusCandidate>): TodaysFocusCandidate {
    return {
      category: "low_fiber",
      tier: 4,
      confidence: "moderate",
      persistenceDays: 2,
      messageVariant: "x",
      message: "x",
      suggestedFoodIds: [],
      supportingMetrics: {},
      ...overrides,
    };
  }

  it("sorts a lower tier number ahead of a higher one regardless of persistence", () => {
    const goalGap = candidate({ category: "protein_low", tier: 2, persistenceDays: 1 });
    const optimization = candidate({ category: "positive_reinforcement", tier: 7, persistenceDays: 7 });
    const ranked = rankRecommendationCandidates([optimization, goalGap]);
    expect(ranked[0]).toBe(goalGap);
  });

  it("within the same tier, prefers more persistent days, then higher confidence", () => {
    const a = candidate({ category: "low_fiber", tier: 4, persistenceDays: 2, confidence: "high" });
    const b = candidate({ category: "low_fruit_veg", tier: 4, persistenceDays: 4, confidence: "moderate" });
    const ranked = rankRecommendationCandidates([a, b]);
    expect(ranked[0]).toBe(b); // more persistent days wins over higher confidence
  });
});

describe("applyRepetitionAndFeedbackRules", () => {
  function candidate(overrides: Partial<TodaysFocusCandidate>): TodaysFocusCandidate {
    return {
      category: "low_fiber",
      tier: 4,
      confidence: "moderate",
      persistenceDays: 2,
      messageVariant: "x",
      message: "x",
      suggestedFoodIds: [],
      supportingMetrics: {},
      ...overrides,
    };
  }

  it("drops a category shown yesterday when it isn't both high-confidence and persistent", () => {
    const yesterday = "2026-07-23";
    const shownYesterday: RecentFocusHistoryEntry = { localDate: yesterday, category: "low_fiber" };
    const candidates = [candidate({ category: "low_fiber", confidence: "moderate", persistenceDays: 2 }), candidate({ category: "low_fruit_veg" })];
    const result = applyRepetitionAndFeedbackRules(candidates, [shownYesterday], yesterday);
    expect(result.some((c) => c.category === "low_fiber")).toBe(false);
    expect(result.some((c) => c.category === "low_fruit_veg")).toBe(true);
  });

  it("allows an important, persistent issue to repeat on consecutive days", () => {
    const yesterday = "2026-07-23";
    const shownYesterday: RecentFocusHistoryEntry = { localDate: yesterday, category: "protein_low" };
    const candidates = [candidate({ category: "protein_low", confidence: "high", persistenceDays: 5 })];
    const result = applyRepetitionAndFeedbackRules(candidates, [shownYesterday], yesterday);
    expect(result.some((c) => c.category === "protein_low")).toBe(true);
  });

  it("deprioritizes (but does not remove) a category the user marked not relevant", () => {
    const history: RecentFocusHistoryEntry[] = [{ localDate: "2026-07-20", category: "low_fiber", feedback: "not_relevant" }];
    const candidates = [candidate({ category: "low_fiber" }), candidate({ category: "low_fruit_veg" })];
    const result = applyRepetitionAndFeedbackRules(candidates, history, "2026-07-23");
    expect(result[0].category).toBe("low_fruit_veg");
  });

  it("falls back to a neutral logging reminder when every candidate is filtered out by repetition", () => {
    const yesterday = "2026-07-23";
    const shownYesterday: RecentFocusHistoryEntry = { localDate: yesterday, category: "low_fiber" };
    const candidates = [candidate({ category: "low_fiber", confidence: "low", persistenceDays: 1 })];
    const result = applyRepetitionAndFeedbackRules(candidates, [shownYesterday], yesterday);
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("insufficient_data");
  });

  it("selecting an alternative excludes the just-rejected category (change focus)", () => {
    const candidates = [candidate({ category: "low_fiber", tier: 4, persistenceDays: 3 }), candidate({ category: "low_fruit_veg", tier: 4, persistenceDays: 2 })];
    const ranked = rankRecommendationCandidates(candidates).filter((c) => c.category !== "low_fiber");
    const result = applyRepetitionAndFeedbackRules(ranked, [], "2026-07-23");
    expect(result[0].category).toBe("low_fruit_veg");
  });
});

describe("positive reinforcement and no-data cases", () => {
  it("sends positive reinforcement when logging is complete and nothing else is eligible", () => {
    const meals: FoodBalanceMealInput[] = [];
    const wholeFoodsByDay = [
      ["dal", "rice", "spinach"],
      ["chicken", "quinoa", "broccoli"],
      ["tofu", "oats", "berries"],
      ["eggs", "sweet_potato", "kale"],
      ["fish", "brown_rice", "carrots"],
      ["paneer", "chapati", "beans"],
      ["lentils", "millet", "peas"],
    ];
    for (let d = 7; d >= 1; d--) {
      const foods = wholeFoodsByDay[7 - d];
      meals.push(
        meal(d, "breakfast", { proteinG: 35, calories: 700, fibreG: 13, fruitServings: 0.5, vegetableServings: 0.5, wholeFoods: [foods[0]] }),
        meal(d, "lunch", { proteinG: 35, calories: 750, fibreG: 13, fruitServings: 0.5, vegetableServings: 0.5, wholeFoods: [foods[1]] }),
        meal(d, "dinner", { proteinG: 35, calories: 750, fibreG: 13, fruitServings: 0.5, vegetableServings: 0.5, wholeFoods: [foods[2]] })
      );
    }
    const candidates = generateRecommendationCandidates({
      meals,
      timezone: TZ,
      todayLocalDate: TODAY,
      dietaryProfile: DEFAULT_DIETARY_PROFILE,
      profile: proteinAdequateProfile(),
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].category).toBe("positive_reinforcement");
  });

  it("a brand-new user with zero logs gets the insufficient-data message, never a claim", () => {
    const candidates = generateRecommendationCandidates({
      meals: [],
      timezone: TZ,
      todayLocalDate: TODAY,
      dietaryProfile: DEFAULT_DIETARY_PROFILE,
      profile: undefined,
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].category).toBe("insufficient_data");
    expect(candidates[0].message).not.toMatch(/low|below|deficient/i);
  });

  it("a user without a selected goal still gets sensible (non-goal-specific) recommendations, no crash", () => {
    const meals: FoodBalanceMealInput[] = [];
    for (let d = 7; d >= 1; d--) meals.push(meal(d, "breakfast", { proteinG: 5 }), meal(d, "lunch", { proteinG: 5 }), meal(d, "dinner", { proteinG: 5 }));
    expect(() =>
      generateRecommendationCandidates({
        meals,
        timezone: TZ,
        todayLocalDate: TODAY,
        dietaryProfile: DEFAULT_DIETARY_PROFILE,
        profile: undefined,
        goal: undefined,
      })
    ).not.toThrow();
  });
});

describe("renderTodayFocusMessage", () => {
  const candidate: TodaysFocusCandidate = {
    category: "protein_low",
    tier: 2,
    confidence: "high",
    persistenceDays: 4,
    messageVariant: "protein_low_direct",
    message: "Protein has been below your target on several recent days.",
    suggestedFoodIds: [],
    supportingMetrics: {},
  };

  it("concise style is just the bolded label plus the message", () => {
    const rendered = renderTodayFocusMessage(candidate, "concise");
    expect(rendered).toBe("*Today's focus:* Protein has been below your target on several recent days.");
  });

  it("explanatory style adds a short why-clause", () => {
    const rendered = renderTodayFocusMessage(candidate, "explanatory");
    expect(rendered.length).toBeGreaterThan(renderTodayFocusMessage(candidate, "concise").length);
    expect(rendered).toMatch(/filling/i);
  });

  it("never violates safety rules regardless of style", () => {
    expect(violatesSafetyRules(renderTodayFocusMessage(candidate, "concise"))).toBe(false);
    expect(violatesSafetyRules(renderTodayFocusMessage(candidate, "explanatory"))).toBe(false);
  });
});

describe("timezone handling", () => {
  it("buckets a meal into the correct local calendar date across a timezone offset", () => {
    // 2026-07-24T01:00:00Z is still 2026-07-23 local in America/New_York (-4 in summer).
    const meals: FoodBalanceMealInput[] = [{ id: "1", loggedAt: "2026-07-24T01:00:00Z", mealType: "dinner", calories: 500 }];
    const buckets = bucketMealsByLocalDate(meals, "America/New_York");
    expect(buckets.has("2026-07-23")).toBe(true);
    expect(buckets.has("2026-07-24")).toBe(false);
  });

  it("recentLocalDates never includes today's own date", () => {
    const dates = recentLocalDates(TODAY, 7);
    expect(dates).toHaveLength(7);
    expect(dates).not.toContain(TODAY);
    expect(dates[dates.length - 1]).toBe("2026-07-23");
  });
});
