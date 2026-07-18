import { buildWeeklyWinsWhatsAppLine, pickWeeklyWhatsAppWin } from "@/lib/share-cards/weekly-summary";
import type { ShareCardMealInput } from "@/lib/share-cards/triggers";

function meal(loggedAt: string): ShareCardMealInput {
  return { loggedAt, totalProteinMin: 20, totalProteinMax: 25, totalFiberMin: 5, totalFiberMax: 8 };
}

describe("pickWeeklyWhatsAppWin", () => {
  it("picks a weekly-consistency card when the contact logged every day this week", () => {
    const meals: ShareCardMealInput[] = [];
    const card = pickWeeklyWhatsAppWin(meals, 7);
    expect(card?.concept.category).toBe("weekly_consistency");
    expect(["five_day_logging_week", "seven_day_logging_streak"]).toContain(card?.concept.triggerKey);
  });

  it("returns null when nothing meal-count-based was earned", () => {
    const meals: ShareCardMealInput[] = [];
    expect(pickWeeklyWhatsAppWin(meals, 1)).toBeNull();
  });
});

describe("buildWeeklyWinsWhatsAppLine", () => {
  it("includes the card title and dashboard link", () => {
    const meals: ShareCardMealInput[] = [meal(new Date().toISOString())];
    const card = pickWeeklyWhatsAppWin(meals, 7)!;
    const line = buildWeeklyWinsWhatsAppLine(card, "https://tistrahealth.com/my-progress");
    expect(line).toContain(card.concept.title);
    expect(line).toContain("https://tistrahealth.com/my-progress");
  });
});
