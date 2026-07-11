// Verbatim port of src/lib/nutrition/human-corrections.ts from the main web app (pure JS/TS, no
// browser/Next.js APIs) — keep in sync manually if the web version changes.

import type { ClassifiedMeal, PresenceStatus, BalanceStatus, Likelihood } from "./food-classification";

// Priority order for what a dashboard should trust for a given meal:
//   1. Human-corrected classification (this file)
//   2. Raw AI/heuristic classification (classifyMeal)
// Both versions are preserved in the database regardless (meal_submissions /
// ai_meal_classifications / human_meal_reviews) — this only decides what the
// *dashboard* shows. See src/app/(admin)/admin for where corrections come from.
//
// This module is imported by client components (dashboards), so it must stay
// free of server-only imports (e.g. @/lib/supabase/server) — the actual
// Supabase fetch lives in ./fetch-human-corrections.ts instead.
export interface HumanCorrectionFields {
  proteinAnchorStatus?: PresenceStatus;
  vegetableFiberStatus?: PresenceStatus;
  mealBalanceStatus?: BalanceStatus;
  homeCookedLikelihood?: Likelihood;
  enjoymentFoodPresent?: boolean;
  sugaryDrinkPresent?: boolean;
  ultraProcessedLikelihood?: Likelihood;
  suggestedNextStep?: string;
}

/** Applies a human correction over a heuristic classification — fields the
 * reviewer didn't judge (undefined/"unknown") fall back to the original. */
export function applyHumanCorrection(meal: ClassifiedMeal, correction?: HumanCorrectionFields): ClassifiedMeal {
  if (!correction) return meal;
  return {
    ...meal,
    proteinAnchorStatus: correction.proteinAnchorStatus ?? meal.proteinAnchorStatus,
    vegetableFiberStatus: correction.vegetableFiberStatus ?? meal.vegetableFiberStatus,
    mealBalanceStatus: correction.mealBalanceStatus ?? meal.mealBalanceStatus,
    homeCookedLikelihood: correction.homeCookedLikelihood ?? meal.homeCookedLikelihood,
    enjoymentFoodPresent: correction.enjoymentFoodPresent ?? meal.enjoymentFoodPresent,
    sugaryDrinkPresent: correction.sugaryDrinkPresent ?? meal.sugaryDrinkPresent,
    ultraProcessedLikelihood: correction.ultraProcessedLikelihood ?? meal.ultraProcessedLikelihood,
    suggestedNextStep: correction.suggestedNextStep ?? meal.suggestedNextStep,
  };
}
