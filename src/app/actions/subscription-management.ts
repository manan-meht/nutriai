"use server";

import { headers } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { EntitlementModule } from "@/lib/entitlements/entitlements";
import { applyProviderSubscriptionSnapshot } from "@/lib/entitlements/entitlements";
import { getProviderByName } from "@/lib/billing/provider-registry";
import type { PaymentProviderName } from "@/lib/billing/provider";

async function getOwnedEntitlementRow(module: EntitlementModule) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const admin = createServiceClient();
  const { data: entitlement } = await admin
    .from("entitlements")
    .select("workspace_id, owner_id, payment_provider, provider_subscription_id, provider_customer_id")
    .eq("module", module)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!entitlement) throw new Error("No subscription found for this module");
  return entitlement;
}

/** Re-pulls the subscription from the provider and re-applies it — lets a
 * user manually recover if a webhook was delayed, without ever trusting a
 * browser redirect by itself to grant access. */
export async function refreshPaymentStatus(module: EntitlementModule): Promise<void> {
  const entitlement = await getOwnedEntitlementRow(module);
  if (!entitlement.payment_provider || !entitlement.provider_subscription_id) return;

  const provider = getProviderByName(entitlement.payment_provider as PaymentProviderName);
  const snapshot = await provider.retrieveSubscription(entitlement.provider_subscription_id);
  if (!snapshot) return;

  await applyProviderSubscriptionSnapshot({
    workspaceId: entitlement.workspace_id,
    module,
    provider: entitlement.payment_provider as PaymentProviderName,
    snapshot,
  });
}

/** Cancellation normally preserves access through the current paid-through
 * date (atPeriodEnd=true) rather than revoking immediately. */
export async function cancelSubscription(module: EntitlementModule, atPeriodEnd = true): Promise<void> {
  const entitlement = await getOwnedEntitlementRow(module);
  if (!entitlement.payment_provider || !entitlement.provider_subscription_id) {
    throw new Error("No active subscription to cancel");
  }
  const provider = getProviderByName(entitlement.payment_provider as PaymentProviderName);
  await provider.cancelSubscription(entitlement.provider_subscription_id, atPeriodEnd);
  await refreshPaymentStatus(module);
}

export async function reactivateSubscription(module: EntitlementModule): Promise<boolean> {
  const entitlement = await getOwnedEntitlementRow(module);
  if (!entitlement.payment_provider || !entitlement.provider_subscription_id) {
    throw new Error("No subscription to reactivate");
  }
  const provider = getProviderByName(entitlement.payment_provider as PaymentProviderName);
  const reactivated = await provider.reactivateSubscription(entitlement.provider_subscription_id);
  if (reactivated) await refreshPaymentStatus(module);
  return reactivated;
}

/** Opens the provider's hosted billing-management page where supported
 * (Stripe billing portal). Returns null where the provider has no
 * equivalent (Razorpay) — callers should fall back to in-app management. */
export async function openBillingPortal(module: EntitlementModule): Promise<string | null> {
  const entitlement = await getOwnedEntitlementRow(module);
  if (!entitlement.payment_provider || !entitlement.provider_customer_id) return null;

  const provider = getProviderByName(entitlement.payment_provider as PaymentProviderName);
  const headerStore = await headers();
  const origin = `https://${headerStore.get("host") ?? "localhost:3001"}`;
  const dashboardPath = module === "adults" ? "/adults/dashboard" : "/gym/dashboard";

  return provider.openBillingPortal({
    customerId: entitlement.provider_customer_id,
    returnUrl: `${origin}${dashboardPath}`,
  });
}
