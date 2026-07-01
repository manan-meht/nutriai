import { createClient } from "@/lib/supabase/server";
import type { WorkspaceMemberRole } from "@/types";

export async function createInvitation(params: {
  workspaceId: string;
  invitedBy: string;
  email: string;
  role: WorkspaceMemberRole;
}): Promise<{ token: string; expiresAt: Date }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invitations")
    .insert({
      workspace_id: params.workspaceId,
      invited_by: params.invitedBy,
      email: params.email,
      role: params.role,
    })
    .select("token, expires_at")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create invitation");
  return { token: data.token, expiresAt: new Date(data.expires_at) };
}

export async function acceptInvitation(token: string, userId: string): Promise<void> {
  const supabase = await createClient();

  const { data: inv, error } = await supabase
    .from("invitations")
    .select("*")
    .eq("token", token)
    .eq("status", "pending")
    .single();

  if (error || !inv) throw new Error("Invalid or expired invitation");
  if (new Date(inv.expires_at) < new Date()) throw new Error("Invitation has expired");

  // Add user to workspace
  await supabase.from("workspace_members").upsert({
    workspace_id: inv.workspace_id,
    user_id: userId,
    role: inv.role,
    is_active: true,
  });

  // Mark accepted
  await supabase
    .from("invitations")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", inv.id);
}

export async function revokeInvitation(token: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("invitations")
    .update({ status: "revoked" })
    .eq("token", token);
}
