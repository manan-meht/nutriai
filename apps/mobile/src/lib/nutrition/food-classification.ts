// Verbatim port of src/lib/nutrition/food-classification.ts from the main web app (pure JS/TS, no
// browser/Next.js APIs) — keep in sync manually if the web version changes.

// Habit-based meal classification. Deliberately keyword/heuristic based (not
// an LLM call) so it can run retroactively over every meal already stored in
// `meal_logs.foods`, not just meals logged after this was added.

export type PresenceStatus = "missing" | "partial" | "present";
export type BalanceStatus = "needs_support" | "moderate" | "strong";
export type Likelihood = "low" | "medium" | "high";

export interface ClassifiableMeal {
  id: string;
  loggedAt: string;
  mealType: string | null;
  foods: Array<{ name: string }>;
  aiSummary?: string | null;
}

export interface ClassifiedMeal extends ClassifiableMeal {
  proteinAnchorStatus: PresenceStatus;
  vegetableFiberStatus: PresenceStatus;
  carbPresent: boolean;
  mealBalanceStatus: BalanceStatus;
  homeCookedLikelihood: Likelihood;
  enjoymentFoodPresent: boolean;
  sugaryDrinkPresent: boolean;
  ultraProcessedLikelihood: Likelihood;
  suggestedNextStep: string;
}

const PROTEIN_KEYWORDS = [
  "dal", "daal", "lentil", "curd", "yogurt", "yoghurt", "paneer", "tofu", "egg",
  "fish", "chicken", "meat", "mutton", "prawn", "sprouts", "bean", "rajma",
  "chana", "chole", "whey", "soy", "soya", "milk", "cheese", "nuts", "almond",
  "peanut",
];

const VEG_FIBER_KEYWORDS = [
  "salad", "vegetable", "veggie", "sabzi", "sabji", "spinach", "palak",
  "greens", "carrot", "beans", "broccoli", "cabbage", "cauliflower", "gourd",
  "bhindi", "okra", "tomato", "cucumber", "fruit", "banana", "apple", "orange",
  "papaya", "guava", "salad", "methi", "fiber", "fibre", "sprouts",
];

const CARB_KEYWORDS = [
  "rice", "roti", "chapati", "dosa", "idli", "poha", "paratha", "potato",
  "aloo", "bread", "naan", "noodle", "pasta", "upma", "khichdi", "biryani",
];

const ENJOYMENT_KEYWORDS = [
  "samosa", "pakora", "sweet", "mithai", "laddoo", "ladoo", "barfi", "cake",
  "chocolate", "ice cream", "pastry", "cookie", "biscuit", "jalebi",
  "gulab jamun", "donut", "halwa", "kheer", "rasgulla",
];

const SUGARY_DRINK_KEYWORDS = [
  "soda", "cola", "soft drink", "coke", "pepsi", "sprite", "frooti", "juice",
  "energy drink", "sugary", "sweetened tea", "sweetened coffee", "shake",
  "milkshake",
];

const ULTRA_PROCESSED_KEYWORDS = [
  "chips", "instant noodles", "maggi", "packaged", "namkeen", "fast food",
  "burger", "pizza", "nuggets", "fried snack", "wafer",
];

const HOME_COOKED_NEGATIVE_KEYWORDS = [
  "restaurant", "ordered", "zomato", "swiggy", "hotel food", "takeaway",
  "take-out", "delivery",
];

function textOf(meal: ClassifiableMeal): string {
  const foodText = meal.foods.map((f) => f.name).join(" ");
  return `${foodText} ${meal.aiSummary ?? ""}`.toLowerCase();
}

function countMatches(names: string[], keywords: string[]): number {
  return names.filter((n) => keywords.some((k) => n.includes(k))).length;
}

function presenceFromCount(count: number): PresenceStatus {
  if (count >= 2) return "present";
  if (count === 1) return "partial";
  return "missing";
}

export function classifyMeal(meal: ClassifiableMeal): ClassifiedMeal {
  const foodNames = meal.foods.map((f) => f.name.toLowerCase());
  const text = textOf(meal);

  const proteinAnchorStatus = presenceFromCount(countMatches(foodNames, PROTEIN_KEYWORDS));
  const vegetableFiberStatus = presenceFromCount(countMatches(foodNames, VEG_FIBER_KEYWORDS));
  const carbPresent = CARB_KEYWORDS.some((k) => text.includes(k));
  const enjoymentFoodPresent = ENJOYMENT_KEYWORDS.some((k) => text.includes(k));
  const sugaryDrinkPresent = SUGARY_DRINK_KEYWORDS.some((k) => text.includes(k));
  const ultraProcessedLikelihood: Likelihood = ULTRA_PROCESSED_KEYWORDS.some((k) => text.includes(k))
    ? "high"
    : "low";
  const homeCookedLikelihood: Likelihood = HOME_COOKED_NEGATIVE_KEYWORDS.some((k) => text.includes(k))
    ? "low"
    : foodNames.length > 0
      ? "high"
      : "medium";

  let mealBalanceStatus: BalanceStatus;
  const proteinOk = proteinAnchorStatus !== "missing";
  const vegOk = vegetableFiberStatus !== "missing";
  if (proteinOk && vegOk) {
    mealBalanceStatus = "strong";
  } else if (proteinOk || vegOk) {
    mealBalanceStatus = "moderate";
  } else {
    mealBalanceStatus = "needs_support";
  }

  let suggestedNextStep: string;
  if (mealBalanceStatus === "strong") {
    suggestedNextStep = "Great combination — keep this pattern going.";
  } else if (!proteinOk && !vegOk) {
    suggestedNextStep = carbPresent
      ? "This meal is mostly carbs. Add curd, dal, paneer, eggs, tofu, fish, or chicken next time to make it more filling."
      : "Try adding a protein anchor like dal, curd, paneer, or eggs next time.";
  } else if (!proteinOk) {
    suggestedNextStep = "Good base — add a protein anchor like dal, curd, paneer, eggs, tofu, fish, or chicken.";
  } else {
    suggestedNextStep = "Good protein here — add one vegetable, salad, or fruit to round it out.";
  }

  if (enjoymentFoodPresent && mealBalanceStatus === "needs_support") {
    suggestedNextStep = "This looks like an enjoyment food. No problem — make the next meal stronger with protein and vegetables.";
  }

  return {
    ...meal,
    proteinAnchorStatus,
    vegetableFiberStatus,
    carbPresent,
    mealBalanceStatus,
    homeCookedLikelihood,
    enjoymentFoodPresent,
    sugaryDrinkPresent,
    ultraProcessedLikelihood,
    suggestedNextStep,
  };
}
