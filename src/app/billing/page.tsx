export const dynamic = "force-dynamic";
export const runtime = "edge";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BetaBillingBanner } from "@/components/billing/BetaBillingBanner";
import { foundingMemberCopy } from "@/lib/pricing/founding-member";

interface BillingPageProps {
  searchParams?: Promise<Record<string, string>>;
}

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const params = (await searchParams) ?? {};
  const billingModule = params.module === "gym" ? "gym" : "adults";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(billingModule === "gym" ? "/gym/login?next=/billing?module=gym" : "/adults/login?next=/billing?module=adults");

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-4 text-center">{foundingMemberCopy.dashboardBannerTitle}</h1>
        <BetaBillingBanner sourcePage="billing_page" linkLabel={foundingMemberCopy.viewPlansLabel} />
      </div>
    </div>
  );
}
