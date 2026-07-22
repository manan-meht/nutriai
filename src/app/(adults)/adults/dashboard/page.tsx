export const runtime = "edge";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getOrCreateAdultsWorkspace, getContacts, getRemovedContacts, markWorkspaceSelfPlan } from "./actions";
import { AdultsDashboardClient } from "@/components/adults/AdultsDashboardClient";
import { displayEmail } from "@/lib/auth";
import { getEntitlementSnapshot, requiresCardBeforeFirstTrial } from "@/lib/entitlements/entitlements";
import { getIpCountry, resolveBillingMarket } from "@/lib/billing/market";
import { getConfirmedBillingCountry } from "@/lib/billing/country-cookie";
import { getPrice, getSelfPrice, formatMinorUnits } from "@/lib/billing/pricing";
import { SELF_TRACKING_ENABLED } from "@/lib/billing/feature-flags";
import { choosePlanAndCheckout } from "@/app/actions/pricing";
import { syncCheckoutCompletion } from "@/app/actions/subscription-management";

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
  const params = (await searchParams) ?? {};
  const justCheckedOut = params.checkout === "success";

  // Landed here straight from a successful Stripe/Razorpay Checkout
  // redirect — sync the subscription from the provider right now rather
  // than waiting on the webhook (which can take a few seconds in
  // production, and can't reach a local dev server at all). See
  // syncCheckoutCompletion's own doc comment.
  if (justCheckedOut) {
    await syncCheckoutCompletion("adults").catch(() => {});
  }

  const [contacts, removedContacts, entitlement] = await Promise.all([
    getContacts(workspace.id),
    getRemovedContacts(workspace.id),
    getEntitlementSnapshot(workspace.id, "adults", user.email),
  ]);

  const headerStore = await headers();
  const { market } = resolveBillingMarket({
    confirmedCountry: await getConfirmedBillingCountry(),
    ipCountry: getIpCountry(headerStore),
  });
  const monthly = getPrice(market, "adults", "monthly");
  const annual = getPrice(market, "adults", "annual");
  const selfMonthly = getSelfPrice(market, "monthly");
  const selfAnnual = getSelfPrice(market, "annual");

  const hasSelfContact = contacts.some((c) => c.relationshipType === "self");

  // Persist self-tracking intent as soon as it's known, rather than only
  // relying on the one-time ?self=1 redirect param — see markWorkspaceSelfPlan.
  let isSelfPlan = workspace.plan === "self";
  if (SELF_TRACKING_ENABLED && params.self === "1" && !isSelfPlan) {
    await markWorkspaceSelfPlan(workspace.id);
    isSelfPlan = true;
  }

  const promptSelfSetup = SELF_TRACKING_ENABLED && isSelfPlan && !hasSelfContact;
  const requiresCardBeforeTrial = requiresCardBeforeFirstTrial({
    workspaceCreatedAt: workspace.createdAt,
    entitlementStatus: entitlement.status,
    ownerEmail: user.email,
  });

  // Landed here straight from /pricing (via signup's ?plan=&interval=
  // forwarding, see adults/signup/page.tsx) with a brand-new workspace that
  // still needs a card — skip straight to the checkout they already chose
  // a plan for, rather than making them land on the dashboard, click "Add
  // family member", and pick a plan all over again.
  if (
    requiresCardBeforeTrial &&
    (params.plan === "self" || params.plan === "family") &&
    (params.interval === "monthly" || params.interval === "annual")
  ) {
    const result = await choosePlanAndCheckout(params.plan, params.interval);
    if (result.ok) redirect(result.url);
  }

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
      isSelfPlan={isSelfPlan}
      pricing={{
        monthlyLabel: formatMinorUnits(monthly.amountMinorUnits, monthly.currency),
        annualLabel: formatMinorUnits(annual.amountMinorUnits, annual.currency),
      }}
      selfPricing={{
        monthlyLabel: formatMinorUnits(selfMonthly.amountMinorUnits, selfMonthly.currency),
        annualLabel: formatMinorUnits(selfAnnual.amountMinorUnits, selfAnnual.currency),
      }}
      tistraWhatsAppNumber={process.env.TISTRA_WHATSAPP_NUMBER}
      requiresCardBeforeTrial={requiresCardBeforeTrial}
      autoOpenAddModal={justCheckedOut && entitlement.status === "trialing"}
    />
  );
}
