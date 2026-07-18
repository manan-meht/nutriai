import type { DietaryProfile } from "@/lib/dietary-profile";
import type { FoodBalanceRecommendation } from "@nutriai/health-scoring";
import { pickFoodExamples } from "./personalize";
import type { FoodSuggestionCategory } from "./food-library";
import { isRecommendationSafe } from "./safety";

function pickExamplesWithIds(
  category: FoodSuggestionCategory,
  profile: DietaryProfile,
  opts: { meal?: "breakfast" | "lunch" | "dinner" | "snack"; goal?: string; count?: number }
): { labels: string[]; ids: string[] } {
  const picked = pickFoodExamples(category, profile, opts);
  if (picked.length > 0) return { labels: picked.map((f) => f.label), ids: picked.map((f) => f.id) };
  return { labels: ["a protein food that fits your preferences, such as dal, tofu, eggs, yogurt, paneer, fish, or chicken"], ids: [] };
}

/** Lightweight meal-pattern signal for contexts that don't have (or need)
 * the full Food Balance Score's component-score pipeline — e.g. a
 * WhatsApp weekly report, which works off a simple week-over-week
 * summary (see src/lib/insights.ts), not per-meal diversity/processing-
 * level classification. The dashboard Food Balance Score card instead
 * uses personalizeFoodBalanceRecommendations (personalize.ts) directly on
 * the scoring engine's own componentScores-derived recommendations —
 * this is a separate, simpler path for everywhere else. */
export interface MealPatternSummary {
  /** Which meal (if any) has been consistently light on protein. */
  proteinLowMeal?: "breakfast" | "lunch" | "dinner" | "snack";
  carbHeavy?: boolean;
  lowFruitVeg?: boolean;
  lowFiber?: boolean;
  ultraProcessedSnacks?: boolean;
  /** Dinner consistently much lighter than other meals — the
   * "healthy_aging" example in the spec ("meals should not become too
   * light"). */
  veryLightDinner?: boolean;
}

export interface UserGoal {
  primaryNutritionGoal?: string;
}

export interface DashboardDateRange {
  start: string;
  end: string;
}

function formatExamples(labels: string[]): string {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")}, or ${labels[labels.length - 1]}`;
}

let nextId = 0;
function makeRecommendation(fields: Omit<FoodBalanceRecommendation, "id" | "priority" | "confidence"> & { id: string }): FoodBalanceRecommendation {
  nextId += 1;
  return { priority: nextId, confidence: 0.7, ...fields };
}

/** Detects food-balance gaps from a meal-pattern summary, picks safe
 * personalized food examples from the Food Profile for each, generates
 * copy from the same approved templates personalize.ts uses (never an
 * LLM free-writing final text), validates safety, and returns up to 3 —
 * matching the feature spec's generator shape. General wellness/habit
 * coaching only; this function has no awareness of medical conditions and
 * never should. */
export function generateFoodBalanceRecommendations(params: {
  profileId: string;
  foodProfile: DietaryProfile;
  mealPattern: MealPatternSummary;
  goal?: UserGoal;
  dateRange?: DashboardDateRange;
}): FoodBalanceRecommendation[] {
  const { foodProfile, mealPattern, goal } = params;
  const goalTag = goal?.primaryNutritionGoal;
  const candidates: FoodBalanceRecommendation[] = [];

  if (mealPattern.proteinLowMeal) {
    const meal = mealPattern.proteinLowMeal;
    const { labels: examples, ids: exampleFoodIds } = pickExamplesWithIds("protein", foodProfile, { meal, count: 5 });
    const exampleText = formatExamples(examples);
    const mealPhrase = meal === "breakfast" ? "Breakfast has been lighter on protein this week." : `${meal[0].toUpperCase()}${meal.slice(1)} has been lighter on protein this week.`;
    candidates.push(
      makeRecommendation({
        id: "protein_low",
        category: "protein",
        title: `Add protein to ${meal}`,
        description: `${mealPhrase} Try ${exampleText} at ${meal} this week.`,
        reason: `Protein intake at ${meal} has been below what's typical for this person's other meals.`,
        action: `Pick one ${meal} and add one of these: ${exampleText}.`,
        whyThisHelps: "Protein can make meals more filling and helps support your goal.",
        exampleFoodIds,
      })
    );
  }

  if (mealPattern.carbHeavy) {
    const { labels: examples, ids: exampleFoodIds } = pickExamplesWithIds("balanced_carb", foodProfile, { goal: goalTag, count: 5 });
    const exampleText = formatExamples(examples);
    candidates.push(
      makeRecommendation({
        id: "carb_heavy",
        category: "carbohydrate_support",
        title: "Balance out carb-heavy meals",
        description: `Several recent meals were mostly rice, roti, or noodles. Keep the carb, but try ${exampleText} alongside it.`,
        reason: "Recent meals show a high share of carbohydrate-heavy staples with less alongside them.",
        action: `At one meal, add one protein or vegetable before taking more rice or roti.`,
        whyThisHelps: "Pairing carbs with protein and vegetables can help meals feel more complete and satisfying.",
        exampleFoodIds,
      })
    );
  }

  if (mealPattern.lowFruitVeg) {
    const { labels: examples, ids: exampleFoodIds } = pickExamplesWithIds("fruit_veg", foodProfile, { goal: goalTag, count: 5 });
    const exampleText = formatExamples(examples);
    candidates.push(
      makeRecommendation({
        id: "low_fruit_veg",
        category: "vegetables",
        title: "Add more color",
        description: `Vegetables and fruit were on the lighter side in your logged meals. Try adding ${exampleText} to one meal.`,
        reason: "Recent meals show fewer fruit and vegetable servings than usual.",
        action: "Add one fruit or vegetable-rich side tomorrow.",
        whyThisHelps: "Fruit and vegetables add fibre and variety without changing the rest of your plate.",
        exampleFoodIds,
      })
    );
  }

  if (mealPattern.lowFiber) {
    const { labels: examples, ids: exampleFoodIds } = pickExamplesWithIds("fiber", foodProfile, { goal: goalTag, count: 5 });
    const exampleText = formatExamples(examples);
    candidates.push(
      makeRecommendation({
        id: "low_fiber",
        category: "fibre",
        title: "Add one fibre-rich food",
        description: `Fibre-rich foods were on the lighter side this week. Try ${exampleText} that fits your usual meals.`,
        reason: "Recent meals show less fibre than typical.",
        action: "Pick one meal and add one fibre-rich food.",
        whyThisHelps: "Fibre supports digestion and can make meals feel more satisfying.",
        exampleFoodIds,
      })
    );
  }

  if (mealPattern.ultraProcessedSnacks) {
    const { labels: examples, ids: exampleFoodIds } = pickExamplesWithIds("snack_swap", foodProfile, { meal: "snack", count: 5 });
    const exampleText = formatExamples(examples);
    candidates.push(
      makeRecommendation({
        id: "ultra_processed_snacks",
        category: "processing",
        title: "Try a less processed snack",
        description: `A few recent snacks were more processed. Swap one packaged snack for ${exampleText} this week.`,
        reason: "A portion of recent snacks were estimated as more processed.",
        action: `Next time you reach for a packaged snack, try ${examples[0]} instead.`,
        whyThisHelps: "Small, minimally processed swaps add up without requiring a whole new routine.",
        exampleFoodIds,
      })
    );
  }

  if (mealPattern.veryLightDinner) {
    const { labels: examples, ids: exampleFoodIds } = pickExamplesWithIds("protein", foodProfile, { meal: "dinner", count: 5 });
    const exampleText = formatExamples(examples);
    candidates.push(
      makeRecommendation({
        id: "very_light_dinner",
        category: "protein",
        title: "Make dinner more complete",
        description: `Dinner has been noticeably lighter than your other meals. Try adding ${exampleText}, depending on what fits your usual meals, so the day doesn't become too light.`,
        reason: "Dinner has been consistently much lighter than this person's other meals.",
        action: "Add one protein plus one fibre-rich food to dinner tomorrow.",
        whyThisHelps: "A more complete dinner can help round out the day, especially for healthy aging goals.",
        exampleFoodIds,
      })
    );
  }

  // Cap at 3 (spec requirement) and drop anything that somehow fails the
  // safety check rather than ever showing it.
  return candidates.filter((rec) => isRecommendationSafe(rec)).slice(0, 3);
}
