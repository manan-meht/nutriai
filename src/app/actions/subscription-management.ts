"use server";

import { headers } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { EntitlementModule } from "@/lib/entitlements/entitlements";
import { applyProviderSubscriptionSnapshot } from "@/lib/entitlements/entitlements";
import { getProviderByName, isStoreManagedProvider } from "@/lib/billing/provider-registry";
import type { PaymentProviderName } from "@/lib/billing/provider";
import { requestOrigin } from "@/lib/billing/market";

const STORE_MANAGED_MESSAGE =
  "This subscription was purchased through the App Store/Play Store — manage or cancel it from your phone's subscription settings, not here.";

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
  // Store subscriptions are only ever refreshed by the RevenueCat webhook
  // (it's the authoritative source, see revenuecat.ts) — there's no
  // provider.retrieveSubscription() equivalent to call here.
  if (isStoreManagedProvider(entitlement.payment_provider as PaymentProviderName)) return;

  const provider = await getProviderByName(entitlement.payment_provider as PaymentProviderName);
  const snapshot = await provider.retrieveSubscription(entitlement.provider_subscription_id);
  if (!snapshot) return;

  await applyProviderSubscriptionSnapshot({
    workspaceId: entitlement.workspace_id,
    module,
    provider: entitlement.payment_provider as PaymentProviderName,
    snapshot,
  });
}

/**
 * Called right when a visitor lands back on the dashboard from a
 * successful Stripe/Razorpay Checkout redirect (see ?checkout=success on
 * the adults/gym dashboard pages). At that instant, provider_subscription_id
 * on the entitlements row is still null — recordCheckoutIntent (called
 * before redirecting to checkout) only ever records provider_customer_id;
 * the subscription itself doesn't exist until the visitor actually
 * completes payment, and provider_subscription_id is only populated by a
 * verified webhook afterward. That webhook can take a few seconds in
 * production, and can't reach a local dev server at all — so rather than
 * leaving the dashboard showing a stale "not_started" state (and re-gating
 * "Add first contact" right back into another checkout redirect) until a
 * webhook that may never arrive, this looks the new subscription up from
 * the provider directly via provider_customer_id and applies it the same
 * way the webhook would. Safe to call even when there's nothing to sync
 * (no customer id yet, or the provider has no subscription for it) — a
 * no-op in that case, same trust model as refreshPaymentStatus (this is a
 * manual re-pull from the provider, never trusts the browser redirect by
 * itself to grant access).
 */
export async function syncCheckoutCompletion(module: EntitlementModule): Promise<void> {
  const entitlement = await getOwnedEntitlementRow(module);
  if (!entitlement.payment_provider || !entitlement.provider_customer_id) return;
  if (isStoreManagedProvider(entitlement.payment_provider as PaymentProviderName)) return;

  const provider = await getProviderByName(entitlement.payment_provider as PaymentProviderName);
  const snapshot = await provider.findLatestSubscriptionForCustomer(entitlement.provider_customer_id);
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
  if (isStoreManagedProvider(entitlement.payment_provider as PaymentProviderName)) {
    throw new Error(STORE_MANAGED_MESSAGE);
  }
  const provider = await getProviderByName(entitlement.payment_provider as PaymentProviderName);
  await provider.cancelSubscription(entitlement.provider_subscription_id, atPeriodEnd);
  await refreshPaymentStatus(module);
}

export async function reactivateSubscription(module: EntitlementModule): Promise<boolean> {
  const entitlement = await getOwnedEntitlementRow(module);
  if (!entitlement.payment_provider || !entitlement.provider_subscription_id) {
    throw new Error("No subscription to reactivate");
  }
  if (isStoreManagedProvider(entitlement.payment_provider as PaymentProviderName)) {
    throw new Error(STORE_MANAGED_MESSAGE);
  }
  const provider = await getProviderByName(entitlement.payment_provider as PaymentProviderName);
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
  // No hosted billing portal equivalent for store subscriptions — callers
  // should fall back to in-app management, same as the existing Razorpay
  // (null) case this function's own doc comment already describes.
  if (isStoreManagedProvider(entitlement.payment_provider as PaymentProviderName)) return null;

  const provider = await getProviderByName(entitlement.payment_provider as PaymentProviderName);
  const headerStore = await headers();
  const origin = requestOrigin(headerStore);
  const dashboardPath = module === "adults" ? "/adults/dashboard" : "/gym/dashboard";

  return provider.openBillingPortal({
    customerId: entitlement.provider_customer_id,
    returnUrl: `${origin}${dashboardPath}`,
  });
}
