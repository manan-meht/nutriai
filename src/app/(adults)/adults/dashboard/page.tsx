export const runtime = "edge";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getOrCreateAdultsWorkspace, getContacts, getRemovedContacts } from "./actions";
import { AdultsDashboardClient } from "@/components/adults/AdultsDashboardClient";
import { displayEmail } from "@/lib/auth";
import { getEntitlementSnapshot } from "@/lib/entitlements/entitlements";
import { getIpCountry, resolveBillingMarket } from "@/lib/billing/market";
import { getConfirmedBillingCountry } from "@/lib/billing/country-cookie";
import { getPrice, formatMinorUnits } from "@/lib/billing/pricing";
import { SELF_TRACKING_ENABLED } from "@/lib/billing/feature-flags";

interface AdultsDashboardPageProps {
  searchParams?: Promise<Record<string, string>>;
}

export default async function AdultsDashboardPage({ searchParams }: AdultsDashboardPageProps) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/adults/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const workspace = await getOrCreateAdultsWorkspace(user.id, profile?.full_name ?? undefined);
  const [contacts, removedContacts, entitlement] = await Promise.all([
    getContacts(workspace.id),
    getRemovedContacts(workspace.id),
    getEntitlementSnapshot(workspace.id, "adults"),
  ]);

  const headerStore = await headers();
  const { market } = resolveBillingMarket({
    confirmedCountry: await getConfirmedBillingCountry(),
    ipCountry: getIpCountry(headerStore),
  });
  const monthly = getPrice(market, "adults", "monthly");
  const annual = getPrice(market, "adults", "annual");

  const params = (await searchParams) ?? {};
  const promptSelfSetup =
    SELF_TRACKING_ENABLED &&
    params.self === "1" &&
    !contacts.some((c) => c.relationshipType === "self");

  return (
    <AdultsDashboardClient
      caregiverName={profile?.full_name ?? ""}
      caregiverEmail={displayEmail(user.email ?? "")}
      workspaceId={workspace.id}
      contacts={contacts}
      removedContacts={removedContacts}
      extraCapacity={workspace.extraCapacity}
      entitlement={entitlement}
      promptSelfSetup={promptSelfSetup}
      pricing={{
        monthlyLabel: formatMinorUnits(monthly.amountMinorUnits, monthly.currency),
        annualLabel: formatMinorUnits(annual.amountMinorUnits, annual.currency),
      }}
    />
  );
}
