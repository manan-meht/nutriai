import { createClient } from "@/lib/supabase/server";
import type { Workspace, WorkspaceMember, WorkspaceMemberRole, WorkspaceType } from "@/types";

export async function getWorkspaceById(id: string): Promise<Workspace | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return mapWorkspace(data);
}

export async function getWorkspacesForUser(userId: string): Promise<Workspace[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace:workspaces(*)")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (error || !data) return [];
  return data.map((row: any) => mapWorkspace(row.workspace));
}

export async function getWorkspacesForUserByType(
  userId: string,
  type: WorkspaceType
): Promise<Workspace[]> {
  const all = await getWorkspacesForUser(userId);
  return all.filter((w) => w.type === type);
}

export async function createWorkspace(params: {
  type: WorkspaceType;
  name: string;
  ownerId: string;
}): Promise<Workspace> {
  const supabase = await createClient();
  const slug = `${params.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;

  const { data, error } = await supabase
    .from("workspaces")
    .insert({ type: params.type, name: params.name, slug, owner_id: params.ownerId })
    .select()
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create workspace");

  // Add owner as member
  await supabase.from("workspace_members").insert({
    workspace_id: data.id,
    user_id: params.ownerId,
    role: params.type === "gym" ? "gym_owner" : "family_owner",
  });

  return mapWorkspace(data);
}

export async function getMembersForWorkspace(workspaceId: string): Promise<WorkspaceMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspace_members")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true);

  if (error || !data) return [];
  return data.map(mapMember);
}

export async function getMemberRole(
  workspaceId: string,
  userId: string
): Promise<WorkspaceMemberRole | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .single();

  return data?.role ?? null;
}

function mapWorkspace(row: any): Workspace {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    slug: row.slug,
    ownerId: row.owner_id,
    settings: row.settings ?? {},
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function mapMember(row: any): WorkspaceMember {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    role: row.role,
    joinedAt: new Date(row.joined_at),
    isActive: row.is_active,
  };
}
