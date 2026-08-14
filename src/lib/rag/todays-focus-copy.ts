import type { SupabaseClient } from "@supabase/supabase-js";
import type { TodaysFocusCandidate } from "@/lib/food-balance/todays-focus";
import { isRecommendationSafe } from "@/lib/food-balance/safety";
import { retrieveSuggestions, type RetrievedSuggestion } from "./coaching-suggestions";

// Reviewer-grounded rewording for the "Today's focus" line.
//
// todays-focus.ts is deliberately deterministic: WHAT to recommend (category
// selection, ranking, repetition, restriction filtering) is never a model
// decision, and that stays true here. This module only rewords the chosen
// candidate's hand-authored template into the nutrition reviewer's voice,
// using their approved coaching lines as few-shot examples — and any
// failure, low-similarity retrieval, or safety-check miss returns null so
// the caller keeps the template verbatim.
//
// Kept separate from todays-focus.ts so that module stays pure/synchronous
// (its unit tests exercise the decision pipeline without any network), and
// dependency-light for the cron route's Worker bundle: plain fetch, no
// Gemini SDK (see src/lib/rag/embeddings.ts's module comment).

const GENERATE_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const GENERATION_MODEL = "gemini-3.5-flash-lite";

/** Only categories whose corpus analog is direct — the reviewer's lines are
 * per-meal coaching about protein/vegetables/fiber balance, so those are
 * the categories where their voice transfers cleanly. Everything else
 * (calorie adequacy, single-high-day, diversity, insufficient-data) keeps
 * its hand-authored template: calorie/compensation wording in particular is
 * exactly what the feature spec says must never drift. */
const UPGRADEABLE: Partial<Record<TodaysFocusCandidate["category"], { proteinAnchorStatus?: string; vegetableFiberStatus?: string }>> = {
  protein_low: { proteinAnchorStatus: "missing" },
  protein_late_day: { proteinAnchorStatus: "partial" },
  low_fiber: { vegetableFiberStatus: "missing" },
  low_fruit_veg: { vegetableFiberStatus: "missing" },
};

function buildPrompt(candidate: TodaysFocusCandidate, examples: RetrievedSuggestion[]): string {
  const exampleLines = examples.map((e) => `- "${e.suggestionText}"`).join("\n");
  return `You reword a short morning nutrition tip for a WhatsApp reminder in a nutrition app for Indian users.

These lines were written and approved by our nutrition reviewer. Match their tone:
${exampleLines}

Original tip (its meaning, food examples, and any hedging like "may" or "suggest" must be preserved exactly — you are ONLY adjusting tone and phrasing):
"${candidate.message}"

Rules:
- One or two sentences, 30 words maximum.
- Keep every specific food the original mentions. Do not add new claims, numbers, or foods.
- Warm and non-judgmental. Never use "bad food", "cheat meal", "unhealthy", "failed", or "poor choice".
- Output only the reworded tip, no quotes, no preamble.`;
}

/**
 * Rewords the chosen candidate's message in the reviewer's voice, or
 * returns null to keep the hand-authored template. Never throws.
 *
 * Runs in the morning-reminder cron, so there is no latency budget to
 * protect — but there IS a safety budget: the output must pass the same
 * isRecommendationSafe gate the templates do, plus a length cap.
 */
export async function upgradeTodaysFocusCopy(
  admin: SupabaseClient,
  candidate: TodaysFocusCandidate
): Promise<string | null> {
  try {
    const shape = UPGRADEABLE[candidate.category];
    if (!shape) return null;

    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key) return null;

    const retrieved = await retrieveSuggestions(admin, { foods: [], ...shape });
    if (retrieved.length < 2) return null; // too little tone signal to be worth rewording

    const res = await fetch(`${GENERATE_ENDPOINT}/${GENERATION_MODEL}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(candidate, retrieved) }] }],
        generationConfig: { maxOutputTokens: 80, temperature: 0.3 },
      }),
    });
    if (!res.ok) return null;

    const body = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) return null;

    const cleaned = text.replace(/^["'\s]+|["'\s]+$/g, "").split("\n")[0];
    // Hard bounds: a runaway or truncated-feeling line keeps the template.
    if (!cleaned || cleaned.length < 20 || cleaned.length > 220) return null;
    if (!isRecommendationSafe({ description: cleaned })) return null;

    return cleaned;
  } catch {
    return null;
  }
}
