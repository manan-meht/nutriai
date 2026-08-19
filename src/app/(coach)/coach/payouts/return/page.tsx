import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { refreshAccountState } from "@/lib/club/stripe-connect";

// Where Stripe sends a coach back after hosted onboarding.
//
// Stripe does not tell us the outcome in this redirect — it only says the
// coach came back. The account has to be re-read, which is also why the
// status is never inferred from "they returned, so they must be done":
// abandoning halfway lands here exactly the same way.
export const dynamic = "force-dynamic";

export default async function PayoutReturnPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/gym/login");

  const admin = createServiceClient();
  const { data: coach } = await admin
    .from("coach_profiles")
    .select("id, stripe_account_id")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (coach?.stripe_account_id) {
    await refreshAccountState(admin, coach.id, coach.stripe_account_id).catch(() => {});
  }
  redirect("/settings?payouts=updated");
}
