import type { BillingMarket } from "./pricing";
import type { PaymentProvider, PaymentProviderName } from "./provider";
import { stripeProvider } from "./providers/stripe-provider";
import { razorpayProvider } from "./providers/razorpay-provider";
import { STRIPE_CHECKOUT_ENABLED, RAZORPAY_CHECKOUT_ENABLED } from "./feature-flags";

/** Which provider handles a given market. IN uses Razorpay (feature-flagged,
 * see spec §14); every other market uses Stripe. */
export function providerNameForMarket(market: BillingMarket): PaymentProviderName {
  return market === "IN" ? "razorpay" : "stripe";
}

export function getProviderForMarket(market: BillingMarket): PaymentProvider {
  const name = providerNameForMarket(market);
  if (name === "razorpay") {
    if (!RAZORPAY_CHECKOUT_ENABLED) {
      throw new Error(
        "Razorpay checkout is not yet enabled for this deployment (NEXT_PUBLIC_RAZORPAY_ENABLED=false). " +
        "India merchant/recurring-payment approval is pending — see the completion report."
      );
    }
    return razorpayProvider;
  }
  if (!STRIPE_CHECKOUT_ENABLED) {
    throw new Error("Stripe checkout is not enabled for this deployment (NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED=false).");
  }
  return stripeProvider;
}

export function getProviderByName(name: PaymentProviderName): PaymentProvider {
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
  return name === "razorpay" ? razorpayProvider : stripeProvider;
}

/** True for subscriptions purchased via RevenueCat (Apple/Google Play) —
 * these have no web-manageable equivalent (cancel/reactivate/billing
 * portal all happen in-app or via the store's own subscription
 * management), so callers must branch on this before reaching for
 * getProviderByName(). */
export function isStoreManagedProvider(name: PaymentProviderName | null | undefined): boolean {
  return name === "apple" || name === "google_play";
}
