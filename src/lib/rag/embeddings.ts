// Embedding generation for the coaching-suggestion retrieval corpus.
//
// Plain fetch against Gemini's REST API rather than @google/generative-ai —
// the SDK is already imported at module scope by food-analyzer.ts, and this
// module is imported by the cron route that deliberately avoids that import
// to keep its Cloudflare Worker bundle under the 25 MiB Pages Functions
// limit (see the note at the top of send-meal-reminders/route.ts). A single
// JSON POST is all this needs.

const EMBED_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/** Must match coaching_suggestions.embedding's declared dimensions (see
 * migration 0054). gemini-embedding-001 defaults to 3072, which pgvector
 * cannot index — its limit is 2000 — and which measured ~70% slower to
 * generate (938ms vs 547ms). 768 is ample for a corpus of short coaching
 * lines. Changing this requires re-embedding the whole corpus AND altering
 * the column type, so it is deliberately a single exported constant. */
export const EMBEDDING_DIMENSIONS = 768;
export const EMBEDDING_MODEL = "gemini-embedding-001";

function apiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
}

/**
 * Embeds a single string. Returns null rather than throwing on any failure —
 * every caller treats "no embedding" as "no retrieval", falling back to the
 * rule engine, which is always a correct (if less good) answer. A coaching
 * line is never worth failing a meal save over.
 */
export async function embedText(text: string): Promise<number[] | null> {
  const key = apiKey();
  if (!key) {
    console.error("[rag] no Gemini API key configured; skipping embedding");
    return null;
  }
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    const res = await fetch(`${EMBED_ENDPOINT}/${EMBEDDING_MODEL}:embedContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text: trimmed }] },
        outputDimensionality: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!res.ok) {
      console.error("[rag] embedding request failed:", res.status, (await res.text().catch(() => "")).slice(0, 200));
      return null;
    }

    const body = (await res.json()) as { embedding?: { values?: number[] } };
    const values = body.embedding?.values;
    if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
      console.error("[rag] embedding response had unexpected shape:", values?.length);
      return null;
    }
    return values;
  } catch (err) {
    console.error("[rag] embedding failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * The text a meal is embedded as, for both corpus entries and queries.
 * Exported and shared by both sides on purpose: embedding the corpus with
 * one phrasing and querying with another silently degrades similarity, and
 * that failure is invisible — it just returns slightly worse matches
 * forever. Keeping one function means the two can't drift.
 */
export function mealEmbeddingText(input: {
  foods: string[];
  mealType?: string | null;
  proteinAnchorStatus?: string | null;
  vegetableFiberStatus?: string | null;
  carbStatus?: string | null;
  mealBalanceStatus?: string | null;
}): string {
  const parts: string[] = [];
  if (input.foods.length) parts.push(input.foods.join(", "));
  if (input.mealType) parts.push(`${input.mealType} meal`);
  if (input.proteinAnchorStatus) parts.push(`protein ${input.proteinAnchorStatus}`);
  if (input.vegetableFiberStatus) parts.push(`vegetables ${input.vegetableFiberStatus}`);
  if (input.carbStatus) parts.push(`carbs ${input.carbStatus}`);
  if (input.mealBalanceStatus) parts.push(`balance ${input.mealBalanceStatus}`);
  return parts.join(" — ");
}
