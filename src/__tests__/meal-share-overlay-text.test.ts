import {
  SHARE_OVERLAY_TEXT_LIBRARY,
  SHARE_OVERLAY_BANNED_PHRASES,
  formatOverlayText,
  suggestOverlayTexts,
  shuffleOverlayTexts,
} from "@/lib/meal-share/overlay-text";

describe("SHARE_OVERLAY_TEXT_LIBRARY", () => {
  it("has at least 100 options", () => {
    expect(SHARE_OVERLAY_TEXT_LIBRARY.length).toBeGreaterThanOrEqual(100);
  });

  it("self text never starts with a first-person pronoun", () => {
    for (const suggestion of SHARE_OVERLAY_TEXT_LIBRARY) {
      expect(suggestion.textSelf.toLowerCase().startsWith("i ")).toBe(false);
      expect(suggestion.textSelf.toLowerCase()).not.toBe("i");
    }
  });

  it("contains no banned phrases", () => {
    for (const suggestion of SHARE_OVERLAY_TEXT_LIBRARY) {
      const lower = suggestion.textSelf.toLowerCase();
      for (const banned of SHARE_OVERLAY_BANNED_PHRASES) {
        expect(lower.includes(banned)).toBe(false);
      }
    }
  });

  it("covers every documented category", () => {
    const categories = new Set(SHARE_OVERLAY_TEXT_LIBRARY.map((s) => s.category));
    expect(categories).toEqual(
      new Set(["protein", "balanced_meal", "fiber_veg", "home_cooked", "consistency", "comeback", "improvement", "funny"])
    );
  });

  it("does not overuse 'maxxing' (at most a small fraction of entries)", () => {
    const maxxingCount = SHARE_OVERLAY_TEXT_LIBRARY.filter((s) => s.textSelf.toLowerCase().includes("maxxing")).length;
    expect(maxxingCount).toBeLessThanOrEqual(6);
  });
});

describe("formatOverlayText", () => {
  const actionSuggestion = { textSelf: "Protein maxxing for breakfast", format: "action" as const };
  const possessiveSuggestion = { textSelf: "Balanced plate era", format: "possessive" as const };

  it("returns the base text unmodified for self audience", () => {
    expect(formatOverlayText(actionSuggestion, "self")).toBe("Protein maxxing for breakfast");
  });

  it("inserts the relationship correctly for action-format family captions", () => {
    expect(formatOverlayText(actionSuggestion, "family", "mom")).toBe("My mom protein maxxing for breakfast");
  });

  it("inserts the relationship correctly for possessive-format family captions", () => {
    expect(formatOverlayText(possessiveSuggestion, "family", "dad")).toBe("My dad's balanced plate era");
  });

  it("falls back to 'family member' when no relationship is given", () => {
    expect(formatOverlayText(actionSuggestion, "family")).toBe("My family member protein maxxing for breakfast");
  });

  it("renders a gender-neutral 'parent' relationship as 'mom' when gender is female", () => {
    expect(formatOverlayText(possessiveSuggestion, "family", "parent", "female")).toBe("My mom's balanced plate era");
  });

  it("renders a gender-neutral 'parent' relationship as 'dad' when gender is male", () => {
    expect(formatOverlayText(possessiveSuggestion, "family", "parent", "male")).toBe("My dad's balanced plate era");
  });

  it("keeps 'parent' as-is when gender is unknown", () => {
    expect(formatOverlayText(possessiveSuggestion, "family", "parent")).toBe("My parent's balanced plate era");
  });

  it("genders 'spouse' and 'sibling' the same way", () => {
    expect(formatOverlayText(possessiveSuggestion, "family", "spouse", "male")).toBe("My husband's balanced plate era");
    expect(formatOverlayText(possessiveSuggestion, "family", "spouse", "female")).toBe("My wife's balanced plate era");
    expect(formatOverlayText(possessiveSuggestion, "family", "sibling", "male")).toBe("My brother's balanced plate era");
    expect(formatOverlayText(possessiveSuggestion, "family", "sibling", "female")).toBe("My sister's balanced plate era");
  });

  it("leaves an already-gendered relationship like 'son' untouched regardless of gender", () => {
    expect(formatOverlayText(possessiveSuggestion, "family", "son", "female")).toBe("My son's balanced plate era");
  });

  it("drops the relationship prefix entirely for 'other', same as a self caption", () => {
    expect(formatOverlayText(possessiveSuggestion, "family", "other")).toBe("Balanced plate era");
    expect(formatOverlayText(actionSuggestion, "family", "Other")).toBe("Protein maxxing for breakfast");
  });

  it("drops a leading 'The' from a possessive caption once a relationship prefix is added", () => {
    const theSuggestion = { textSelf: "The plate is plating", format: "possessive" as const };
    expect(formatOverlayText(theSuggestion, "family", "mom")).toBe("My mom's plate is plating");
    expect(formatOverlayText(theSuggestion, "coach")).toBe("Client's plate is plating");
  });

  it("keeps a leading 'The' as-is for a bare self caption (no prefix to clash with)", () => {
    const theSuggestion = { textSelf: "The plate is plating", format: "possessive" as const };
    expect(formatOverlayText(theSuggestion, "self")).toBe("The plate is plating");
  });

  it("formats coach captions with 'Client' (action)", () => {
    expect(formatOverlayText(actionSuggestion, "coach")).toBe("Client protein maxxing for breakfast");
  });

  it("formats coach captions with 'Client's' (possessive)", () => {
    expect(formatOverlayText(possessiveSuggestion, "coach")).toBe("Client's balanced plate era");
  });
});

describe("suggestOverlayTexts", () => {
  it("suggests breakfast/protein-relevant text for a breakfast+protein context", () => {
    const results = suggestOverlayTexts({ mealType: "breakfast", categories: ["protein"], audience: "self" }, 8);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.category === "protein")).toBe(true);
  });

  it("suggests balanced/macro text for a balanced-meal context", () => {
    const results = suggestOverlayTexts({ categories: ["balanced_meal"], audience: "self" }, 8);
    expect(results.every((r) => r.category === "balanced_meal")).toBe(true);
  });

  it("suggests fiber/veg text for a fiber-win context", () => {
    const results = suggestOverlayTexts({ categories: ["fiber_veg"], audience: "self" }, 8);
    expect(results.every((r) => r.category === "fiber_veg")).toBe(true);
  });

  it("falls back to generic categories when none are given", () => {
    const results = suggestOverlayTexts({ audience: "self" }, 5);
    expect(results.length).toBeGreaterThan(0);
  });

  it("formats results for the requested audience", () => {
    const results = suggestOverlayTexts({ categories: ["protein"], audience: "family", relationship: "mom" }, 3);
    expect(results.every((r) => r.text.startsWith("My mom"))).toBe(true);
  });
});

describe("shuffleOverlayTexts", () => {
  it("returns suggestions constrained to the requested categories", () => {
    const results = shuffleOverlayTexts({ categories: ["fiber_veg"], audience: "self" }, 5);
    expect(results.every((r) => r.category === "fiber_veg")).toBe(true);
  });

  it("can return a different order across calls (shuffled, not deterministic)", () => {
    const first = shuffleOverlayTexts({ audience: "self" }, 100).map((r) => r.id);
    const second = shuffleOverlayTexts({ audience: "self" }, 100).map((r) => r.id);
    // Not a strict guarantee, but overwhelmingly likely to differ across
    // 100-item shuffles; if this ever flakes, the shuffle isn't random.
    expect(first).not.toEqual(second);
  });
});
