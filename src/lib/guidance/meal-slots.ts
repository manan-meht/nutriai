// The meals a day is planned and checked in. Kept on its own, with no
// imports, so browser components can use it without pulling in the
// server-side Guidance services.

export type MealSlot = "breakfast" | "lunch" | "snack" | "dinner";
export const MEAL_SLOTS: MealSlot[] = ["breakfast", "lunch", "snack", "dinner"];
/** The meals a skip can be confirmed for. Snacks are optional by nature. */
export const MAIN_SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner"];

/** meal_logs.meal_type as a planning slot. Drinks, tea and the like aren't
 * meals a plan or a skip is about. */
export function slotOfMealType(mealType: string | null): MealSlot | null {
  return mealType === "breakfast" || mealType === "lunch" || mealType === "snack" || mealType === "dinner" ? mealType : null;
}
