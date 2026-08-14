// The reviewer-voice rewording of Today's Focus can only ever improve
// phrasing — every failure or guard must return null so the cron route
// keeps the hand-authored template. These tests pin down each of those
// exits; the decision pipeline itself (what to recommend) is untouched by
// this module and covered by todays-focus.test.ts.

const mockRetrieve = jest.fn();
jest.mock("@/lib/rag/coaching-suggestions", () => {
  const actual = jest.requireActual("@/lib/rag/coaching-suggestions");
  return { ...actual, retrieveSuggestions: (...args: unknown[]) => mockRetrieve(...args) };
});

import { upgradeTodaysFocusCopy } from "@/lib/rag/todays-focus-copy";
import type { TodaysFocusCandidate } from "@/lib/food-balance/todays-focus";

const CANDIDATE: TodaysFocusCandidate = {
  category: "protein_low",
  tier: 3,
  confidence: "high",
  persistenceDays: 4,
  messageVariant: "protein_low_direct",
  message: "Protein has been below your target on several recent days. Try adding dal, eggs, or paneer to breakfast or lunch today.",
  suggestedFoodIds: [],
  supportingMetrics: {},
};

const EXAMPLES = [
  { id: "a", suggestionText: "Good protein here — add a salad.", similarity: 0.8 },
  { id: "b", suggestionText: "Nice balance, keep the dal coming.", similarity: 0.7 },
];

const db = {} as any;
const originalFetch = global.fetch;

function mockGeneration(text: string) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
  }) as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRetrieve.mockResolvedValue(EXAMPLES);
  process.env.GEMINI_API_KEY = "test-key";
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("upgradeTodaysFocusCopy", () => {
  it("rewords an upgradeable category when everything succeeds", async () => {
    mockGeneration("Protein has been running low lately — try dal, eggs, or paneer with breakfast today.");
    const result = await upgradeTodaysFocusCopy(db, CANDIDATE);
    expect(result).toContain("dal");
  });

  it("returns null for categories without a corpus analog (calorie wording must never drift)", async () => {
    const result = await upgradeTodaysFocusCopy(db, { ...CANDIDATE, category: "calories_high" });
    expect(result).toBeNull();
    expect(mockRetrieve).not.toHaveBeenCalled();
  });

  it("returns null when retrieval finds too few examples for a tone signal", async () => {
    mockRetrieve.mockResolvedValue([EXAMPLES[0]]);
    expect(await upgradeTodaysFocusCopy(db, CANDIDATE)).toBeNull();
  });

  it("returns null when generation fails, keeping the template", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 }) as any;
    expect(await upgradeTodaysFocusCopy(db, CANDIDATE)).toBeNull();
  });

  it("returns null on a runaway generation", async () => {
    mockGeneration("x".repeat(500));
    expect(await upgradeTodaysFocusCopy(db, CANDIDATE)).toBeNull();
  });

  it("returns null when the reworded line trips the safety filter", async () => {
    // isRecommendationSafe bans prescriptive "you must" framing (see
    // BANNED_PHRASES in food-balance/safety.ts) — a reworded line that
    // drifts into it must never reach a user.
    mockGeneration("You must add dal or eggs to breakfast today to hit your protein.");
    expect(await upgradeTodaysFocusCopy(db, CANDIDATE)).toBeNull();
  });

  it("never throws even when retrieval itself blows up", async () => {
    mockRetrieve.mockRejectedValue(new Error("connection reset"));
    await expect(upgradeTodaysFocusCopy(db, CANDIDATE)).resolves.toBeNull();
  });
});
