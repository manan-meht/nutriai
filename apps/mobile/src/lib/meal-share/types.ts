// Mirrors the main web app's src/lib/meal-share/types.ts — duplicated here
// rather than shared, matching this app's existing duplication convention
// (see e.g. lib/purchases.ts). Keep in sync manually if the web app's
// meal-share logic changes.

// Shareable meal photo cards — distinct from src/lib/share-cards/ (which
// celebrates abstract "wins" with a generic gradient background and no
// real photo). This feature composites the user's own meal photo plus its
// macros onto a branded frame for sharing to Instagram/WhatsApp/etc.
// Because the photo itself is already personally identifying, this
// intentionally shows exact macro values by default — unlike share-cards'
// "hide exact metrics by default" rule, which exists specifically to keep
// anonymous-feeling wins anonymous-feeling.
export interface MealShareData {
  imageUrl: string;
  mealType: string;
  loggedAt: string;
  /** Short caption — falls back to a food-name list if no AI summary. */
  summary: string;
  proteinG: number;
  caloriesKcal: number;
  carbsG: number;
  fatG: number;
}

function midpoint(min: number, max: number): number {
  return Math.round((min + max) / 2);
}

export function buildMealShareData(meal: {
  imageUrl?: string;
  mealType: string;
  loggedAt: string;
  aiSummary?: string;
  foods: Array<{ name: string }>;
  totalProteinMin: number;
  totalProteinMax: number;
  totalCaloriesMin: number;
  totalCaloriesMax: number;
  totalCarbsMin: number;
  totalCarbsMax: number;
  totalFatMin: number;
  totalFatMax: number;
}): MealShareData | null {
  if (!meal.imageUrl) return null;
  return {
    imageUrl: meal.imageUrl,
    mealType: meal.mealType,
    loggedAt: meal.loggedAt,
    summary: meal.aiSummary ?? meal.foods.map((f) => f.name).join(", "),
    proteinG: midpoint(meal.totalProteinMin, meal.totalProteinMax),
    caloriesKcal: midpoint(meal.totalCaloriesMin, meal.totalCaloriesMax),
    carbsG: midpoint(meal.totalCarbsMin, meal.totalCarbsMax),
    fatG: midpoint(meal.totalFatMin, meal.totalFatMax),
  };
}
