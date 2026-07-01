import type {
  ConfirmedMeal,
  FamilyMealInsight,
  FamilyWeeklySummary,
  FamilyWeeklyStatus,
  FamilyIndicator,
  FamilyIndicatorStatus,
} from "@/types";

export async function generateFamilyWeeklySummary(
  workspaceId: string,
  supportedPersonId: string,
  weekStarting: Date,
  meals: ConfirmedMeal[],
  insights: FamilyMealInsight[]
): Promise<FamilyWeeklySummary> {
  const expectedMeals = 14; // 2 shared per day as a soft target
  const mealsShared = meals.length;
  const dataCompleteness = Math.min(mealsShared / expectedMeals, 1);

  const proteinMeals = insights.filter((i) => i.proteinSourceDetected).length;
  const fruitMeals = insights.filter((i) => i.fruitDetected).length;
  const vegMeals = insights.filter((i) => i.vegetableDetected).length;

  const daysWithMeals = new Set(
    meals.map((m) => new Date(m.loggedAt).toDateString())
  ).size;

  const lowAppetiteCount = insights.filter((i) => i.appetiteSignal === "low").length;
  const possiblyLowerCount = insights.filter((i) => i.quantitySignal === "possibly_lower").length;
  const hydrationRecorded = insights.filter((i) => i.hydrationSignal === "recorded").length;

  // Build indicators
  const mealRegularity = buildIndicator(
    daysWithMeals >= 5 ? "positive" : daysWithMeals >= 3 ? "stable" : "worth_watching",
    daysWithMeals >= 5 ? "Going well" : daysWithMeals >= 3 ? "Most days" : "Worth watching",
    `Meals shared on ${daysWithMeals} out of 7 days.`,
    dataCompleteness
  );

  const proteinFrequency = buildIndicator(
    proteinMeals >= mealsShared * 0.6 ? "positive" : proteinMeals >= mealsShared * 0.35 ? "stable" : "worth_watching",
    proteinMeals >= mealsShared * 0.6 ? "Good variety" : "Could improve",
    `Protein-rich food detected in ${proteinMeals} of ${mealsShared} shared meals.`,
    dataCompleteness
  );

  const foodVariety = buildIndicator(
    "stable",
    "Varied meals",
    `${new Set(meals.flatMap((m) => m.foodGroups)).size} different food groups this week.`,
    dataCompleteness
  );

  const fruitAndVegetables = buildIndicator(
    fruitMeals + vegMeals >= mealsShared * 0.5 ? "positive" : "worth_watching",
    fruitMeals + vegMeals >= mealsShared * 0.5 ? "Going well" : "Could add more",
    `Fruit or vegetables in ${fruitMeals + vegMeals} of ${mealsShared} shared meals.`,
    dataCompleteness
  );

  const hydration = buildIndicator(
    hydrationRecorded >= 4 ? "positive" : "unknown",
    hydrationRecorded >= 4 ? "Recorded regularly" : "Not enough information",
    `Hydration recorded ${hydrationRecorded} times this week.`,
    dataCompleteness
  );

  const appetite = buildIndicator(
    lowAppetiteCount === 0
      ? "positive"
      : lowAppetiteCount <= 2
      ? "stable"
      : "worth_watching",
    lowAppetiteCount === 0 ? "Appetite normal" : lowAppetiteCount <= 2 ? "Mostly normal" : "Worth watching",
    lowAppetiteCount > 0 ? `Low appetite noted on ${lowAppetiteCount} occasion${lowAppetiteCount > 1 ? "s" : ""}.` : "Appetite appears normal this week.",
    dataCompleteness
  );

  const mealQuantity = buildIndicator(
    possiblyLowerCount <= 2 ? "stable" : "worth_watching",
    possiblyLowerCount <= 2 ? "Usual amounts" : "Worth checking",
    possiblyLowerCount > 2 ? `Portions appeared smaller on ${possiblyLowerCount} occasions.` : undefined,
    dataCompleteness
  );

  // Overall status
  const weeklyStatus: FamilyWeeklyStatus =
    dataCompleteness < 0.3
      ? "insufficient_data"
      : [mealRegularity, proteinFrequency, appetite, mealQuantity].every(
          (i) => i.status === "positive" || i.status === "stable"
        )
      ? "going_well"
      : [mealRegularity, proteinFrequency, appetite, mealQuantity].some(
          (i) => i.status === "needs_attention"
        )
      ? "needs_attention"
      : [mealRegularity, proteinFrequency, appetite, mealQuantity].filter(
          (i) => i.status === "worth_watching"
        ).length >= 2
      ? "worth_watching"
      : "going_well";

  const summaryText = buildSummaryText(weeklyStatus, daysWithMeals, dataCompleteness);

  const suggestedAction =
    weeklyStatus === "worth_watching"
      ? "A gentle check-in this week could be a nice way to stay connected."
      : weeklyStatus === "needs_attention"
      ? "It may be worth a phone call this week to check in."
      : undefined;

  return {
    workspaceId,
    supportedPersonId,
    weekStarting,
    weeklyStatus,
    summaryText,
    indicators: {
      mealRegularity,
      proteinFrequency,
      foodVariety,
      fruitAndVegetables,
      hydration,
      appetite,
      mealQuantity,
    },
    mealsShared,
    dataCompleteness,
    suggestedAction,
    generatedAt: new Date(),
  };
}

function buildIndicator(
  status: FamilyIndicatorStatus,
  label: string,
  detail?: string,
  dataCompleteness = 1
): FamilyIndicator {
  const effectiveStatus: FamilyIndicatorStatus =
    dataCompleteness < 0.3 ? "unknown" : status;
  return {
    status: effectiveStatus,
    label: dataCompleteness < 0.3 ? "Not enough information" : label,
    detail,
    dataCompleteness,
  };
}

function buildSummaryText(
  status: FamilyWeeklyStatus,
  daysWithMeals: number,
  dataCompleteness: number
): string {
  if (dataCompleteness < 0.3) {
    return "There isn't enough information from this week to share a full picture. Encouraging them to share a few more meals next week will help.";
  }
  switch (status) {
    case "going_well":
      return `Meals were shared on ${daysWithMeals} days this week and everything looks to be going well.`;
    case "improving":
      return "Things seem to be improving compared to the previous week — a positive trend overall.";
    case "worth_watching":
      return "Most things look fine, but there are one or two patterns worth gently keeping an eye on.";
    case "needs_attention":
      return "Some things this week may be worth a gentle check-in. Nothing alarming, but a short call could be reassuring.";
    case "insufficient_data":
      return "Not enough meals were shared this week to draw clear conclusions.";
  }
}
