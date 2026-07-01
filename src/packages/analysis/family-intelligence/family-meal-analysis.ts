import type { ConfirmedMeal, FamilyMealInsight } from "@/types";

const PROTEIN_RICH_GROUPS = ["Meat", "Dairy", "Egg", "Legumes", "Fish"];
const FRUIT_GROUPS = ["Fruit"];
const VEGETABLE_GROUPS = ["Vegetables"];

export async function analyseFamilyMeal(
  meal: ConfirmedMeal,
  recentMeals: ConfirmedMeal[] // last 28 days for baseline context
): Promise<FamilyMealInsight> {
  const proteinSourceDetected =
    meal.foods.some((f) =>
      PROTEIN_RICH_GROUPS.some((g) => meal.foodGroups.includes(g))
    ) ||
    meal.foods.some((f) => (f.proteinGramsEstimated ?? 0) >= 8);

  const fruitDetected = meal.foodGroups.some((g) => FRUIT_GROUPS.includes(g));
  const vegetableDetected = meal.foodGroups.some((g) => VEGETABLE_GROUPS.includes(g));

  const quantitySignal: "usual" | "possibly_lower" | "unknown" =
    meal.amountEaten === "little" || meal.amountEaten === "half"
      ? "possibly_lower"
      : meal.amountEaten === "most" || meal.amountEaten === "all"
      ? "usual"
      : "unknown";

  const appetiteSignal: "normal" | "low" | "unknown" =
    meal.appetiteRating !== undefined
      ? meal.appetiteRating <= 2
        ? "low"
        : "normal"
      : "unknown";

  const hydrationSignal: "recorded" | "not_recorded" | "unknown" =
    meal.hydrationRecorded === true
      ? "recorded"
      : meal.hydrationRecorded === false
      ? "not_recorded"
      : "unknown";

  // Simple baseline check — compare current meal quantity signal to recent pattern
  const recentQuantitySignals = recentMeals
    .map((m) =>
      m.amountEaten === "little" || m.amountEaten === "half"
        ? "possibly_lower"
        : m.amountEaten === "most" || m.amountEaten === "all"
        ? "usual"
        : "unknown"
    )
    .filter((s) => s !== "unknown");

  const recentLowerCount = recentQuantitySignals.filter((s) => s === "possibly_lower").length;
  const recentTotal = recentQuantitySignals.length;
  const baselineLowerRate = recentTotal > 0 ? recentLowerCount / recentTotal : 0;

  const baselineChangeDetected =
    quantitySignal === "possibly_lower" && baselineLowerRate < 0.3 && recentTotal >= 5;

  // Family alert candidate — only on sustained patterns, never single meal
  // Single meal never triggers an alert
  const familyAlertCandidate = false;

  return {
    mealId: meal.id,
    supportedPersonId: meal.mealLoggerId,
    mealRegularityContribution: meal.mealType ?? "unspecified",
    proteinSourceDetected,
    fruitDetected,
    vegetableDetected,
    foodVarietyContribution: `${meal.foods.length} item${meal.foods.length !== 1 ? "s" : ""}`,
    quantitySignal,
    appetiteSignal,
    hydrationSignal,
    baselineChange: {
      detected: baselineChangeDetected,
      description: baselineChangeDetected
        ? "Portion appears smaller than usual for this person."
        : undefined,
      confidence: baselineChangeDetected ? "low" : undefined,
    },
    familyAlertCandidate,
    familyAlertReason: undefined,
  };
}
