import type { BillingModule, BillingInterval, BillingMarket } from "./pricing";
import type { EntitlementStatus } from "@/lib/entitlements/entitlements";

// "apple"/"google_play" are store-billing providers reached only via
// RevenueCat (see src/lib/billing/revenuecat.ts) — purchases happen
// in-app through the RevenueCat SDK, never a hosted checkout redirect, so
// these two never implement the PaymentProvider interface below
// (createCheckoutSession etc. don't apply). They exist here purely as
// values for the entitlements.payment_provider column and
// ProviderSubscriptionSnapshot's provider tag, reusing the same
// apply/lookup pipeline stripe/razorpay use.
export type PaymentProviderName = "stripe" | "razorpay" | "apple" | "google_play";

export interface CheckoutParams {
  workspaceId: string;
  ownerId: string;
  ownerEmail: string;
  module: BillingModule;
  market: BillingMarket;
  interval: BillingInterval;
  /** ISO timestamp to delay the first charge to (e.g. end of an active
   * trial). Providers that can't support this must charge immediately and
   * the caller is responsible for disclosing that before confirmation. */
  delayBillingUntil?: string | null;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  url: string;
  /** True if the provider will charge today (delayBillingUntil was ignored
   * or unsupported) — callers must disclose this before redirecting. */
  chargesImmediately: boolean;
}

export interface ProviderSubscriptionSnapshot {
  providerSubscriptionId: string;
  providerCustomerId: string;
  status: EntitlementStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  cancelledAt: string | null;
  /** Provider-reported trial window, when the provider supports trials
   * (Stripe does via subscription_data.trial_end; Razorpay currently
   * doesn't, so its provider always returns null here). This is the only
   * place trial_start_at/trial_end_at get written once a subscription was
   * created via checkout with a delayed first charge — see
   * applyProviderSubscriptionSnapshot. */
  trialStart: string | null;
  trialEnd: string | null;
}

export interface WebhookVerifyResult {
  valid: boolean;
  eventId?: string;
  eventType?: string;
  /** Parsed, provider-specific payload — passed through to processWebhookEvent. */
  payload?: unknown;
}

/**
 * Provider-neutral interface. Entitlement logic (trial state, read-only
 * enforcement, account limits) never talks to Stripe or Razorpay directly —
 * only through this interface, so adding a third provider later doesn't
 * touch entitlement code.
 */
export interface PaymentProvider {
  name: PaymentProviderName;

  createOrRetrieveCustomer(params: { ownerId: string; email: string; existingCustomerId?: string | null }): Promise<string>;

  createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult>;

  retrieveSubscription(providerSubscriptionId: string): Promise<ProviderSubscriptionSnapshot | null>;

  cancelSubscription(providerSubscriptionId: string, atPeriodEnd: boolean): Promise<void>;

  /** Resumes a subscription previously scheduled to cancel at period end.
   * Not all providers support this once cancellation is scheduled. */
  reactivateSubscription(providerSubscriptionId: string): Promise<boolean>;

  /** Returns a hosted billing-management URL (payment method update,
   * invoices, plan changes) where the provider supports one. */
  openBillingPortal(params: { customerId: string; returnUrl: string }): Promise<string | null>;

  /** Verifies the raw webhook request against the provider's signature
   * scheme. Must be called before any event processing — never trust an
   * unverified payload. Async because signature verification uses the Web
   * Crypto API (crypto.subtle), which is promise-based and Edge-Runtime
   * compatible, unlike Node's synchronous `crypto` module. */
  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): Promise<WebhookVerifyResult>;
}
