// Regression coverage for resolveMealLabel (src/lib/ai/food-analyzer.ts):
// the model's own breakfast/lunch/dinner/snack guess used to be trusted
// outright, even though the vision prompt is never told the current time —
// so a plate photographed at 9:15pm could get saved as "lunch" purely
// because the model guessed wrong. Time of day must now be authoritative
// for the four standard meal types; only drink identification (tea vs
// coffee vs wine vs juice) is a real visual signal worth trusting.

import { resolveMealLabel } from "@/lib/ai/food-analyzer";

const KOLKATA = "Asia/Kolkata";

describe("resolveMealLabel — clock overrides the model's own guess", () => {
  it("resolves to dinner at 9:15pm even when the model guessed lunch", () => {
    const at9_15pm = new Date("2026-07-09T15:45:00.000Z"); // 21:15 IST
    expect(resolveMealLabel("lunch", at9_15pm, KOLKATA)).toBe("dinner");
  });

  it("resolves to breakfast at 8am even when the model guessed dinner", () => {
    const at8am = new Date("2026-07-09T02:30:00.000Z"); // 08:00 IST
    expect(resolveMealLabel("dinner", at8am, KOLKATA)).toBe("breakfast");
  });

  it("resolves to lunch at 1pm regardless of the model's guess", () => {
    const at1pm = new Date("2026-07-09T07:30:00.000Z"); // 13:00 IST
    expect(resolveMealLabel("snack", at1pm, KOLKATA)).toBe("lunch");
  });

  it("resolves to snack in the mid-afternoon gap", () => {
    const at4pm = new Date("2026-07-09T10:30:00.000Z"); // 16:00 IST
    expect(resolveMealLabel("lunch", at4pm, KOLKATA)).toBe("snack");
  });

  it("still trusts the model for drink identification, regardless of time", () => {
    const at9_15pm = new Date("2026-07-09T15:45:00.000Z"); // 21:15 IST — dinner hours
    expect(resolveMealLabel("tea", at9_15pm, KOLKATA)).toBe("tea");
    expect(resolveMealLabel("wine", at9_15pm, KOLKATA)).toBe("wine");
  });

  it("respects a different contact timezone rather than always assuming Asia/Kolkata", () => {
    // 21:15 IST is only 15:45 UTC, i.e. still afternoon in US/Pacific (~8:45am)
    // — same instant, different local meal-time depending on the contact's zone.
    const instant = new Date("2026-07-09T15:45:00.000Z");
    expect(resolveMealLabel("dinner", instant, "America/Los_Angeles")).toBe("breakfast");
  });
});
