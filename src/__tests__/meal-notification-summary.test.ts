// Covers the push-notification body copy for a family meal (see
// summariseMealForNotification / notifyCaregiverOfFamilyMeal in
// src/lib/whatsapp/conversation-handler.ts) — the "what did they actually
// eat" line that replaced the old generic "X just logged a lunch." body.

import { summariseMealForNotification } from "@/lib/whatsapp/conversation-handler";

function analysis(overrides: Record<string, unknown> = {}) {
  return {
    foods: [{ name: "Dal" }, { name: "Rice" }],
    total_calories_min: 480,
    total_calories_max: 600,
    total_protein_min: 22,
    total_protein_max: 28,
    summary: "Looks like a simple dal-rice plate.",
    ...overrides,
  } as any;
}

describe("summariseMealForNotification", () => {
  it("lists the foods followed by calorie and protein ranges", () => {
    expect(summariseMealForNotification(analysis())).toBe("Dal, Rice · ~480–600 kcal · 22–28g protein");
  });

  it("caps the food list at three items and counts the remainder", () => {
    const body = summariseMealForNotification(
      analysis({ foods: [{ name: "Dal" }, { name: "Rice" }, { name: "Salad" }, { name: "Curd" }, { name: "Papad" }] })
    );
    expect(body).toContain("Dal, Rice, Salad +2 more");
  });

  it("collapses a range to a single number when min and max match", () => {
    const body = summariseMealForNotification(
      analysis({ total_calories_min: 520, total_calories_max: 520 })
    );
    expect(body).toContain("~520 kcal");
  });

  it("falls back to the AI summary when the analysis identified no named foods", () => {
    expect(summariseMealForNotification(analysis({ foods: [] }))).toBe(
      "Looks like a simple dal-rice plate. · ~480–600 kcal · 22–28g protein"
    );
  });

  it("omits a macro entirely rather than printing a 0 estimate", () => {
    const body = summariseMealForNotification(
      analysis({ total_protein_min: 0, total_protein_max: 0 })
    );
    expect(body).toBe("Dal, Rice · ~480–600 kcal");
  });

  it("still produces the food line when a zero-calorie item has no macros at all", () => {
    const body = summariseMealForNotification(
      analysis({
        foods: [{ name: "Black coffee" }],
        total_calories_min: 0,
        total_calories_max: 0,
        total_protein_min: 0,
        total_protein_max: 0,
      })
    );
    expect(body).toBe("Black coffee");
  });
});
