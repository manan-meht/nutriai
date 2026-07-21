export const dynamic = "force-dynamic";
export const runtime = "edge";

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BetaBillingBanner } from "@/components/billing/BetaBillingBanner";
import { foundingMemberCopy } from "@/lib/pricing/founding-member";
import { BILLING_AVAILABLE } from "@/lib/billing/feature-flags";

interface BillingPageProps {
  searchParams?: Promise<Record<string, string>>;
}

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const params = (await searchParams) ?? {};
  const billingModule = params.module === "gym" ? "gym" : "adults";
  const dashboardPath = billingModule === "gym" ? "/gym/dashboard" : "/adults/dashboard";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(billingModule === "gym" ? "/gym/login?next=/billing?module=gym" : "/adults/login?next=/billing?module=adults");

  // The Beta placeholder below only applies pre-launch. Once billing is
  // live, subscription management (billing portal, cancel) lives on the
  // dashboard itself (see AdultsDashboardClient/GymDashboardClient's
  // isReadOnly banner) — deliberately NOT importing subscription-management
  // here (it pulls in the full Stripe SDK), since that previously pushed
  // this page's Cloudflare Pages Function alone to ~1.8 MB and helped tip
  // the whole deployment over the 25 MiB aggregate Functions limit, failing
  // two deploys in a row. This route just bounces back to the dashboard.
  if (BILLING_AVAILABLE) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 py-16">
        <div className="max-w-md w-full text-center">
          <p className="text-gray-600 mb-4">Manage your subscription from your dashboard.</p>
          <Link href={dashboardPath} className="text-[#6750A4] font-semibold underline">
            Go to dashboard
          </Link>
        </div>
      </div>
    );
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
