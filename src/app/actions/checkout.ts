"use server";

import { headers } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getEntitlementSnapshot, getExistingProviderCustomerId, recordCheckoutIntent, trialLengthMs, type EntitlementModule } from "@/lib/entitlements/entitlements";
import { resolveBillingMarket, getIpCountry, requestOrigin } from "@/lib/billing/market";
import { getConfirmedBillingCountry } from "@/lib/billing/country-cookie";
import { getPrice, getSelfPrice, getAdditionalPersonPrice, type BillingInterval, type BillingMarket, type AdditionalCapacityPlan } from "@/lib/billing/pricing";
import { getProviderForMarket, providerNameForMarket, getProviderByName, isStoreManagedProvider } from "@/lib/billing/provider-registry";
import type { PaymentProviderName } from "@/lib/billing/provider";
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
 *
 * `forceMarket`, when supplied, bypasses the usual IP/cookie resolution —
 * used exclusively by retryCheckoutAsGlobalPricing below, for the "your
 * India-priced checkout didn't go through — continue at the standard
 * international price" recovery flow (see that function's own doc). Never
 * exposed as a client-settable parameter beyond that one server action; the
 * public entry point for ordinary checkout always resolves market itself.
 */
export async function createCheckoutSession(
  module: EntitlementModule,
  interval: BillingInterval,
  forceMarket?: BillingMarket
): Promise<CheckoutPreview> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) throw new Error("Not authenticated");

  const workspace = await getWorkspaceForModule(module, user.id);
  // Self and Family are both `module: "adults"` workspaces (same
  // entitlement row/trial lifecycle) but bill at different amounts — see
  // BillingPricingTier's own doc. workspace.plan is already "self"|"family"
  // from getOrCreateAdultsWorkspace; gym workspaces have no `plan` field at
  // all, so this is naturally always false there.
  const isSelfPlan = module === "adults" && "plan" in workspace && workspace.plan === "self";
  const pricingTier = isSelfPlan ? ("self" as const) : module;

  const headerStore = await headers();
  const ipCountry = getIpCountry(headerStore);
  const confirmedCountry = await getConfirmedBillingCountry();
  const market = forceMarket ?? resolveBillingMarket({ confirmedCountry, ipCountry }).market;

  const price = isSelfPlan ? getSelfPrice(market, interval) : getPrice(market, module, interval);
  const providerName = providerNameForMarket(market);
  const provider = await getProviderForMarket(market);

  const entitlement = await getEntitlementSnapshot(workspace.id, module);
  // "trialing" — an existing trial is already running (started card-free
  // via startTrialIfNeeded, the legacy path grandfathered users are still
  // on); defer the first charge to when that trial was already going to
  // end. "not_started" — this workspace has never started a trial at all
  // (the new card-first flow: checkout itself is what starts the trial),
  // so give it a fresh trial (length per TRIAL_LENGTH_DAYS_BY_MODULE) from
  // today, sourced from Stripe's own subscription_data.trial_end via
  // applyProviderSubscriptionSnapshot once the webhook confirms it — never
  // from a pre-existing trialEndAt, since there isn't one yet.
  const delayBillingUntil =
    entitlement.status === "trialing"
      ? entitlement.trialEndAt
      : entitlement.status === "not_started"
      ? freshTrialEndDate(module).toISOString()
      : null;

  const existingCustomerId = await getExistingProviderCustomerId(workspace.id, module);
  const providerCustomerId = await provider.createOrRetrieveCustomer({
    ownerId: user.id,
    email: user.email,
    existingCustomerId,
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

  const origin = requestOrigin(headerStore);
  const dashboardPath = module === "adults" ? "/adults/dashboard" : "/gym/dashboard";

  const result = await provider.createCheckoutSession({
    workspaceId: workspace.id,
    ownerId: user.id,
    ownerEmail: user.email,
    module,
    pricingTier,
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

/**
 * Recovery path for spec §7: a visitor saw India pricing (IP-based display
 * default) but their payment method isn't India-eligible, so the India
 * checkout attempt didn't go through. Re-runs createCheckoutSession for the
 * exact same module/interval — preserving Self/Family/Coach, monthly/
 * annual, and trial eligibility exactly, since those are already
 * createCheckoutSession's only real parameters — but forces the market to
 * INTL (global USD) instead of re-resolving from IP/cookie, so the customer
 * isn't routed back into the same India/Razorpay path they just failed.
 * Never mentions VPN; the friendly copy lives in the calling UI.
 *
 * Caveat: today's Razorpay integration creates a hosted subscription link
 * (short_url) server-side and has no client-side decline callback wired up
 * (see razorpay-provider.ts's createCheckoutSession — CheckoutParams'
 * successUrl/cancelUrl are Stripe-only fields today). This action is ready
 * to be called the moment a decline signal exists — e.g. once Razorpay's
 * client-side Checkout.js is integrated for a synchronous failure handler,
 * or from a manual "this didn't work" link — but nothing in this codebase
 * yet triggers it automatically. Flagged in the completion report.
 */
export async function retryCheckoutAsGlobalPricing(
  module: EntitlementModule,
  interval: BillingInterval
): Promise<CheckoutPreview> {
  return createCheckoutSession(module, interval, "INTL");
}

export interface PurchaseAdditionalCapacityResult {
  ok: true;
  newExtraCapacity: number;
  amountMinorUnits: number;
  currency: string;
}

export interface PurchaseAdditionalCapacityError {
  ok: false;
  reason: string;
}

/**
 * Buys `quantity` more tracked-person slots on top of a plan's base
 * included count (2 for Family, 5 for Coach — see PEOPLE_INCLUDED), for a
 * workspace that already has an active Stripe/Razorpay subscription. Adds
 * (or increases) a recurring "additional_person" line item on that same
 * subscription — prorated immediately, then billed alongside the base plan
 * from the next renewal on — rather than a separate checkout/subscription,
 * since Stripe/Razorpay both bill everything on one subscription as a
 * single invoice. Self has no concept of additional capacity (always
 * exactly 1 person), so this is adults-family/coach only; callers should
 * never offer it for a self-plan workspace.
 */
export async function purchaseAdditionalCapacity(
  module: EntitlementModule,
  quantity: number = 1
): Promise<PurchaseAdditionalCapacityResult | PurchaseAdditionalCapacityError> {
  if (quantity < 1) return { ok: false, reason: "Invalid quantity." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "Not authenticated" };

  const admin = createServiceClient();
  const { data: entitlement } = await admin
    .from("entitlements")
    .select("workspace_id, payment_provider, provider_subscription_id, billing_market, billing_interval")
    .eq("module", module)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!entitlement) return { ok: false, reason: "No subscription found for this account." };
  if (!entitlement.payment_provider || !entitlement.provider_subscription_id) {
    return { ok: false, reason: "Add a payment method and start your subscription before buying more capacity." };
  }
  if (isStoreManagedProvider(entitlement.payment_provider as PaymentProviderName)) {
    return { ok: false, reason: "This subscription was purchased through the App Store/Play Store — manage extra capacity from within the mobile app instead." };
  }

  // Both set unconditionally by recordCheckoutIntent/applyProviderSubscriptionSnapshot
  // as soon as any checkout happens — always populated by the time a
  // workspace has a real provider_subscription_id, but fall back to sane
  // defaults rather than throwing if an old row somehow predates that.
  const market = (entitlement.billing_market as BillingMarket | null) ?? "INTL";
  const interval = (entitlement.billing_interval as BillingInterval | null) ?? "monthly";
  // "adults" module covers both Family workspaces and (rarely, for this
  // action) Self — Self has no additional-capacity concept and callers
  // never offer it there, so mapping adults->family here is always correct
  // for any request that actually reaches this far.
  const additionalCapacityPlan: AdditionalCapacityPlan = module === "adults" ? "family" : "coach";
  const price = getAdditionalPersonPrice(market, additionalCapacityPlan, interval);

  const providerName = entitlement.payment_provider as PaymentProviderName;
  const provider = await getProviderByName(providerName);
  // Stripe's add-on amount is identical across family/coach in every
  // non-IN market, so one shared "additional_person" price ID per market is
  // enough there. Razorpay (IN-only) needs the plan-specific tier since the
  // amounts genuinely differ — see BillingPricingTier's own doc.
  const priceId =
    providerName === "stripe"
      ? getStripePriceId(market, "additional_person", interval)
      : getRazorpayPlanId(additionalCapacityPlan === "family" ? "additional_person_family" : "additional_person_coach", interval);

  try {
    const { newTotalQuantity } = await provider.addAdditionalCapacity({
      providerSubscriptionId: entitlement.provider_subscription_id,
      priceId,
      quantity,
    });

    const { data: updatedWorkspace } = await admin
      .from("workspaces")
      .update({ extra_capacity: newTotalQuantity })
      .eq("id", entitlement.workspace_id)
      .select("extra_capacity")
      .single();

    return {
      ok: true,
      newExtraCapacity: updatedWorkspace?.extra_capacity ?? newTotalQuantity,
      amountMinorUnits: price.amountMinorUnits,
      currency: price.currency,
    };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "Something went wrong. Please try again." };
  }
}

/** A fresh trial end (length per TRIAL_LENGTH_DAYS_BY_MODULE) for the "card
 * collected, checkout starts the trial" flow — anchored to the start of
 * tomorrow (UTC) plus the trial length, rather than `now + N*24h`, so
 * Stripe's own Checkout page always shows the full "N days free" rather than
 * "N-1 days free". Stripe computes its displayed trial length as
 * floor(seconds-until-trial-end / 86400) at the moment the checkout page
 * actually renders — by which point some time has always elapsed since this
 * function ran (network round trip to the browser), so an exact `now + N
 * days` reliably reads as one day short. Anchoring to tomorrow's start banks
 * the rest of today as slack, guaranteeing at least a full N days remain no
 * matter when today this runs or how long the page takes to load. */
function freshTrialEndDate(module: EntitlementModule): Date {
  const now = new Date();
  const startOfTomorrowUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return new Date(startOfTomorrowUTC + trialLengthMs(module));
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
