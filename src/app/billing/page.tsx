export const dynamic = "force-dynamic";
export const runtime = "edge";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
    <div className="min-h-screen flex items-center justify-center px-6 text-center">
      <div className="max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Payments &amp; subscriptions launching soon</h1>
        <p className="text-gray-600">
          We&apos;re still putting the finishing touches on billing. You can keep using Tistra Health for free in the meantime — check back soon.
        </p>
      </div>
    </div>
  );
}
