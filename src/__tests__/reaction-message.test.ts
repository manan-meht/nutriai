import { buildReactionMessage } from "@/lib/whatsapp/reaction-message";

describe("buildReactionMessage", () => {
  it("names the caregiver, the specific meal, and the emoji", () => {
    const msg = buildReactionMessage({ caregiverName: "Manan", mealLabel: "lunch", emoji: "🎉" });
    expect(msg).toBe("Manan saw your lunch and sent you a 🎉 😊");
  });

  it("handles an emoji outside the known set without breaking", () => {
    const msg = buildReactionMessage({ caregiverName: "Manan", mealLabel: "dinner", emoji: "🔥" });
    expect(msg).toContain("🔥");
    expect(msg).toContain("dinner");
  });

  // The copy must be attention, never judgment — no food evaluation words
  // can creep into this template (a reaction to cake and to dal must read
  // identically warm).
  it("contains no evaluative language", () => {
    const msg = buildReactionMessage({ caregiverName: "Asha", mealLabel: "snack", emoji: "👍" });
    expect(msg.toLowerCase()).not.toMatch(/healthy|unhealthy|good|bad|should/);
  });
});
