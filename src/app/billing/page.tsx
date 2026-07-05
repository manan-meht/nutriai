export const dynamic = "force-dynamic";
export const runtime = "edge";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getEntitlementSnapshot } from "@/lib/entitlements/entitlements";
import { getIpCountry, resolveBillingMarket } from "@/lib/billing/market";
import { getConfirmedBillingCountry } from "@/lib/billing/country-cookie";
import { getPrice, annualSavingsFraction, INTL_USD_DISCLOSURE, formatMinorUnits } from "@/lib/billing/pricing";
import { effectiveFamilyLimit, effectiveGymLimit, FAMILY_MEMBER_LIMIT, SELF_TRACKING_LIMIT } from "@/lib/limits";
import { BillingPageClient } from "@/components/billing/BillingPageClient";

interface BillingPageProps {
  searchParams?: Promise<Record<string, string>>;
}

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const params = (await searchParams) ?? {};
  const billingModule = params.module === "gym" ? "gym" : "adults";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(billingModule === "gym" ? "/gym/login?next=/billing?module=gym" : "/adults/login?next=/billing?module=adults");

  const workspace = billingModule === "gym"
    ? await (await import("@/app/(gym)/gym/dashboard/actions")).getOrCreateWorkspace(user.id)
    : await (await import("@/app/(adults)/adults/dashboard/actions")).getOrCreateAdultsWorkspace(user.id);

  const entitlement = await getEntitlementSnapshot(workspace.id, billingModule);

  const headerStore = await headers();
  const ipCountry = getIpCountry(headerStore);
  const confirmedCountry = await getConfirmedBillingCountry();
  const { market, country } = resolveBillingMarket({ confirmedCountry, ipCountry });

  const monthly = getPrice(market, billingModule, "monthly");
  const annual = getPrice(market, billingModule, "annual");
  const savingsPct = Math.round(annualSavingsFraction(market, billingModule) * 100);

  const basePeopleIncluded =
    billingModule === "adults" && "plan" in workspace && workspace.plan === "self"
      ? SELF_TRACKING_LIMIT
      : FAMILY_MEMBER_LIMIT;
  const limit = billingModule === "adults"
    ? effectiveFamilyLimit(workspace.extraCapacity, basePeopleIncluded)
    : effectiveGymLimit(workspace.extraCapacity);

  return (
    <BillingPageClient
      module={billingModule}
      entitlement={entitlement}
      market={market}
      detectedCountry={ipCountry}
      confirmedCountry={country}
      limit={limit}
      pricing={{
        monthly: { amountMinorUnits: monthly.amountMinorUnits, currency: monthly.currency, label: formatMinorUnits(monthly.amountMinorUnits, monthly.currency) },
        annual: { amountMinorUnits: annual.amountMinorUnits, currency: annual.currency, label: formatMinorUnits(annual.amountMinorUnits, annual.currency) },
        savingsPct,
      }}
      intlDisclosure={market === "INTL" ? INTL_USD_DISCLOSURE : null}
    />
  );
}
