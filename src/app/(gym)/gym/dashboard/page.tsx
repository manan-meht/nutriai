export const runtime = "edge";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getOrCreateWorkspace, getClients, getRemovedClients } from "./actions";
import { GymDashboardClient } from "@/components/gym/GymDashboardClient";
import { getEntitlementSnapshot, requiresCardBeforeFirstTrial } from "@/lib/entitlements/entitlements";
import { getIpCountry, resolveBillingMarket } from "@/lib/billing/market";
import { getConfirmedBillingCountry } from "@/lib/billing/country-cookie";
import { getPrice, formatMinorUnits } from "@/lib/billing/pricing";
import { choosePlanAndCheckout } from "@/app/actions/pricing";
import { syncCheckoutCompletion } from "@/app/actions/subscription-management";

interface GymDashboardPageProps {
  searchParams?: Promise<Record<string, string>>;
}

export default async function GymDashboardPage({ searchParams }: GymDashboardPageProps) {
  const params = (await searchParams) ?? {};
  const justCheckedOut = params.checkout === "success";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/gym/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const workspace = await getOrCreateWorkspace(user.id, profile?.full_name ?? undefined);

  // Landed here straight from a successful Stripe/Razorpay Checkout
  // redirect — sync the subscription from the provider right now rather
  // than waiting on the webhook (which can take a few seconds in
  // production, and can't reach a local dev server at all). See
  // syncCheckoutCompletion's own doc comment.
  if (justCheckedOut) {
    await syncCheckoutCompletion("gym").catch(() => {});
  }

  const [clients, removedClients, entitlement] = await Promise.all([
    getClients(workspace.id),
    getRemovedClients(workspace.id),
    getEntitlementSnapshot(workspace.id, "gym", user.email),
  ]);

  const headerStore = await headers();
  const { market } = resolveBillingMarket({
    confirmedCountry: await getConfirmedBillingCountry(),
    ipCountry: getIpCountry(headerStore),
  });
  const monthly = getPrice(market, "gym", "monthly");
  const annual = getPrice(market, "gym", "annual");
  const requiresCardBeforeTrial = requiresCardBeforeFirstTrial({
    workspaceCreatedAt: workspace.createdAt,
    entitlementStatus: entitlement.status,
    ownerEmail: user.email,
  });

  // Landed here straight from /pricing (via signup's ?plan=&interval=
  // forwarding, see gym/signup/page.tsx) with a brand-new workspace that
  // still needs a card — skip straight to the checkout they already chose
  // a plan for, rather than making them land on the dashboard, click "Add
  // client", and pick a plan all over again.
  if (
    requiresCardBeforeTrial &&
    params.plan === "gym" &&
    (params.interval === "monthly" || params.interval === "annual")
  ) {
    const result = await choosePlanAndCheckout("gym", params.interval);
    if (result.ok) redirect(result.url);
  }

  return (
    <GymDashboardClient
      coachName={profile?.full_name ?? ""}
      coachEmail={user.email ?? ""}
      workspaceId={workspace.id}
      clients={clients}
      removedClients={removedClients}
      extraCapacity={workspace.extraCapacity}
      entitlement={entitlement}
      pricing={{
        monthlyLabel: formatMinorUnits(monthly.amountMinorUnits, monthly.currency),
        annualLabel: formatMinorUnits(annual.amountMinorUnits, annual.currency),
      }}
      requiresCardBeforeTrial={requiresCardBeforeTrial}
      autoOpenAddModal={justCheckedOut && entitlement.status === "trialing"}
    />
  );
}
