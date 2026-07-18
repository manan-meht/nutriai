import { SHARE_CARD_CONCEPTS } from "@/lib/share-cards/concepts";

describe("SHARE_CARD_CONCEPTS", () => {
  it("loads all 30 concepts", () => {
    expect(SHARE_CARD_CONCEPTS).toHaveLength(30);
  });

  it("has unique ids", () => {
    const ids = SHARE_CARD_CONCEPTS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique trigger keys", () => {
    const keys = SHARE_CARD_CONCEPTS.map((c) => c.triggerKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every card has at least 2 headline options", () => {
    for (const c of SHARE_CARD_CONCEPTS) {
      expect(c.headlineOptions.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("every card has at least 2 supporting text options", () => {
    for (const c of SHARE_CARD_CONCEPTS) {
      expect(c.supportingTextOptions.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("every card has a trigger description", () => {
    for (const c of SHARE_CARD_CONCEPTS) {
      expect(c.triggerDescription.length).toBeGreaterThan(0);
    }
  });

  it("every card has a visual direction", () => {
    for (const c of SHARE_CARD_CONCEPTS) {
      expect(c.visualDirection.length).toBeGreaterThan(0);
    }
  });

  it("every card has a Nano Banana prompt", () => {
    for (const c of SHARE_CARD_CONCEPTS) {
      expect(c.nanoBananaPrompt).toBeTruthy();
    }
  });

  it("every Nano Banana prompt says there is no readable text in the image", () => {
    for (const c of SHARE_CARD_CONCEPTS) {
      expect(c.nanoBananaPrompt).toMatch(/No readable text in the image\./);
    }
  });

  it("every card hides exact metrics by default", () => {
    for (const c of SHARE_CARD_CONCEPTS) {
      expect(c.hideExactMetricsByDefault).toBe(true);
    }
  });

  it("every card defaults to the Story format and allows it", () => {
    for (const c of SHARE_CARD_CONCEPTS) {
      expect(c.defaultFormat).toBe("story_9_16");
      expect(c.allowedFormats).toContain("story_9_16");
    }
  });

  it("no headline or supporting text uses a banned shaming phrase", () => {
    const banned = [
      /avoided bad foods/i,
      /stayed under calories/i,
      /lost weight/i,
      /burned fat/i,
      /were good today/i,
      /failed less/i,
      /ate clean/i,
      /cheated less/i,
      /fixed your diet/i,
    ];
    for (const c of SHARE_CARD_CONCEPTS) {
      const allText = [...c.headlineOptions, ...c.supportingTextOptions].join(" ");
      for (const pattern of banned) {
        expect(allText).not.toMatch(pattern);
      }
    }
  });

  it("no card copy references exact calories, weight, or body fat", () => {
    const sensitive = [/\bcalories?\b/i, /\bkcal\b/i, /body ?fat/i, /\bkg\b/i, /\blbs?\b/i, /weight loss/i];
    for (const c of SHARE_CARD_CONCEPTS) {
      const allText = [...c.headlineOptions, ...c.supportingTextOptions].join(" ");
      for (const pattern of sensitive) {
        expect(allText).not.toMatch(pattern);
      }
    }
  });
});
