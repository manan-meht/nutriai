
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BillingPageClient } from "@/components/billing/BillingPageClient";
import { getEntitlementSnapshot } from "@/lib/entitlements/entitlements";
import { getOrCreateWorkspace } from "@nutriai/nutrition-core";
import type { EntitlementModule } from "@/lib/entitlements/entitlements";

interface BillingManagePageProps {
  searchParams?: Promise<Record<string, string>>;
}

// Separate Edge Function from /billing on purpose — /billing itself stays
// a static page with no server-side Stripe import (see that route's own
// comment: pulling the Stripe SDK into that shared function once already
// pushed the whole deployment over the 25 MiB aggregate Cloudflare Pages
// Functions limit). Isolating the actual account-management UI (cancel/
// reactivate/billing-portal, which do need Stripe) to its own route keeps
// that weight contained to just this one function. Deliberately scoped to
// managing an EXISTING subscription only, not starting a new one (see
// BillingPageClient's own comment) — even after dropping the getOrCreate*
// dashboard actions imports in favor of the lightweight shared
// getOrCreateWorkspace, adding checkout/pricing back on top of this still
// tipped the aggregate over budget.
export default async function BillingManagePage({ searchParams }: BillingManagePageProps) {
  const params = (await searchParams) ?? {};
  const billingModule: EntitlementModule = params.module === "gym" ? "gym" : "adults";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(billingModule === "gym" ? "/login?product=coach" : "/adults/login");

  const admin = createServiceClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const workspace = await getOrCreateWorkspace(admin, user.id, billingModule, profile?.full_name ?? undefined);
  const entitlement = await getEntitlementSnapshot(workspace.id, billingModule, user.email);

  return <BillingPageClient module={billingModule} entitlement={entitlement} />;
}
