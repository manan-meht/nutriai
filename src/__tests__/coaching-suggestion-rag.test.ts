// The retrieval path replaces a rule engine that always produced *something*.
// Its most important property is therefore that it degrades to that engine
// on every failure — an empty corpus, a dead embedding API, a database
// error, a bad generation — rather than leaving a meal with no coaching line.

const mockEmbedText = jest.fn();
jest.mock("@/lib/rag/embeddings", () => {
  const actual = jest.requireActual("@/lib/rag/embeddings");
  return { ...actual, embedText: (...args: unknown[]) => mockEmbedText(...args) };
});

import { buildCoachingSuggestion, retrieveSuggestions } from "@/lib/rag/coaching-suggestions";
import { mealEmbeddingText, EMBEDDING_DIMENSIONS } from "@/lib/rag/embeddings";

const RULES = "Good protein here — add one vegetable, salad, or fruit to round it out.";
const MEAL = {
  foods: ["Chicken curry", "Rice"],
  mealType: "lunch",
  proteinAnchorStatus: "present",
  vegetableFiberStatus: "missing",
  carbStatus: "present",
  mealBalanceStatus: "moderate",
};

function dbReturning(rows: unknown[] | null, error: { message: string } | null = null) {
  return { rpc: jest.fn().mockResolvedValue({ data: rows, error }) } as any;
}

const originalFetch = global.fetch;

beforeEach(() => {
  jest.clearAllMocks();
  mockEmbedText.mockResolvedValue(new Array(EMBEDDING_DIMENSIONS).fill(0.01));
  process.env.GEMINI_API_KEY = "test-key";
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("retrieveSuggestions", () => {
  it("returns [] when the embedding call fails, so callers fall back", async () => {
    mockEmbedText.mockResolvedValue(null);
    const db = dbReturning([]);
    expect(await retrieveSuggestions(db, MEAL)).toEqual([]);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("returns [] when the database errors rather than surfacing it", async () => {
    const db = dbReturning(null, { message: "relation does not exist" });
    expect(await retrieveSuggestions(db, MEAL)).toEqual([]);
  });

  it("maps rpc rows into retrieved suggestions", async () => {
    const db = dbReturning([{ id: "a", suggestion_text: "Nice balance.", similarity: 0.82 }]);
    expect(await retrieveSuggestions(db, MEAL)).toEqual([
      { id: "a", suggestionText: "Nice balance.", similarity: 0.82 },
    ]);
  });
});

describe("buildCoachingSuggestion", () => {
  it("falls back to the rule engine when the corpus is empty", async () => {
    const result = await buildCoachingSuggestion(dbReturning([]), MEAL, RULES);
    expect(result).toEqual({ text: RULES, source: "rules", retrieved: [] });
  });

  it("falls back to the rule engine when embedding is unavailable", async () => {
    mockEmbedText.mockResolvedValue(null);
    const result = await buildCoachingSuggestion(dbReturning([]), MEAL, RULES);
    expect(result.source).toBe("rules");
    expect(result.text).toBe(RULES);
  });

  it("returns generated copy when retrieval and generation both succeed", async () => {
    const db = dbReturning([{ id: "a", suggestion_text: "Good protein — add a salad.", similarity: 0.9 }]);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: "Nice protein — add some greens." }] } }] }),
    }) as any;

    const result = await buildCoachingSuggestion(db, MEAL, RULES);
    expect(result.source).toBe("generated");
    expect(result.text).toBe("Nice protein — add some greens.");
    expect(result.retrieved).toHaveLength(1);
  });

  it("falls back to the closest approved line when generation fails", async () => {
    const db = dbReturning([{ id: "a", suggestion_text: "Good protein — add a salad.", similarity: 0.9 }]);
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, text: async () => "unavailable" }) as any;

    const result = await buildCoachingSuggestion(db, MEAL, RULES);
    expect(result.source).toBe("retrieved");
    expect(result.text).toBe("Good protein — add a salad.");
  });

  it("falls back rather than emitting a runaway generation", async () => {
    const db = dbReturning([{ id: "a", suggestion_text: "Good protein — add a salad.", similarity: 0.9 }]);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: "x".repeat(500) }] } }] }),
    }) as any;

    const result = await buildCoachingSuggestion(db, MEAL, RULES);
    expect(result.source).toBe("retrieved");
  });

  it("strips quotes the model wraps around the line despite being told not to", async () => {
    const db = dbReturning([{ id: "a", suggestion_text: "Good protein — add a salad.", similarity: 0.9 }]);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '"Add a side of greens."' }] } }] }),
    }) as any;

    const result = await buildCoachingSuggestion(db, MEAL, RULES);
    expect(result.text).toBe("Add a side of greens.");
  });

  it("never throws, even when the database client itself blows up", async () => {
    const db = { rpc: jest.fn().mockRejectedValue(new Error("connection reset")) } as any;
    await expect(buildCoachingSuggestion(db, MEAL, RULES)).resolves.toMatchObject({ source: "rules", text: RULES });
  });
});

describe("mealEmbeddingText", () => {
  // Corpus rows and live queries are embedded through this one function on
  // purpose — embedding one side with a different phrasing degrades
  // similarity silently, and nothing would ever surface the regression.
  it("includes foods and the meal's assessed shape", () => {
    const text = mealEmbeddingText(MEAL);
    expect(text).toContain("Chicken curry, Rice");
    expect(text).toContain("protein present");
    expect(text).toContain("vegetables missing");
    expect(text).toContain("balance moderate");
  });

  it("omits absent fields instead of emitting empty fragments", () => {
    expect(mealEmbeddingText({ foods: ["Idli"] })).toBe("Idli");
  });
});
