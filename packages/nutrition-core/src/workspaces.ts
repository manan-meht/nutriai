import type { SupabaseClient } from "@supabase/supabase-js";

export interface WorkspaceSummary {
  id: string;
  name: string;
  extraCapacity: number;
  /** Only set for "adults" workspaces — "family" vs "self" plan. */
  plan?: string;
}

function mapWorkspaceRow(row: any, type: "adults" | "gym"): WorkspaceSummary {
  return {
    id: row.id,
    name: row.name,
    extraCapacity: row.extra_capacity ?? 0,
    plan: type === "adults" ? (row.plan ?? "family") : undefined,
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
  const selectColumns = type === "adults" ? "id, name, extra_capacity, plan" : "id, name, extra_capacity";

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
 * doesn't exist yet. Idempotent: the ORDER BY created_at + LIMIT 1 makes a
 * concurrent double-call resolve to the same row on the second read even if
 * both raced past the initial "not found" check and both inserted (matches
 * the pre-extraction behavior in both apps).
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

  const selectColumns = type === "adults" ? "id, name, extra_capacity, plan" : "id, name, extra_capacity";
  const name = type === "adults" ? `${ownerName ?? "My"}'s Family` : `${ownerName ?? "My"}'s Gym`;
  const slug = `${type}-${userId.slice(0, 8)}-${Date.now()}`;

  const { data: created, error } = await admin
    .from("workspaces")
    .insert({ type, name, slug, owner_id: userId })
    .select(selectColumns)
    .single();

  if (error || !created) throw new Error(`Failed to create workspace: ${error?.message}`);
  return mapWorkspaceRow(created, type);
}
