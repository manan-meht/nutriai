/**
 * Embeds every approved coaching_suggestions row that doesn't have an
 * embedding yet.
 *
 * Migration 0054 seeds the corpus from the reviewer's existing rewrites but
 * cannot embed them — that needs an HTTP call per row, which has no place in
 * a migration. Until this runs, every row has a null embedding and is
 * invisible to match_coaching_suggestions, so retrieval finds nothing and
 * every caller falls back to the rule engine. That is a safe state to sit
 * in, not a broken one.
 *
 * Safe to re-run: only rows with a null embedding are touched.
 *
 *   npx tsx scripts/backfill-suggestion-embeddings.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";
import { embedText, mealEmbeddingText, EMBEDDING_MODEL } from "../src/lib/rag/embeddings";

function loadEnv() {
  // The repo has no dotenv wired into scripts (see scripts/backfill-trials.ts),
  // so .env.local is parsed directly.
  const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    if (!line.includes("=") || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

interface Row {
  id: string;
  suggestion_text: string;
  protein_anchor_status: string | null;
  vegetable_fiber_status: string | null;
  carb_status: string | null;
  meal_balance_status: string | null;
}

async function main() {
  loadEnv();
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data, error } = await db
    .from("coaching_suggestions")
    .select("id, suggestion_text, protein_anchor_status, vegetable_fiber_status, carb_status, meal_balance_status")
    .is("embedding", null)
    .is("archived_at", null);

  if (error) throw new Error(`Failed to read corpus: ${error.message}`);
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) {
    console.log("Nothing to embed — every corpus row already has an embedding.");
    return;
  }

  console.log(`Embedding ${rows.length} suggestion(s) with ${EMBEDDING_MODEL}...`);
  let ok = 0;
  let failed = 0;

  for (const row of rows) {
    // Embedded the same way a query is (see mealEmbeddingText's doc): the
    // corpus and the query must share one phrasing or similarity silently
    // degrades. The suggestion text itself is appended because the meal
    // shape alone is too coarse to separate entries that share a shape but
    // give different advice.
    const text = `${mealEmbeddingText({
      foods: [],
      proteinAnchorStatus: row.protein_anchor_status,
      vegetableFiberStatus: row.vegetable_fiber_status,
      carbStatus: row.carb_status,
      mealBalanceStatus: row.meal_balance_status,
    })} — ${row.suggestion_text}`;

    const embedding = await embedText(text);
    if (!embedding) {
      failed++;
      console.warn(`  ✗ ${row.id} — embedding failed, leaving null (will retry on next run)`);
      continue;
    }

    const { error: updateError } = await db
      .from("coaching_suggestions")
      .update({ embedding, embedding_model: EMBEDDING_MODEL, embedded_at: new Date().toISOString() })
      .eq("id", row.id);

    if (updateError) {
      failed++;
      console.warn(`  ✗ ${row.id} — write failed: ${updateError.message}`);
      continue;
    }
    ok++;
  }

  console.log(`\nEmbedded ${ok}, failed ${failed}.`);
  if (failed > 0) {
    console.log("Re-run to retry the failures — only null-embedding rows are touched.");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
