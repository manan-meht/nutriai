export const runtime = "edge";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getOrCreateWorkspace, getClients } from "./actions";
import { GymDashboardClient } from "@/components/gym/GymDashboardClient";

export default async function GymDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/gym/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const workspace = await getOrCreateWorkspace(user.id, profile?.full_name ?? undefined);
  const clients = await getClients(workspace.id);

  return (
    <GymDashboardClient
      coachName={profile?.full_name ?? ""}
      coachEmail={user.email ?? ""}
      workspaceId={workspace.id}
      clients={clients}
    />
  );
}
