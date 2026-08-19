import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCoachPayments, getCoachProfile } from "@/lib/club/coach-queries";
import { getPlatformFeePercent } from "@/lib/club/platform-fee";
import { CoachShell } from "@/components/coach/CoachShell";
import { CoachPayments } from "@/components/coach/CoachPayments";

export default async function CoachPaymentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/gym/login");

  const admin = createServiceClient();
  const profile = await getCoachProfile(admin, user.id);
  if (!profile) redirect("/settings");

  const [payments, feePercent, connect] = await Promise.all([
    getCoachPayments(admin, user.id),
    getPlatformFeePercent(admin),
    admin
      .from("coach_profiles")
      .select("stripe_account_id, stripe_onboarding_status, stripe_payouts_enabled")
      .eq("profile_id", user.id)
      .maybeSingle(),
  ]);

  return (
    <CoachShell active="payments" coachName={profile.displayName} photoUrl={profile.photoUrl}>
      <CoachPayments
        summary={payments!}
        payouts={{
          status: connect.data?.stripe_onboarding_status ?? "not_started",
          payoutsEnabled: connect.data?.stripe_payouts_enabled ?? false,
          hasAccount: !!connect.data?.stripe_account_id,
          feePercent,
        }}
      />
    </CoachShell>
  );
}
