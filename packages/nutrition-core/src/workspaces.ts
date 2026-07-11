import type { SupabaseClient } from "@supabase/supabase-js";

export interface WorkspaceSummary {
  id: string;
  name: string;
  extraCapacity: number;
  /** Only set for "adults" workspaces — "family" vs "self" plan. */
  plan?: string;
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
  const selectColumns = type === "adults" ? "id, name, extra_capacity, plan" : "id, name, extra_capacity";

  const { data: existing } = await admin
    .from("workspaces")
    .select(selectColumns)
    .eq("owner_id", userId)
    .eq("type", type)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (existing) {
    return {
      id: (existing as any).id,
      name: (existing as any).name,
      extraCapacity: (existing as any).extra_capacity ?? 0,
      plan: type === "adults" ? ((existing as any).plan ?? "family") : undefined,
    };
  }

  const name = type === "adults" ? `${ownerName ?? "My"}'s Family` : `${ownerName ?? "My"}'s Gym`;
  const slug = `${type}-${userId.slice(0, 8)}-${Date.now()}`;

  const { data: created, error } = await admin
    .from("workspaces")
    .insert({ type, name, slug, owner_id: userId })
    .select(selectColumns)
    .single();

  if (error || !created) throw new Error(`Failed to create workspace: ${error?.message}`);
  return {
    id: (created as any).id,
    name: (created as any).name,
    extraCapacity: (created as any).extra_capacity ?? 0,
    plan: type === "adults" ? ((created as any).plan ?? "family") : undefined,
  };
}
