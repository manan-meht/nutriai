import type { SupabaseClient } from "@supabase/supabase-js";
import { embedText, mealEmbeddingText, EMBEDDING_DIMENSIONS } from "./embeddings";

// Retrieval-augmented coaching suggestions.
//
// Replaces the six hardcoded strings in dashboard-core's classifyMeal with
// copy grounded in what the nutrition reviewer actually approved. The rule
// engine remains the fallback on every failure path — a coaching line is a
// nice-to-have, and no part of this is worth failing a meal save over.

const GENERATE_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/** Deliberately not the 2.5-flash used for photo analysis: measured at
 * ~2.9s for this prompt versus ~0.9s here, for a task that is one short
 * sentence conditioned on retrieved examples. */
const GENERATION_MODEL = "gemini-3.5-flash-lite";

/** Five gives the model enough of a tone signal without the prompt growing
 * enough to matter — measured at ~500 chars, whose latency cost against a
 * 15k-char prompt was within run-to-run noise. */
const RETRIEVE_COUNT = 5;

/** Below this cosine similarity the retrieved copy is about a meaningfully
 * different meal, and using it as a tone example does more harm than the
 * rule-engine fallback. */
const MIN_SIMILARITY = 0.55;

export interface RetrievedSuggestion {
  id: string;
  suggestionText: string;
  similarity: number;
}

export interface MealShape {
  foods: string[];
  mealType?: string | null;
  proteinAnchorStatus?: string | null;
  vegetableFiberStatus?: string | null;
  carbStatus?: string | null;
  mealBalanceStatus?: string | null;
}

export type SuggestionSource = "rules" | "retrieved" | "generated";

export interface SuggestionResult {
  text: string;
  source: SuggestionSource;
  /** What retrieval returned, for the admin console and for debugging why a
   * given line was produced. Empty when retrieval found nothing. */
  retrieved: RetrievedSuggestion[];
}

/**
 * Nearest approved coaching lines for a meal. Returns [] on any failure —
 * an empty corpus, a missing embedding, a database error — so callers treat
 * "no matches" and "retrieval unavailable" identically and fall back.
 */
export async function retrieveSuggestions(
  admin: SupabaseClient,
  meal: MealShape,
  matchCount: number = RETRIEVE_COUNT
): Promise<RetrievedSuggestion[]> {
  const embedding = await embedText(mealEmbeddingText(meal));
  if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) return [];

  try {
    const { data, error } = await admin.rpc("match_coaching_suggestions", {
      query_embedding: embedding,
      match_count: matchCount,
      min_similarity: MIN_SIMILARITY,
    });
    if (error) {
      console.error("[rag] match_coaching_suggestions failed:", error.message);
      return [];
    }
    return (data ?? []).map((row: { id: string; suggestion_text: string; similarity: number }) => ({
      id: row.id,
      suggestionText: row.suggestion_text,
      similarity: row.similarity,
    }));
  } catch (err) {
    console.error("[rag] retrieval failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

function buildPrompt(meal: MealShape, examples: RetrievedSuggestion[]): string {
  const exampleLines = examples.map((e) => `- "${e.suggestionText}"`).join("\n");
  const shape = [
    meal.proteinAnchorStatus && `protein ${meal.proteinAnchorStatus}`,
    meal.vegetableFiberStatus && `vegetables ${meal.vegetableFiberStatus}`,
    meal.carbStatus && `carbs ${meal.carbStatus}`,
    meal.mealBalanceStatus && `overall balance ${meal.mealBalanceStatus}`,
  ]
    .filter(Boolean)
    .join(", ");

  // The tone rules mirror the reviewer-facing guidance in ReviewForm, so
  // generated copy is held to the same bar the human corrections were.
  return `You write a single short coaching line for a meal someone just logged in a nutrition app for Indian users.

These lines were written and approved by our nutrition reviewer. Match their tone and length:
${exampleLines}

Rules:
- One sentence, 20 words maximum.
- Warm and non-judgmental. Never use "bad food", "cheat meal", "unhealthy", "failed", or "poor choice".
- Acknowledge what is already good before suggesting anything.
- Suggest at most one concrete addition, using foods common in Indian households.
- Output only the line itself, with no quotes and no preamble.

Meal: ${meal.foods.join(", ") || "unknown"}${shape ? `\nAssessment: ${shape}` : ""}`;
}

/** Generates a line from the retrieved examples. Null on any failure, so
 * the caller falls back to the highest-similarity retrieved line and then
 * to the rule engine. */
async function generateFromExamples(meal: MealShape, examples: RetrievedSuggestion[]): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) return null;

  try {
    const res = await fetch(`${GENERATE_ENDPOINT}/${GENERATION_MODEL}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(meal, examples) }] }],
        generationConfig: { maxOutputTokens: 60, temperature: 0.4 },
      }),
    });
    if (!res.ok) {
      console.error("[rag] generation failed:", res.status, (await res.text().catch(() => "")).slice(0, 200));
      return null;
    }
    const body = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) return null;

    // Strip quotes the model sometimes wraps the line in despite the
    // instruction, and hard-cap length so a runaway response can't reach a
    // user — the rule-engine lines it replaces are all one short sentence.
    const cleaned = text.replace(/^["'\s]+|["'\s]+$/g, "").split("\n")[0];
    if (!cleaned || cleaned.length > 200) return null;
    return cleaned;
  } catch (err) {
    console.error("[rag] generation failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * The full retrieve-then-generate path, with two fallbacks beneath it:
 * generation failure falls back to the closest approved line verbatim, and
 * retrieval finding nothing falls back to `rulesFallback` — the existing
 * classifyMeal output, which is always available.
 *
 * Never throws. Callers on the WhatsApp path run this *after* replying to
 * the user (see notifyCoachingSuggestion), so its ~1.4s costs the user
 * nothing; the cron paths have no latency budget at all.
 */
export async function buildCoachingSuggestion(
  admin: SupabaseClient,
  meal: MealShape,
  rulesFallback: string
): Promise<SuggestionResult> {
  const retrieved = await retrieveSuggestions(admin, meal);
  if (retrieved.length === 0) {
    return { text: rulesFallback, source: "rules", retrieved: [] };
  }

  const generated = await generateFromExamples(meal, retrieved);
  if (generated) {
    return { text: generated, source: "generated", retrieved };
  }

  return { text: retrieved[0].suggestionText, source: "retrieved", retrieved };
}
