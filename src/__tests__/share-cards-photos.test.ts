import { selectSharePhotos, type ShareCardMealInput } from "@/lib/share-cards/triggers";
import type { ShareCardConcept } from "@/lib/share-cards/types";

function meal(overrides: Partial<ShareCardMealInput> & { loggedAt: string }): ShareCardMealInput {
  return {
    totalProteinMin: 0,
    totalProteinMax: 0,
    totalFiberMin: 0,
    totalFiberMax: 0,
    ...overrides,
  };
}

function daysAgoIso(days: number, hour = 12): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function concept(category: ShareCardConcept["category"], triggerKey: string): Pick<ShareCardConcept, "category" | "triggerKey"> {
  return { category, triggerKey };
}

describe("selectSharePhotos", () => {
  it("returns no photos for personality_badge concepts", () => {
    const meals = [meal({ loggedAt: daysAgoIso(0), imageUrl: "a.jpg" })];
    expect(selectSharePhotos(concept("personality_badge", "protein_loyalist"), meals)).toEqual([]);
  });

  it("returns no photos when no in-window meal has an image", () => {
    const meals = [meal({ loggedAt: daysAgoIso(0) })];
    expect(selectSharePhotos(concept("daily_win", "balanced_day"), meals)).toEqual([]);
  });

  it("picks only today's meals for a daily_win concept", () => {
    const meals = [
      meal({ loggedAt: daysAgoIso(0), imageUrl: "today.jpg" }),
      meal({ loggedAt: daysAgoIso(2), imageUrl: "twodaysago.jpg" }),
    ];
    const photos = selectSharePhotos(concept("daily_win", "balanced_day"), meals);
    expect(photos).toEqual(["today.jpg"]);
  });

  it("picks meals from the trailing 7 days for a weekly_consistency concept", () => {
    const meals = [
      meal({ loggedAt: daysAgoIso(1), imageUrl: "d1.jpg" }),
      meal({ loggedAt: daysAgoIso(5), imageUrl: "d5.jpg" }),
      meal({ loggedAt: daysAgoIso(10), imageUrl: "d10.jpg" }),
    ];
    const photos = selectSharePhotos(concept("weekly_consistency", "five_day_logging_week"), meals);
    expect(photos).toContain("d1.jpg");
    expect(photos).toContain("d5.jpg");
    expect(photos).not.toContain("d10.jpg");
  });

  it("filters to home-cooked meals for the home-cooked concept", () => {
    const meals = [
      meal({ loggedAt: daysAgoIso(0), imageUrl: "home.jpg", homeCookedLikelihood: "high" }),
      meal({ loggedAt: daysAgoIso(0, 18), imageUrl: "restaurant.jpg", homeCookedLikelihood: "low" }),
    ];
    const photos = selectSharePhotos(concept("daily_win", "home_cooked_win"), meals);
    expect(photos).toEqual(["home.jpg"]);
  });

  it("filters to high-protein meals for a protein concept", () => {
    const meals = [
      meal({ loggedAt: daysAgoIso(0), imageUrl: "high-protein.jpg", totalProteinMin: 28, totalProteinMax: 32 }),
      meal({ loggedAt: daysAgoIso(0, 18), imageUrl: "low-protein.jpg", totalProteinMin: 2, totalProteinMax: 4 }),
    ];
    const photos = selectSharePhotos(concept("daily_win", "protein_goal_hit_today"), meals);
    expect(photos).toEqual(["high-protein.jpg"]);
  });

  it("filters to fiber/vegetable meals for a fiber concept", () => {
    const meals = [
      meal({ loggedAt: daysAgoIso(0), imageUrl: "salad.jpg", hasVegetableOrFruit: true }),
      meal({ loggedAt: daysAgoIso(0, 18), imageUrl: "plain.jpg", hasVegetableOrFruit: false }),
    ];
    const photos = selectSharePhotos(concept("daily_win", "fiber_win_today"), meals);
    expect(photos).toEqual(["salad.jpg"]);
  });

  it("falls back to any in-window photo when the relevance filter matches nothing", () => {
    const meals = [meal({ loggedAt: daysAgoIso(0), imageUrl: "restaurant.jpg", homeCookedLikelihood: "low" })];
    const photos = selectSharePhotos(concept("daily_win", "home_cooked_win"), meals);
    expect(photos).toEqual(["restaurant.jpg"]);
  });

  it("caps results at 4 photos and picks at most one per distinct day", () => {
    const meals = [
      meal({ loggedAt: daysAgoIso(1, 8), imageUrl: "d1-breakfast.jpg" }),
      meal({ loggedAt: daysAgoIso(1, 19), imageUrl: "d1-dinner.jpg" }),
      meal({ loggedAt: daysAgoIso(2), imageUrl: "d2.jpg" }),
      meal({ loggedAt: daysAgoIso(3), imageUrl: "d3.jpg" }),
      meal({ loggedAt: daysAgoIso(4), imageUrl: "d4.jpg" }),
      meal({ loggedAt: daysAgoIso(5), imageUrl: "d5.jpg" }),
    ];
    const photos = selectSharePhotos(concept("weekly_consistency", "five_day_logging_week"), meals, new Date(), 4);
    expect(photos.length).toBe(4);
    // Only one of the two same-day photos should be included.
    expect(photos.includes("d1-breakfast.jpg") && photos.includes("d1-dinner.jpg")).toBe(false);
  });

  it("orders photos most-recent-first", () => {
    const meals = [
      meal({ loggedAt: daysAgoIso(3), imageUrl: "older.jpg" }),
      meal({ loggedAt: daysAgoIso(0), imageUrl: "newest.jpg" }),
    ];
    const photos = selectSharePhotos(concept("weekly_consistency", "five_day_logging_week"), meals);
    expect(photos[0]).toBe("newest.jpg");
  });
});
