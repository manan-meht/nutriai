import { SHARE_CARD_CONCEPTS } from "@/lib/share-cards/concepts";
import { evaluateTrigger, getEarnedCards, type ShareCardMealInput } from "@/lib/share-cards/triggers";

function meal(overrides: Partial<ShareCardMealInput> & { loggedAt: string }): ShareCardMealInput {
  return {
    totalProteinMin: 0,
    totalProteinMax: 0,
    totalFiberMin: 0,
    totalFiberMax: 0,
    ...overrides,
  };
}

function daysAgoIso(days: number, hour = 12): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

describe("evaluateTrigger", () => {
  it("triggers the daily protein card when today's meals meet the protein target", () => {
    const meals = [
      meal({ loggedAt: daysAgoIso(0, 9), totalProteinMin: 30, totalProteinMax: 34 }),
      meal({ loggedAt: daysAgoIso(0, 19), totalProteinMin: 30, totalProteinMax: 34 }),
    ];
    const result = evaluateTrigger("protein_goal_hit_today", { meals, dailyProteinTargetG: 60 });
    expect(result.earned).toBe(true);
  });

  it("does not trigger the daily protein card when under target", () => {
    const meals = [meal({ loggedAt: daysAgoIso(0), totalProteinMin: 10, totalProteinMax: 14 })];
    const result = evaluateTrigger("protein_goal_hit_today", { meals, dailyProteinTargetG: 60 });
    expect(result.earned).toBe(false);
  });

  it("only triggers the balanced-week card when enough meals were logged", () => {
    const meals: ShareCardMealInput[] = [];
    const notEnoughDays = evaluateTrigger("balanced_meals_all_week", {
      meals,
      componentScores: { macroAndFibreBalance: 90 },
      distinctLoggingDaysThisWeek: 2,
    });
    expect(notEnoughDays.earned).toBe(false);

    const enough = evaluateTrigger("balanced_meals_all_week", {
      meals,
      componentScores: { macroAndFibreBalance: 90 },
      distinctLoggingDaysThisWeek: 6,
    });
    expect(enough.earned).toBe(true);
  });

  it("triggers the 7-day streak card only at 7 distinct logging days", () => {
    const meals: ShareCardMealInput[] = [];
    expect(evaluateTrigger("seven_day_logging_streak", { meals, distinctLoggingDaysThisWeek: 6 }).earned).toBe(false);
    const result = evaluateTrigger("seven_day_logging_streak", { meals, distinctLoggingDaysThisWeek: 7 });
    expect(result.earned).toBe(true);
    expect(result.stat).toBe("7-day streak");
  });

  it("improvement cards require previous-period data and don't earn without it", () => {
    const meals: ShareCardMealInput[] = [];
    const withoutPrevious = evaluateTrigger("more_balanced_than_last_week", {
      meals,
      componentScores: { macroAndFibreBalance: 90 },
    });
    expect(withoutPrevious.earned).toBe(false);

    const withPrevious = evaluateTrigger("more_balanced_than_last_week", {
      meals,
      componentScores: { macroAndFibreBalance: 90 },
      previousWeekComponentScores: { macroAndFibreBalance: 70 },
    });
    expect(withPrevious.earned).toBe(true);
  });

  it("triggers the comeback card after a 7+ day gap followed by renewed logging", () => {
    const meals = [
      meal({ loggedAt: daysAgoIso(20) }),
      meal({ loggedAt: daysAgoIso(19) }),
      meal({ loggedAt: daysAgoIso(1) }),
      meal({ loggedAt: daysAgoIso(0) }),
    ];
    expect(evaluateTrigger("comeback_week", { meals }).earned).toBe(true);
  });

  it("does not trigger the comeback card for continuous logging with no gap", () => {
    const meals = [meal({ loggedAt: daysAgoIso(2) }), meal({ loggedAt: daysAgoIso(1) }), meal({ loggedAt: daysAgoIso(0) })];
    expect(evaluateTrigger("comeback_week", { meals }).earned).toBe(false);
  });

  it("does not exaggerate achievements for a low-data user (no meals today, no component scores)", () => {
    const meals: ShareCardMealInput[] = [];
    const earned = getEarnedCards(SHARE_CARD_CONCEPTS, { meals, distinctLoggingDaysThisWeek: 0 });
    expect(earned).toHaveLength(0);
  });

  it("TODO-only triggers (no data source yet) never earn", () => {
    const meals: ShareCardMealInput[] = [];
    expect(evaluateTrigger("better_snack_choice", { meals }).earned).toBe(false);
    expect(evaluateTrigger("meal_correction_hero", { meals }).earned).toBe(false);
    expect(evaluateTrigger("better_breakfast_balance", { meals }).earned).toBe(false);
    expect(evaluateTrigger("better_dinner_balance", { meals }).earned).toBe(false);
  });

  it("multi-week badges require weeksOfHistory and don't earn without it", () => {
    const meals: ShareCardMealInput[] = [];
    expect(evaluateTrigger("best_week_so_far", { meals }).earned).toBe(false);
    expect(evaluateTrigger("protein_loyalist", { meals }).earned).toBe(false);
    expect(evaluateTrigger("balanced_plate_enthusiast", { meals }).earned).toBe(false);

    const withHistory = evaluateTrigger("protein_loyalist", {
      meals,
      weeksOfHistory: [
        { weekStartIso: daysAgoIso(21), distinctLoggingDays: 7, proteinAdequacy: 80 },
        { weekStartIso: daysAgoIso(14), distinctLoggingDays: 7, proteinAdequacy: 85 },
        { weekStartIso: daysAgoIso(7), distinctLoggingDays: 7, proteinAdequacy: 90 },
      ],
    });
    expect(withHistory.earned).toBe(true);
  });
});

describe("getEarnedCards", () => {
  it("never surfaces exact calories or body weight in rendered card copy", () => {
    const meals = [
      meal({ loggedAt: daysAgoIso(0), totalProteinMin: 60, totalProteinMax: 70, totalFiberMin: 30, totalFiberMax: 35 }),
    ];
    const earned = getEarnedCards(SHARE_CARD_CONCEPTS, {
      meals,
      dailyProteinTargetG: 60,
      dailyFiberTargetG: 25,
      distinctLoggingDaysThisWeek: 7,
      componentScores: {
        macroAndFibreBalance: 90,
        fruitAndVegetableIntake: 90,
        homePreparedMealShare: 90,
        proteinAdequacy: 90,
        fibreAdequacy: 90,
        goalAlignmentScore: 90,
      },
    });
    expect(earned.length).toBeGreaterThan(0);
    for (const card of earned) {
      expect(card.headline).not.toMatch(/\bcalories?\b/i);
      expect(card.supportingText).not.toMatch(/\bcalories?\b/i);
      expect(card.headline).not.toMatch(/\bkg\b/i);
      expect(card.supportingText).not.toMatch(/\bkg\b/i);
    }
  });

  it("falls back to the low-confidence copy when a trigger flags low confidence", () => {
    const meals = [meal({ loggedAt: daysAgoIso(0), totalProteinMin: 60, totalProteinMax: 70 })];
    const earned = getEarnedCards(SHARE_CARD_CONCEPTS, { meals }); // no explicit dailyProteinTargetG → low confidence
    const proteinCard = earned.find((c) => c.concept.triggerKey === "protein_goal_hit_today");
    expect(proteinCard?.isLowConfidence).toBe(true);
    expect(proteinCard?.supportingText).toBe(proteinCard?.concept.lowConfidenceFallback);
  });
});
