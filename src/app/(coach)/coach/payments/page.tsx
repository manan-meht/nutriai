import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCoachPayments, getCoachProfile } from "@/lib/club/coach-queries";
import { CoachShell } from "@/components/coach/CoachShell";
import { CoachPayments } from "@/components/coach/CoachPayments";

export default async function CoachPaymentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/gym/login");

  const admin = createServiceClient();
  const profile = await getCoachProfile(admin, user.id);
  if (!profile) redirect("/settings");

  const payments = await getCoachPayments(admin, user.id);

  return (
    <CoachShell active="payments" coachName={profile.displayName} photoUrl={profile.photoUrl}>
      <CoachPayments summary={payments!} />
    </CoachShell>
  );
}
