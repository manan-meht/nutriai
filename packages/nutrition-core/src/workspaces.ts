import type { SupabaseClient } from "@supabase/supabase-js";

export interface WorkspaceSummary {
  id: string;
  name: string;
  extraCapacity: number;
  /** Only set for "adults" workspaces — "family" vs "self" plan. */
  plan?: string;
  createdAt: string;
}

function mapWorkspaceRow(row: any, type: "adults" | "gym"): WorkspaceSummary {
  return {
    id: row.id,
    name: row.name,
    extraCapacity: row.extra_capacity ?? 0,
    plan: type === "adults" ? (row.plan ?? "family") : undefined,
    createdAt: row.created_at,
  };
}

/** Read-only lookup — never creates a workspace. Used where "does this
 * user already have a workspace of this type" needs answering without the
 * get-or-create side effect (e.g. the mobile app detecting which
 * product(s) to route a freshly logged-in user into — see
 * apps/mobile-api's /me/products route). Same ordering as
 * getOrCreateWorkspace so the two agree on which row is "the" workspace if
 * a user somehow has more than one. */
export async function findWorkspace(
  admin: SupabaseClient,
  userId: string,
  type: "adults" | "gym"
): Promise<WorkspaceSummary | null> {
  const selectColumns = type === "adults" ? "id, name, extra_capacity, plan, created_at" : "id, name, extra_capacity, created_at";

  const { data: existing } = await admin
    .from("workspaces")
    .select(selectColumns)
    .eq("owner_id", userId)
    .eq("type", type)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  return existing ? mapWorkspaceRow(existing, type) : null;
}

/** Finds the caller's workspace of the given type, creating one if it
 * doesn't exist yet.
 *
 * The insert is an upsert against the `workspaces_owner_id_type_key` unique
 * constraint (owner_id, type) added in
 * supabase/migrations/0046_dedupe_and_constrain_workspaces.sql — a plain
 * check-then-insert here previously let two near-simultaneous calls (e.g.
 * two screens each independently calling GET /adults/workspace on mount)
 * both pass the initial "not found" read before either insert committed,
 * each creating their own row. Confirmed via 8 real duplicate-workspace
 * pairs in production, all created between ~20ms and ~0.6s apart — the
 * ORDER BY created_at + LIMIT 1 in findWorkspace made *reads* agree on
 * which row was "the" workspace, but did nothing to stop the duplicate
 * INSERT from happening in the first place, leaving an orphaned row
 * behind every time. ignoreDuplicates: true means a losing request's
 * insert is a no-op (not an error) — it re-fetches the winner's row
 * afterward instead.
 *
 * Takes an already-constructed service-role client — this package never
 * constructs its own Supabase clients (the caller decides how to build one,
 * since the main app and the mobile API do it differently). */
export async function getOrCreateWorkspace(
  admin: SupabaseClient,
  userId: string,
  type: "adults" | "gym",
  ownerName?: string
): Promise<WorkspaceSummary> {
  const existing = await findWorkspace(admin, userId, type);
  if (existing) return existing;

  const selectColumns = type === "adults" ? "id, name, extra_capacity, plan, created_at" : "id, name, extra_capacity, created_at";
  const name = type === "adults" ? `${ownerName ?? "My"}'s Family` : `${ownerName ?? "My"}'s Gym`;
  const slug = `${type}-${userId.slice(0, 8)}-${Date.now()}`;

  const { data: created, error } = await admin
    .from("workspaces")
    .upsert({ type, name, slug, owner_id: userId }, { onConflict: "owner_id,type", ignoreDuplicates: true })
    .select(selectColumns)
    .maybeSingle();

  if (error) throw new Error(`Failed to create workspace: ${error.message}`);
  if (created) return mapWorkspaceRow(created, type);

  // Lost the race — a concurrent call already created this workspace.
  const winner = await findWorkspace(admin, userId, type);
  if (!winner) throw new Error("Failed to create workspace: race resolution found no row");
  return mapWorkspaceRow(winner, type);
}
