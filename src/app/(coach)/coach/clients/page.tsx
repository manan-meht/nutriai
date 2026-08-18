import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCoachClients, getCoachProfile } from "@/lib/club/coach-queries";
import { CoachShell } from "@/components/coach/CoachShell";
import { CoachClients } from "@/components/coach/CoachClients";

export default async function CoachClientsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/gym/login");

  const admin = createServiceClient();
  const profile = await getCoachProfile(admin, user.id);
  if (!profile) redirect("/coach/settings");

  const clients = await getCoachClients(admin, user.id);

  return (
    <CoachShell active="clients" coachName={profile.displayName} photoUrl={profile.photoUrl}>
      <CoachClients clients={clients} />
    </CoachShell>
  );
}
