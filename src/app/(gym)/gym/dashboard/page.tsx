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
  const [clients, removedClients, entitlement] = await Promise.all([
    getClients(workspace.id),
    getRemovedClients(workspace.id),
    getEntitlementSnapshot(workspace.id, "gym"),
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
  });

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
    />
  );
}
