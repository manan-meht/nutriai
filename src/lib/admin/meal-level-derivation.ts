// Derives the whole-meal categorical judgments (protein anchor, veg/fiber,
// carb status, meal balance, home-cooked/ultra-processed likelihood,
// healthier-direction signal) from the reviewer's per-item corrections,
// rather than asking for both separately. Reusing food_knowledge_base's
// existing `category` enum (protein_anchor/vegetable_fiber/carb_base/...)
// as the per-item tag means a reviewer only ever classifies each dish once
// per meal, and these meal-level fields — which still feed the Model
// Quality dashboard's accuracy tracking — fall out of that for free.

export type PresenceStatus = "missing" | "partial" | "present" | "unknown";
export type CarbStatus = "missing" | "present" | "dominant" | "unknown";
export type BalanceStatus = "needs_support" | "moderate" | "strong" | "unknown";
export type Likelihood = "low" | "medium" | "high" | "unknown";
export type DirectionSignal = "negative" | "neutral" | "positive" | "unknown";

export interface DerivableFoodItem {
  /** food_knowledge_base.category — null if this item hasn't been tagged
   * (a brand-new food the reviewer hasn't categorized yet). */
  category: string | null;
  isHealthy: boolean | null;
  isHomeCooked: boolean | null;
  isUltraProcessed: boolean | null;
}

export interface DerivedMealLevelFields {
  proteinAnchorStatus: PresenceStatus;
  vegetableFiberStatus: PresenceStatus;
  carbStatus: CarbStatus;
  mealBalanceStatus: BalanceStatus;
  homeCookedLikelihood: Likelihood;
  ultraProcessedLikelihood: Likelihood;
  healthierDirectionSignal: DirectionSignal;
}

const UNKNOWN_FIELDS: DerivedMealLevelFields = {
  proteinAnchorStatus: "unknown",
  vegetableFiberStatus: "unknown",
  carbStatus: "unknown",
  mealBalanceStatus: "unknown",
  homeCookedLikelihood: "unknown",
  ultraProcessedLikelihood: "unknown",
  healthierDirectionSignal: "unknown",
};

/** Majority-vote rollup for a tri-state likelihood — "unknown" only when
 * nothing in the meal has an opinion at all, so one untagged item among
 * several judged ones doesn't drag the whole meal to "unknown". */
function rollupLikelihood(values: Array<boolean | null>): Likelihood {
  const known = values.filter((v): v is boolean => v !== null);
  if (!known.length) return "unknown";
  const ratio = known.filter(Boolean).length / known.length;
  if (ratio >= 0.75) return "high";
  if (ratio <= 0.25) return "low";
  return "medium";
}

function rollupDirection(values: Array<boolean | null>): DirectionSignal {
  const known = values.filter((v): v is boolean => v !== null);
  if (!known.length) return "unknown";
  const ratio = known.filter(Boolean).length / known.length;
  if (ratio >= 0.6) return "positive";
  if (ratio <= 0.4) return "negative";
  return "neutral";
}

export function deriveMealLevelFields(items: DerivableFoodItem[]): DerivedMealLevelFields {
  if (!items.length) return UNKNOWN_FIELDS;

  const categories = items.map((i) => i.category);
  const hasProtein = categories.includes("protein_anchor");
  const hasPartialProtein = categories.includes("partial_protein");
  const proteinAnchorStatus: PresenceStatus = hasProtein ? "present" : hasPartialProtein ? "partial" : "missing";

  const vegetableFiberStatus: PresenceStatus = categories.includes("vegetable_fiber") ? "present" : "missing";
  const hasFruit = categories.includes("fruit");

  const carbItemCount = categories.filter((c) => c === "carb_base").length;
  const carbStatus: CarbStatus = carbItemCount === 0 ? "missing" : carbItemCount / items.length >= 0.5 ? "dominant" : "present";

  // Fruit is tracked as its own category (distinct from vegetable_fiber and
  // carb_base — see food-categories.ts) but still counts toward meal
  // balance as a produce contribution, so a fruit-only meal isn't scored
  // the same as one with no produce at all.
  const hasProduce = vegetableFiberStatus === "present" || hasFruit;
  const isStrong = proteinAnchorStatus === "present" && hasProduce;
  const needsSupport = proteinAnchorStatus === "missing" && !hasProduce;
  const mealBalanceStatus: BalanceStatus = isStrong ? "strong" : needsSupport ? "needs_support" : "moderate";

  return {
    proteinAnchorStatus,
    vegetableFiberStatus,
    carbStatus,
    mealBalanceStatus,
    homeCookedLikelihood: rollupLikelihood(items.map((i) => i.isHomeCooked)),
    ultraProcessedLikelihood: rollupLikelihood(items.map((i) => i.isUltraProcessed)),
    healthierDirectionSignal: rollupDirection(items.map((i) => i.isHealthy)),
  };
}
