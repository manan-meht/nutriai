import { deriveActivityLevel, mapDerivedToLegacyActivityLevel } from "../food-balance/derive-activity-level";

describe("deriveActivityLevel", () => {
  it("mostly seated + under 30 minutes -> not_active", () => {
    expect(deriveActivityLevel({ dailyMovementLevel: "mostly_seated", weeklyModerateActivity: "under_30" })).toBe("not_active");
  });

  it("mostly seated + 30-89 minutes -> lightly_active", () => {
    expect(deriveActivityLevel({ dailyMovementLevel: "mostly_seated", weeklyModerateActivity: "30_to_89" })).toBe("lightly_active");
  });

  it("mostly seated + 150-299 minutes -> moderately_active", () => {
    expect(deriveActivityLevel({ dailyMovementLevel: "mostly_seated", weeklyModerateActivity: "150_to_299" })).toBe("moderately_active");
  });

  it("mostly seated + 300+ minutes -> very_active", () => {
    expect(deriveActivityLevel({ dailyMovementLevel: "mostly_seated", weeklyModerateActivity: "300_plus" })).toBe("very_active");
  });

  it("moving several hours + under 30 minutes -> at least lightly_active", () => {
    expect(deriveActivityLevel({ dailyMovementLevel: "moving_several_hours", weeklyModerateActivity: "under_30" })).toBe("lightly_active");
  });

  it("moving several hours + 90-149 minutes -> moderately_active", () => {
    expect(deriveActivityLevel({ dailyMovementLevel: "moving_several_hours", weeklyModerateActivity: "90_to_149" })).toBe("moderately_active");
  });

  it("physically demanding + under 30 minutes -> moderately_active", () => {
    expect(deriveActivityLevel({ dailyMovementLevel: "physically_demanding", weeklyModerateActivity: "under_30" })).toBe("moderately_active");
  });

  it("physically demanding + 150-299 minutes -> very_active", () => {
    expect(deriveActivityLevel({ dailyMovementLevel: "physically_demanding", weeklyModerateActivity: "150_to_299" })).toBe("very_active");
  });

  it("both answers not sure -> documented conservative fallback (lightly_active)", () => {
    expect(deriveActivityLevel({ dailyMovementLevel: "not_sure", weeklyModerateActivity: "not_sure" })).toBe("lightly_active");
  });

  it("updating either answer recomputes the derived category", () => {
    const before = deriveActivityLevel({ dailyMovementLevel: "mostly_seated", weeklyModerateActivity: "under_30" });
    const afterDailyChange = deriveActivityLevel({ dailyMovementLevel: "physically_demanding", weeklyModerateActivity: "under_30" });
    const afterWeeklyChange = deriveActivityLevel({ dailyMovementLevel: "mostly_seated", weeklyModerateActivity: "300_plus" });
    expect(before).toBe("not_active");
    expect(afterDailyChange).not.toBe(before);
    expect(afterWeeklyChange).not.toBe(before);
  });

  // Additional coverage beyond the required 10 cases, for the remaining
  // branches described in the spec.
  it("mixed light movement + not sure weekly activity defaults conservatively to lightly_active", () => {
    expect(deriveActivityLevel({ dailyMovementLevel: "mixed_light_movement", weeklyModerateActivity: "not_sure" })).toBe("lightly_active");
  });

  it("moving several hours + not sure weekly activity -> lightly_active minimum", () => {
    expect(deriveActivityLevel({ dailyMovementLevel: "moving_several_hours", weeklyModerateActivity: "not_sure" })).toBe("lightly_active");
  });

  it("physically demanding + not sure weekly activity -> moderately_active minimum", () => {
    expect(deriveActivityLevel({ dailyMovementLevel: "physically_demanding", weeklyModerateActivity: "not_sure" })).toBe("moderately_active");
  });

  it("physically demanding + 90-149 minutes does not over-escalate to very_active", () => {
    expect(deriveActivityLevel({ dailyMovementLevel: "physically_demanding", weeklyModerateActivity: "90_to_149" })).toBe("moderately_active");
  });

  it("not sure daily movement uses weekly activity as primary signal", () => {
    expect(deriveActivityLevel({ dailyMovementLevel: "not_sure", weeklyModerateActivity: "300_plus" })).toBe("very_active");
  });
});

describe("mapDerivedToLegacyActivityLevel", () => {
  it("renames not_active to the legacy mostly_sitting literal", () => {
    expect(mapDerivedToLegacyActivityLevel("not_active")).toBe("mostly_sitting");
  });

  it("passes every other value through unchanged", () => {
    expect(mapDerivedToLegacyActivityLevel("lightly_active")).toBe("lightly_active");
    expect(mapDerivedToLegacyActivityLevel("moderately_active")).toBe("moderately_active");
    expect(mapDerivedToLegacyActivityLevel("very_active")).toBe("very_active");
  });
});
