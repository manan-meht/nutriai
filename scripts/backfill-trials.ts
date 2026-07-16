/**
 * One-time, idempotent migration script for existing users (spec §19).
 *
 * WHAT THIS DOES
 * For every workspace that already has at least one family member / client
 * (i.e. was actually being used before this trial/entitlement feature
 * existed) and does NOT yet have an entitlement row, this creates one with
 * status="trialing", dated from FEATURE_ACTIVATION_DATE (or "now" if unset)
 * — not from whenever this script happens to run, and not from whenever
 * the workspace was originally created. This is the "safest implementation"
 * called for in the spec: a single, deliberately-chosen activation instant
 * that every existing user's trial is measured from, decided once and
 * documented (see MIGRATION DECISION below), rather than each workspace
 * getting a different backdated start time.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * - Does not touch workspaces with zero contacts/clients — those are
 *   either genuinely new and empty, or unused; startTrialIfNeeded() already
 *   starts their trial correctly on first real use, per the normal (non-
 *   migration) product flow.
 * - Does not touch workspaces that already have an entitlement row —
 *   existing trials/paid subscriptions are left completely alone.
 * - Never deletes or modifies any adults_contacts / gym_clients / meal_logs
 *   / goals rows. This script only ever inserts new entitlements rows.
 * - Is never invoked automatically by the app, a cron job, or the test
 *   suite — it must be run manually, once, by an operator who has set
 *   FEATURE_ACTIVATION_DATE deliberately.
 *
 * MIGRATION DECISION
 * Trial start = FEATURE_ACTIVATION_DATE (UTC), or the instant this script
 * runs if that env var is unset. Set FEATURE_ACTIVATION_DATE to an ISO
 * timestamp *before* running this against production, so every existing
 * user's 14-day clock starts from the same, intentional moment (e.g. your
 * announced launch date) rather than silently drifting to "whenever
 * someone happened to run the script."
 *
 * USAGE
 *   FEATURE_ACTIVATION_DATE=2026-08-01T00:00:00.000Z \
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/backfill-trials.ts
 *
 * Safe to re-run: already-backfilled workspaces are skipped (upsert with
 * ignoreDuplicates on the (workspace_id, module) unique constraint), so
 * running it twice is a no-op the second time.
 */

import { createClient } from "@supabase/supabase-js";

const TRIAL_LENGTH_MS = 14 * 24 * 60 * 60 * 1000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

function activationDate(): Date {
  const raw = process.env.FEATURE_ACTIVATION_DATE;
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    throw new Error(`FEATURE_ACTIVATION_DATE is not a valid date: ${raw}`);
  }
  console.warn(
    "[backfill-trials] FEATURE_ACTIVATION_DATE is not set — using the current instant. " +
    "For a production run, set it explicitly so every existing user's trial starts from the same deliberate moment."
  );
  return new Date();
}

async function backfillModule(
  // Untyped (no generated Database type available in this standalone
  // script context) — deliberately loose here, this is an operational
  // migration script, not app runtime code.
  admin: any,
  moduleName: "adults" | "gym",
  memberTable: "adults_contacts" | "gym_clients",
  startedAt: Date,
  endsAt: Date
) {
  const { data: workspaces, error: workspacesError } = await admin
    .from("workspaces")
    .select("id, owner_id")
    .eq("type", moduleName);
  if (workspacesError) throw new Error(`Failed to list ${moduleName} workspaces: ${workspacesError.message}`);
  if (!workspaces?.length) return { candidates: 0, backfilled: 0 };

  const workspaceIds = workspaces.map((w: any) => w.id);

  // Only workspaces with at least one member/client row (active or
  // removed — either way, this workspace was genuinely used already).
  const { data: memberRows } = await admin
    .from(memberTable)
    .select("workspace_id")
    .in("workspace_id", workspaceIds);
  const usedWorkspaceIds = new Set((memberRows ?? []).map((r: any) => r.workspace_id));

  // Skip workspaces that already have an entitlement row.
  const { data: existingEntitlements } = await admin
    .from("entitlements")
    .select("workspace_id")
    .eq("module", moduleName)
    .in("workspace_id", Array.from(usedWorkspaceIds));
  const alreadyHasEntitlement = new Set((existingEntitlements ?? []).map((r: any) => r.workspace_id));

  const candidates = workspaces.filter((w: any) => usedWorkspaceIds.has(w.id) && !alreadyHasEntitlement.has(w.id));
  if (candidates.length === 0) return { candidates: 0, backfilled: 0 };

  const rows = candidates.map((w: any) => ({
    workspace_id: w.id,
    owner_id: w.owner_id,
    module: moduleName,
    status: "trialing",
    trial_start_at: startedAt.toISOString(),
    trial_end_at: endsAt.toISOString(),
  }));

  const { error: insertError } = await admin
    .from("entitlements")
    .upsert(rows, { onConflict: "workspace_id,module", ignoreDuplicates: true });
  if (insertError) throw new Error(`Failed to backfill ${moduleName} entitlements: ${insertError.message}`);

  return { candidates: candidates.length, backfilled: rows.length };
}

async function main() {
  const admin = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  );

  const startedAt = activationDate();
  const endsAt = new Date(startedAt.getTime() + TRIAL_LENGTH_MS);
  console.log(`[backfill-trials] Trial window: ${startedAt.toISOString()} -> ${endsAt.toISOString()}`);

  const family = await backfillModule(admin, "adults", "adults_contacts", startedAt, endsAt);
  console.log(`[backfill-trials] Family: ${family.backfilled} workspace(s) backfilled (of ${family.candidates} candidates).`);

  const coaching = await backfillModule(admin, "gym", "gym_clients", startedAt, endsAt);
  console.log(`[backfill-trials] Coaching: ${coaching.backfilled} workspace(s) backfilled (of ${coaching.candidates} candidates).`);

  console.log("[backfill-trials] Done. No existing data was modified or deleted.");
}

main().catch((err) => {
  console.error("[backfill-trials] Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
