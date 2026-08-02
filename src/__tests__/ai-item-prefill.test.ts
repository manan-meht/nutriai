import { likelihoodToBoolean, directionToHealthy, aiFoodCategoryToKnowledgeCategory } from "@/lib/admin/ai-item-prefill";

describe("likelihoodToBoolean", () => {
  it("maps high to true", () => expect(likelihoodToBoolean("high")).toBe(true));
  it("maps low to false", () => expect(likelihoodToBoolean("low")).toBe(false));
  it("maps medium to null", () => expect(likelihoodToBoolean("medium")).toBeNull());
  it("maps unknown to null", () => expect(likelihoodToBoolean("unknown")).toBeNull());
});

describe("directionToHealthy", () => {
  it("maps positive to true", () => expect(directionToHealthy("positive")).toBe(true));
  it("maps negative to false", () => expect(directionToHealthy("negative")).toBe(false));
  it("maps neutral to null", () => expect(directionToHealthy("neutral")).toBeNull());
});

describe("aiFoodCategoryToKnowledgeCategory", () => {
  it("maps protein-relevant food categories to protein_anchor", () => {
    expect(aiFoodCategoryToKnowledgeCategory("chicken")).toBe("protein_anchor");
    expect(aiFoodCategoryToKnowledgeCategory("egg")).toBe("protein_anchor");
    expect(aiFoodCategoryToKnowledgeCategory("paneer")).toBe("protein_anchor");
  });

  it("maps fat-relevant food categories to fat_source", () => {
    expect(aiFoodCategoryToKnowledgeCategory("avocado")).toBe("fat_source");
    expect(aiFoodCategoryToKnowledgeCategory("seeds_nuts")).toBe("fat_source");
  });

  it("returns null for 'other' or missing", () => {
    expect(aiFoodCategoryToKnowledgeCategory("other")).toBeNull();
    expect(aiFoodCategoryToKnowledgeCategory(null)).toBeNull();
    expect(aiFoodCategoryToKnowledgeCategory(undefined)).toBeNull();
  });
});
