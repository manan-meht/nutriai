import { FOOD_BALANCE_CONFIG } from "./constants";
import type { ComponentScore, FoodBalanceComponentScores, FoodBalanceRecommendation, RecommendationCategory } from "./types";

const MIN_RECOMMENDATION_CONFIDENCE = 0.4;
/** Below this remaining-headroom threshold, a component is "good enough"
 * and shouldn't generate a recommendation just to fill space. */
const MIN_COMPONENT_GAP = 20;

interface RecommendationTemplate {
  category: RecommendationCategory;
  title: string;
  description: string;
  reason: string;
  actionability: number;
}

const TEMPLATES: Record<string, RecommendationTemplate> = {
  fruitAndVegetableIntake: {
    category: "vegetables",
    title: "Add one vegetable portion to lunch or dinner.",
    description: "Including one more vegetable serving on most days could strengthen your fruit and vegetable balance.",
    reason: "Recent meals show room to grow in fruit and vegetable servings.",
    actionability: 1,
  },
  minimallyProcessedFoodBalance: {
    category: "processing",
    title: "Try one more minimally processed snack.",
    description: "Fruit, yoghurt, nuts, roasted chana, or a simple homemade snack could strengthen this part of your score.",
    reason: "A portion of recent meals were estimated as more processed.",
    actionability: 0.8,
  },
  foodDiversity: {
    category: "diversity",
    title: "Add two different plant foods this week.",
    description:
      "Trying two vegetables, fruits, beans, whole grains, nuts, or seeds that have not appeared in your recent meals could improve food variety.",
    reason: "Your recent meals repeat a similar set of foods.",
    actionability: 0.7,
  },
  homePreparedMealShare: {
    category: "home_preparation",
    title: "Try preparing one more meal at home this week.",
    description: "A simple home-prepared meal in place of a takeout or packaged one can support this part of your score.",
    reason: "Recent meals lean toward restaurant or packaged sources.",
    actionability: 0.6,
  },
  macroAndFibreBalance: {
    category: "fibre",
    title: "Add a source of fibre to one meal.",
    description: "Legumes, whole grains, or vegetables at one more meal could support your macro and fibre balance.",
    reason: "Recent meals show room to grow in fibre or macro balance.",
    actionability: 0.8,
  },
  proteinAdequacy: {
    category: "protein",
    title: "Include protein at breakfast.",
    description: "Adding eggs, yoghurt, tofu, paneer, dal, or another protein source could better support your goal.",
    reason: "Protein intake has been below the range that supports your goal.",
    actionability: 0.9,
  },
  proteinDistribution: {
    category: "protein_distribution",
    title: "Spread protein across more meals.",
    description: "Adding a protein source to a meal that's currently missing one can help distribute intake more evenly.",
    reason: "Protein has been concentrated in fewer meals than ideal.",
    actionability: 0.8,
  },
  carbohydrateSupport: {
    category: "carbohydrate_support",
    title: "Add a carbohydrate source around an active day.",
    description: "A modest serving of rice, roti, oats, or fruit alongside a workout day can help fuel training.",
    reason: "Carbohydrate intake has been below the range that supports this goal.",
    actionability: 0.7,
  },
  intakeConsistency: {
    category: "consistency",
    title: "Try keeping portions similar across the week.",
    description: "A more even day-to-day pattern (without changing every meal) can support this part of your score.",
    reason: "Recent daily totals have varied noticeably.",
    actionability: 0.5,
  },
  fibreAndMealVolume: {
    category: "fibre",
    title: "Add a fibre-rich food to one meal.",
    description: "Legumes, whole grains, or extra vegetables at one meal can support this part of your score.",
    reason: "Fibre and meal volume have room to grow.",
    actionability: 0.8,
  },
  fibreAdequacy: {
    category: "fibre",
    title: "Add a fibre-rich food to one meal.",
    description: "Legumes, whole grains, or extra vegetables at one meal can support this part of your score.",
    reason: "Fibre intake has room to grow.",
    actionability: 0.8,
  },
  energyAlignment: {
    category: "energy",
    title: "Your recent portions may be slightly above the range currently estimated for your goal.",
    description: "Try serving a little less of one energy-dense item at one regular meal rather than changing every meal.",
    reason: "Average estimated intake has drifted from your current estimated range.",
    actionability: 0.6,
  },
};

function collectComponents(componentScores: FoodBalanceComponentScores): Array<{ key: string; component: ComponentScore }> {
  const entries: Array<{ key: string; component: ComponentScore }> = [];
  for (const [key, component] of Object.entries(componentScores.foodFoundation)) {
    entries.push({ key, component });
  }
  for (const [key, component] of Object.entries(componentScores.goalAlignment)) {
    if (component) entries.push({ key, component });
  }
  return entries;
}

/** Deterministic, ranked recommendations from component scores — never from
 * an LLM. Opportunity = weight × (100 - score) × confidence × actionability. */
export function getFoodBalanceRecommendations(componentScores: FoodBalanceComponentScores): FoodBalanceRecommendation[] {
  const entries = collectComponents(componentScores);
  const energyRecommendationsSeen = new Set<string>();

  const opportunities = entries
    .filter(({ component }) => component.score != null && component.confidence >= MIN_RECOMMENDATION_CONFIDENCE)
    .filter(({ component }) => 100 - (component.score as number) >= MIN_COMPONENT_GAP)
    .map(({ key, component }) => {
      const template = TEMPLATES[key];
      if (!template) return null;
      const opportunity = component.weight * (100 - (component.score as number)) * component.confidence * template.actionability;
      return { key, template, component, opportunity };
    })
    .filter((o): o is NonNullable<typeof o> => o != null)
    .sort((a, b) => b.opportunity - a.opportunity);

  const recommendations: FoodBalanceRecommendation[] = [];
  for (const opp of opportunities) {
    if (recommendations.length >= FOOD_BALANCE_CONFIG.maxRecommendations) break;
    // Only one calorie-reduction-style recommendation at a time.
    if (opp.template.category === "energy" && energyRecommendationsSeen.size > 0) continue;
    if (opp.template.category === "energy") energyRecommendationsSeen.add(opp.key);

    recommendations.push({
      id: opp.key,
      category: opp.template.category,
      title: opp.template.title,
      description: opp.template.description,
      reason: opp.template.reason,
      priority: recommendations.length + 1,
      confidence: opp.component.confidence,
      estimatedScoreImpact: Math.round(opp.opportunity) || undefined,
    });
  }

  return recommendations;
}
