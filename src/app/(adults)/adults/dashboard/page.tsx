import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getOrCreateAdultsWorkspace, getContacts } from "./actions";
import { AdultsDashboardClient } from "@/components/adults/AdultsDashboardClient";
import { displayEmail } from "@/lib/auth";

export default async function AdultsDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/adults/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const workspace = await getOrCreateAdultsWorkspace(user.id, profile?.full_name ?? undefined);
  const contacts = await getContacts(workspace.id);

  return (
    <AdultsDashboardClient
      caregiverName={profile?.full_name ?? ""}
      caregiverEmail={displayEmail(user.email ?? "")}
      workspaceId={workspace.id}
      contacts={contacts}
    />
  );
}
