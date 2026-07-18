import { SHARE_CARD_CONCEPTS } from "@/lib/share-cards/concepts";
import type { EarnedShareCard } from "@/lib/share-cards/types";
import { canShowImmediatePrompt, pickImmediatePromptCard, selectDashboardCards, selectFeaturedCard } from "@/lib/share-cards/selector";

function card(id: string, category: EarnedShareCard["concept"]["category"], earnedAt: string): EarnedShareCard {
  const concept = SHARE_CARD_CONCEPTS.find((c) => c.id === id) ?? SHARE_CARD_CONCEPTS[0];
  return {
    concept: { ...concept, category },
    earnedAt,
    headline: concept.headlineOptions[0],
    supportingText: concept.supportingTextOptions[0],
    isLowConfidence: false,
    format: concept.defaultFormat,
  };
}

describe("selectDashboardCards", () => {
  it("caps the dashboard at 3 cards", () => {
    const earned = SHARE_CARD_CONCEPTS.slice(0, 10).map((c, i) =>
      card(c.id, c.category, new Date(Date.now() - i * 1000).toISOString())
    );
    expect(selectDashboardCards(earned)).toHaveLength(3);
  });

  it("prioritizes comeback/personality/consistency cards over routine daily wins", () => {
    const earned = [
      card("protein-goal-hit-today", "daily_win", new Date().toISOString()),
      card("comeback-week", "comeback", new Date().toISOString()),
    ];
    const selected = selectDashboardCards(earned);
    expect(selected[0].concept.category).toBe("comeback");
  });
});

describe("selectFeaturedCard", () => {
  it("returns exactly one card for the weekly report / WhatsApp summary", () => {
    const earned = [
      card("protein-goal-hit-today", "daily_win", new Date().toISOString()),
      card("seven-day-logging-streak", "weekly_consistency", new Date().toISOString()),
    ];
    const featured = selectFeaturedCard(earned);
    expect(featured?.concept.category).toBe("weekly_consistency");
  });

  it("returns null when nothing is earned", () => {
    expect(selectFeaturedCard([])).toBeNull();
  });
});

describe("canShowImmediatePrompt / pickImmediatePromptCard (rate limiting)", () => {
  it("allows a prompt when none has been shown yet", () => {
    expect(canShowImmediatePrompt({ lastImmediatePromptAt: null })).toBe(true);
  });

  it("blocks a second immediate prompt on the same day", () => {
    const now = new Date();
    expect(canShowImmediatePrompt({ lastImmediatePromptAt: now.toISOString(), now })).toBe(false);
  });

  it("allows a new immediate prompt on a later day", () => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    expect(canShowImmediatePrompt({ lastImmediatePromptAt: yesterday.toISOString(), now })).toBe(true);
  });

  it("rate-limits pickImmediatePromptCard to at most one per day even with cards earned", () => {
    const now = new Date();
    const earned = [card("protein-goal-hit-today", "daily_win", now.toISOString())];
    const picked = pickImmediatePromptCard(earned, { lastImmediatePromptAt: now.toISOString(), now });
    expect(picked).toBeNull();
  });

  it("respects 'don't show this one again' dismissals", () => {
    const now = new Date();
    const earned = [card("protein-goal-hit-today", "daily_win", now.toISOString())];
    const picked = pickImmediatePromptCard(earned, {
      lastImmediatePromptAt: null,
      dismissedConceptIds: ["protein-goal-hit-today"],
      now,
    });
    expect(picked).toBeNull();
  });
});
