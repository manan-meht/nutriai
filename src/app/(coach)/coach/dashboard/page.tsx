import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCoachDashboard } from "@/lib/club/coach-queries";
import { CoachShell } from "@/components/coach/CoachShell";
import { CoachDashboard } from "@/components/coach/CoachDashboard";

// Coach OS home. Authorization is by construction: getCoachDashboard takes
// the signed-in user's profile id and resolves their own coach_profiles row,
// so there is no id in the URL for anyone to tamper with.
export default async function CoachDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?product=coach");

  const data = await getCoachDashboard(createServiceClient(), user.id);
  // Signed in, but not a coach — send them to set one up rather than 404.
  if (!data) redirect("/settings");

  return (
    <CoachShell active="dashboard" coachName={data.profile.displayName} photoUrl={data.profile.photoUrl}>
      <CoachDashboard data={data} />
    </CoachShell>
  );
}
