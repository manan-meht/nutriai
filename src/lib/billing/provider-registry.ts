import type { BillingMarket } from "./pricing";
import type { PaymentProvider, PaymentProviderName } from "./provider";
import { STRIPE_CHECKOUT_ENABLED, RAZORPAY_CHECKOUT_ENABLED } from "./feature-flags";

/** Which provider handles a given market. IN uses Razorpay (feature-flagged,
 * see spec §14); every other market uses Stripe. */
export function providerNameForMarket(market: BillingMarket): PaymentProviderName {
  return market === "IN" ? "razorpay" : "stripe";
}

// Dynamic imports (not static top-of-file ones) — this registry is reachable
// from every dashboard/billing page/route just to resolve a provider name or
// market, and a static import of both providers pulls the (large) stripe
// Node SDK into every one of those routes' Cloudflare Pages Function
// bundles whether or not that specific route ever calls a provider method.
// That pushed the combined Functions bundle over Cloudflare Pages' 25 MiB
// limit and failed the last two deploys — see this file's git history.
// Dynamic import lets each route that actually needs Stripe/Razorpay code
// split it into its own chunk instead.
export async function getProviderForMarket(market: BillingMarket): Promise<PaymentProvider> {
  const name = providerNameForMarket(market);
  if (name === "razorpay") {
    if (!RAZORPAY_CHECKOUT_ENABLED) {
      throw new Error(
        "Razorpay checkout is not yet enabled for this deployment (NEXT_PUBLIC_RAZORPAY_ENABLED=false). " +
        "India merchant/recurring-payment approval is pending — see the completion report."
      );
    }
    return (await import("./providers/razorpay-provider")).razorpayProvider;
  }
  if (!STRIPE_CHECKOUT_ENABLED) {
    throw new Error("Stripe checkout is not enabled for this deployment (NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED=false).");
  }
  return (await import("./providers/stripe-provider")).stripeProvider;
}

export async function getProviderByName(name: PaymentProviderName): Promise<PaymentProvider> {
  if (name === "apple" || name === "google_play") {
    // Store subscriptions (via RevenueCat) are managed entirely in-app —
    // there's no PaymentProvider implementation for these (see
    // provider.ts's PaymentProviderName comment), so any caller reaching
    // here has a bug: check isStoreManagedProvider() first, same as
    // subscription-management.ts's action functions do.
    throw new Error(
      `${name} subscriptions are managed via the App Store/Play Store, not this web provider interface — check isStoreManagedProvider() before calling getProviderByName().`
    );
  }
  if (name === "razorpay") return (await import("./providers/razorpay-provider")).razorpayProvider;
  return (await import("./providers/stripe-provider")).stripeProvider;
}

/** True for subscriptions purchased via RevenueCat (Apple/Google Play) —
 * these have no web-manageable equivalent (cancel/reactivate/billing
 * portal all happen in-app or via the store's own subscription
 * management), so callers must branch on this before reaching for
 * getProviderByName(). */
export function isStoreManagedProvider(name: PaymentProviderName | null | undefined): boolean {
  return name === "apple" || name === "google_play";
}
