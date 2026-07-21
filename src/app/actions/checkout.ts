"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getEntitlementSnapshot, recordCheckoutIntent, TRIAL_LENGTH_MS, type EntitlementModule } from "@/lib/entitlements/entitlements";
import { resolveBillingMarket, getIpCountry } from "@/lib/billing/market";
import { getConfirmedBillingCountry } from "@/lib/billing/country-cookie";
import { getPrice, type BillingInterval } from "@/lib/billing/pricing";
import { getProviderForMarket, providerNameForMarket } from "@/lib/billing/provider-registry";
import { getStripePriceId } from "@/lib/billing/providers/stripe-price-ids";
import { getRazorpayPlanId } from "@/lib/billing/providers/razorpay-plan-ids";

export interface CheckoutPreview {
  url: string;
  chargesImmediately: boolean;
  firstChargeDateIso: string;
  amountMinorUnits: number;
  currency: string;
  interval: BillingInterval;
}

/**
 * Creates a checkout session for (module, interval), resolving the market
 * from the confirmed-country cookie / Cloudflare IP header, and — if the
 * module has an active trial — asking the provider to delay the first
 * charge until the trial ends (see spec §15: "the paid subscription should
 * begin at the end of the existing 14-day trial whenever the selected
 * provider supports delayed billing"). The browser never supplies a price;
 * getPrice() below is the only source of the amount actually charged.
 */
export async function createCheckoutSession(
  module: EntitlementModule,
  interval: BillingInterval
): Promise<CheckoutPreview> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) throw new Error("Not authenticated");

  const workspace = await getWorkspaceForModule(module, user.id);

  const headerStore = await headers();
  const ipCountry = getIpCountry(headerStore);
  const confirmedCountry = await getConfirmedBillingCountry();
  const { market } = resolveBillingMarket({ confirmedCountry, ipCountry });

  const price = getPrice(market, module, interval);
  const providerName = providerNameForMarket(market);
  const provider = await getProviderForMarket(market);

  const entitlement = await getEntitlementSnapshot(workspace.id, module);
  // "trialing" — an existing trial is already running (started card-free
  // via startTrialIfNeeded, the legacy path grandfathered users are still
  // on); defer the first charge to when that trial was already going to
  // end. "not_started" — this workspace has never started a trial at all
  // (the new card-first flow: checkout itself is what starts the trial),
  // so give it a fresh 14-day trial from today, sourced from Stripe's own
  // subscription_data.trial_end via applyProviderSubscriptionSnapshot once
  // the webhook confirms it — never from a pre-existing trialEndAt, since
  // there isn't one yet.
  const delayBillingUntil =
    entitlement.status === "trialing"
      ? entitlement.trialEndAt
      : entitlement.status === "not_started"
      ? new Date(Date.now() + TRIAL_LENGTH_MS).toISOString()
      : null;

  const providerCustomerId = await provider.createOrRetrieveCustomer({
    ownerId: user.id,
    email: user.email,
  });

  await recordCheckoutIntent({
    workspaceId: workspace.id,
    ownerId: user.id,
    module,
    provider: providerName,
    providerCustomerId,
    market,
    currency: price.currency,
    interval,
  });

  const origin = `https://${headerStore.get("host") ?? "localhost:3001"}`;
  const dashboardPath = module === "adults" ? "/adults/dashboard" : "/gym/dashboard";

  const result = await provider.createCheckoutSession({
    workspaceId: workspace.id,
    ownerId: user.id,
    ownerEmail: user.email,
    module,
    market,
    interval,
    delayBillingUntil,
    successUrl: `${origin}${dashboardPath}?checkout=success`,
    cancelUrl: `${origin}${dashboardPath}?checkout=cancelled`,
  });

  const firstChargeDateIso = result.chargesImmediately
    ? new Date().toISOString()
    : (delayBillingUntil ?? new Date().toISOString());

  return {
    url: result.url,
    chargesImmediately: result.chargesImmediately,
    firstChargeDateIso,
    amountMinorUnits: price.amountMinorUnits,
    currency: price.currency,
    interval,
  };
}

async function getWorkspaceForModule(module: EntitlementModule, userId: string) {
  if (module === "adults") {
    const { getOrCreateAdultsWorkspace } = await import("@/app/(adults)/adults/dashboard/actions");
    return getOrCreateAdultsWorkspace(userId);
  }
  const { getOrCreateWorkspace } = await import("@/app/(gym)/gym/dashboard/actions");
  return getOrCreateWorkspace(userId);
}

/** Verifies the price/module/interval the client is about to display
 * matches the server's own pricing table for the resolved market — used by
 * the subscription page before rendering the "Subscribe" button, so a
 * tampered client can't coerce a different price into the confirmation UI. */
export async function getServerValidatedPrice(module: EntitlementModule, interval: BillingInterval) {
  const headerStore = await headers();
  const ipCountry = getIpCountry(headerStore);
  const confirmedCountry = await getConfirmedBillingCountry();
  const { market } = resolveBillingMarket({ confirmedCountry, ipCountry });
  const price = getPrice(market, module, interval);
  return { market, price };
}

// Re-exported so callers (e.g. tests, admin tooling) can check a price ID
// is configured without duplicating the provider-specific lookup logic.
export { getStripePriceId, getRazorpayPlanId };
