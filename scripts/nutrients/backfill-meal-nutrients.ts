/**
 * Estimates vitamins and minerals for meals logged before micronutrient
 * tracking, from the foods already stored with each meal. No model calls,
 * no photo re-reads. See src/lib/nutrients/backfill.ts.
 *
 * Dry run by default: it reads, estimates and prints counts, and writes
 * nothing. Writing needs --write. At most 500 meals per run (newest first);
 * meals that already have an estimate are skipped, so re-run to continue.
 * Prints counts only, never food names or anyone's details.
 *
 * Needs migration 0071 applied to the target database.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/nutrients/backfill-meal-nutrients.ts [--contact <adults_contacts id> | --client <gym_clients id>] \
 *     [--limit 200] [--since 2026-10-01] [--write]
 *
 * Without --contact or --client it covers everyone's meals: use one of them
 * to try it on a single profile.
 */
import { createClient } from "@supabase/supabase-js";

import { BACKFILL_HARD_LIMIT, backfillMealNutrients } from "../../src/lib/nutrients/backfill";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  const limit = Math.min(Number(arg("limit") ?? 100), BACKFILL_HARD_LIMIT);
  const since = arg("since");
  const dryRun = !process.argv.includes("--write");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const contact = arg("contact");
  const client = arg("client");
  const subject = contact ? { contactType: "adults" as const, contactId: contact } : client ? { contactType: "gym" as const, contactId: client } : undefined;
  const result = await backfillMealNutrients(db, {
    limit,
    dryRun,
    sinceIso: since ? new Date(since).toISOString() : undefined,
    subject,
  });
  console.log(JSON.stringify(result, null, 2));
  if (dryRun) console.log("Dry run: nothing written. Add --write to store these estimates.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "backfill failed");
  process.exit(1);
});
