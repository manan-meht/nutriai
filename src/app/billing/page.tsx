export const dynamic = "force-dynamic";
export const runtime = "edge";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BetaBillingBanner } from "@/components/billing/BetaBillingBanner";
import { foundingMemberCopy } from "@/lib/pricing/founding-member";
import { BILLING_AVAILABLE } from "@/lib/billing/feature-flags";
import { openBillingPortal } from "@/app/actions/subscription-management";

interface BillingPageProps {
  searchParams?: Promise<Record<string, string>>;
}

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const params = (await searchParams) ?? {};
  const billingModule = params.module === "gym" ? "gym" : "adults";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(billingModule === "gym" ? "/gym/login?next=/billing?module=gym" : "/adults/login?next=/billing?module=adults");

  // The Beta placeholder below only applies pre-launch. Once billing is
  // live, this page's whole job is to hand off to Stripe's own billing
  // portal (payment method, invoices, cancel) — there's no separate UI of
  // our own to show here, so redirect straight there.
  if (BILLING_AVAILABLE) {
    const dashboardPath = billingModule === "gym" ? "/gym/dashboard" : "/adults/dashboard";
    // No entitlement row yet (e.g. never added a first contact/client, so
    // never checked out) — nothing to manage, just send them back rather
    // than surfacing "No subscription found for this module".
    const portalUrl = await openBillingPortal(billingModule).catch(() => null);
    redirect(portalUrl ?? dashboardPath);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-4 text-center">{foundingMemberCopy.dashboardBannerTitle}</h1>
        <BetaBillingBanner sourcePage="billing_page" linkLabel={foundingMemberCopy.viewPlansLabel} />
      </div>
    </div>
  );
}
