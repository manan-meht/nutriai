import { computeReviewPriority } from "@/lib/admin/review-priority";

describe("computeReviewPriority", () => {
  it("is high when confidence is below 0.70", () => {
    expect(computeReviewPriority({ confidenceScore: 0.5, detectedItems: ["rice"] })).toBe("high");
  });

  it("is high when the image is blurry", () => {
    expect(computeReviewPriority({ confidenceScore: 0.95, imageQuality: "blurry", detectedItems: ["rice"] })).toBe("high");
  });

  it("is high when no food was detected", () => {
    expect(computeReviewPriority({ confidenceScore: 0.95, detectedItems: [] })).toBe("high");
  });

  it("is high when protein is marked missing but an Indian protein food was detected", () => {
    expect(
      computeReviewPriority({
        confidenceScore: 0.95,
        detectedItems: ["rice", "dal"],
        proteinAnchorStatus: "missing",
      })
    ).toBe("high");
  });

  it("is high when escalated or disputed regardless of other signals", () => {
    expect(computeReviewPriority({ confidenceScore: 0.95, detectedItems: ["rice"], isEscalated: true })).toBe("high");
    expect(computeReviewPriority({ confidenceScore: 0.95, detectedItems: ["rice"], isDisputed: true })).toBe("high");
  });

  it("is medium for mid-range confidence", () => {
    expect(computeReviewPriority({ confidenceScore: 0.8, detectedItems: ["rice", "dal"], proteinAnchorStatus: "present" })).toBe("medium");
  });

  it("is medium for a random QA sample even with high confidence", () => {
    expect(computeReviewPriority({ confidenceScore: 0.95, detectedItems: ["rice"], isRandomQaSample: true })).toBe("medium");
  });

  it("is low when confidence is high and nothing else is flagged", () => {
    expect(computeReviewPriority({ confidenceScore: 0.95, detectedItems: ["rice", "dal", "curd"], proteinAnchorStatus: "present" })).toBe("low");
  });
});
