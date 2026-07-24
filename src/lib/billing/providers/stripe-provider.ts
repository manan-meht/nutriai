import Stripe from "stripe";
import type { PaymentProvider, CheckoutParams, CheckoutResult, ProviderSubscriptionSnapshot, WebhookVerifyResult } from "@/lib/billing/provider";
import { getStripePriceId } from "./stripe-price-ids";
import { mapStripeStatus } from "./stripe-status";

function client(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  // Explicit fetch-based HTTP client — Stripe's default Node HTTP client
  // relies on Node's `http`/`https` modules, unavailable under Cloudflare's
  // Edge Runtime. The fetch client works in both edge and Node.
  return new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
}

export const stripeProvider: PaymentProvider = {
  name: "stripe",

  async createOrRetrieveCustomer({ ownerId, email, existingCustomerId }) {
    const stripe = client();
    if (existingCustomerId) {
      const existing = await stripe.customers.retrieve(existingCustomerId);
      if (!existing.deleted) return existing.id;
    }
    const customer = await stripe.customers.create({
      email,
      metadata: { tistra_owner_id: ownerId },
    });
    return customer.id;
  },

  async createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult> {
    const stripe = client();
    const priceId = getStripePriceId(params.market, params.pricingTier ?? params.module, params.interval);

    // Stripe supports delaying the first invoice to a future instant via
    // subscription_data.trial_end — this is how "subscribe during an active
    // trial, charged at trial end" is implemented for Stripe specifically.
    const trialEnd = params.delayBillingUntil
      ? Math.floor(new Date(params.delayBillingUntil).getTime() / 1000)
      : undefined;
    const chargesImmediately = !trialEnd;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: params.ownerEmail,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      subscription_data: {
        trial_end: trialEnd,
        metadata: {
          tistra_workspace_id: params.workspaceId,
          tistra_owner_id: params.ownerId,
          tistra_module: params.module,
        },
      },
      metadata: {
        tistra_workspace_id: params.workspaceId,
        tistra_owner_id: params.ownerId,
        tistra_module: params.module,
      },
    });

    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { url: session.url, chargesImmediately };
  },

  async retrieveSubscription(providerSubscriptionId: string): Promise<ProviderSubscriptionSnapshot | null> {
    const stripe = client();
    try {
      const sub = await stripe.subscriptions.retrieve(providerSubscriptionId);
      return stripeSubscriptionToSnapshot(sub);
    } catch {
      return null;
    }
  },

  async findLatestSubscriptionForCustomer(customerId: string): Promise<ProviderSubscriptionSnapshot | null> {
    const stripe = client();
    try {
      // status: "all" — a brand-new subscription created seconds ago is
      // "trialing", not "active", and the default list call excludes
      // anything but "active"/"past_due" style statuses.
      const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 1 });
      const sub = subs.data[0];
      return sub ? stripeSubscriptionToSnapshot(sub) : null;
    } catch {
      return null;
    }
  },

  async cancelSubscription(providerSubscriptionId: string, atPeriodEnd: boolean): Promise<void> {
    const stripe = client();
    if (atPeriodEnd) {
      await stripe.subscriptions.update(providerSubscriptionId, { cancel_at_period_end: true });
    } else {
      await stripe.subscriptions.cancel(providerSubscriptionId);
    }
  },

  async reactivateSubscription(providerSubscriptionId: string): Promise<boolean> {
    const stripe = client();
    await stripe.subscriptions.update(providerSubscriptionId, { cancel_at_period_end: false });
    return true;
  },

  async openBillingPortal({ customerId, returnUrl }): Promise<string | null> {
    const stripe = client();
    const session = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
    return session.url;
  },

  // Uses constructEventAsync (Web Crypto / SubtleCrypto based) rather than
  // the sync constructEvent, which relies on Node's `crypto` module and
  // isn't available under Cloudflare's Edge Runtime.
  async verifyWebhookSignature(rawBody: string, signatureHeader: string | null): Promise<WebhookVerifyResult> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret || !signatureHeader) return { valid: false };
    try {
      const stripe = client();
      const event = await stripe.webhooks.constructEventAsync(rawBody, signatureHeader, secret);
      return { valid: true, eventId: event.id, eventType: event.type, payload: event };
    } catch {
      return { valid: false };
    }
  },
};

export function stripeSubscriptionToSnapshot(sub: Stripe.Subscription): ProviderSubscriptionSnapshot {
  const item = sub.items.data[0];
  return {
    providerSubscriptionId: sub.id,
    providerCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    status: mapStripeStatus(sub.status, sub.cancel_at_period_end ?? false),
    currentPeriodStart: item?.current_period_start
      ? new Date(item.current_period_start * 1000).toISOString()
      : null,
    currentPeriodEnd: item?.current_period_end
      ? new Date(item.current_period_end * 1000).toISOString()
      : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
    cancelledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
    trialStart: sub.trial_start ? new Date(sub.trial_start * 1000).toISOString() : null,
    trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
  };
}
