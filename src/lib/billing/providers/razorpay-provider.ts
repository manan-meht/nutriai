import Razorpay from "razorpay";
import type { PaymentProvider, CheckoutParams, CheckoutResult, ProviderSubscriptionSnapshot, WebhookVerifyResult } from "@/lib/billing/provider";
import { getRazorpayPlanId } from "./razorpay-plan-ids";
import { mapRazorpayStatus } from "./razorpay-status";

function client(): Razorpay {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Razorpay credentials are not configured");
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

export const razorpayProvider: PaymentProvider = {
  name: "razorpay",

  async createOrRetrieveCustomer({ ownerId, email, existingCustomerId }) {
    const rzp = client();
    if (existingCustomerId) {
      try {
        const existing = await rzp.customers.fetch(existingCustomerId);
        if (existing) return existing.id;
      } catch {
        // fall through to create
      }
    }
    // fail_existing: 0 returns the existing customer for this email instead
    // of throwing "Customer already exists" — which is what happens when
    // the same person checks out a second module, since existingCustomerId
    // is looked up per workspace + module.
    const customer = await rzp.customers.create({
      email,
      fail_existing: 0,
      notes: { tistra_owner_id: ownerId },
    } as any);
    return customer.id;
  },

  async createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult> {
    if (params.market !== "IN") {
      throw new Error("Razorpay checkout is only available for the IN market");
    }
    const rzp = client();
    const planId = getRazorpayPlanId(params.pricingTier ?? params.module, params.interval);

    // Razorpay subscriptions support delayed billing via start_at (unix
    // seconds) — the equivalent of Stripe's trial_end for
    // "subscribe during trial, first charge when the trial ends".
    const startAt = params.delayBillingUntil
      ? Math.floor(new Date(params.delayBillingUntil).getTime() / 1000)
      : undefined;
    const chargesImmediately = !startAt;

    const subscription = await rzp.subscriptions.create({
      plan_id: planId,
      customer_notify: 1,
      total_count: 120, // effectively unlimited recurring cycles (10 years)
      start_at: startAt,
      notes: {
        tistra_workspace_id: params.workspaceId,
        tistra_owner_id: params.ownerId,
        tistra_module: params.module,
      },
    } as any);

    const shortUrl = (subscription as any).short_url;
    if (!shortUrl) throw new Error("Razorpay did not return a hosted checkout URL");
    return { url: shortUrl, chargesImmediately };
  },

  async retrieveSubscription(providerSubscriptionId: string): Promise<ProviderSubscriptionSnapshot | null> {
    const rzp = client();
    try {
      const sub: any = await rzp.subscriptions.fetch(providerSubscriptionId);
      return razorpaySubscriptionToSnapshot(sub);
    } catch {
      return null;
    }
  },

  // Razorpay's API has no simple "list subscriptions by customer_id" the
  // way Stripe does. Returning null here means the IN market doesn't get
  // the "sync immediately on checkout return" behavior Stripe gets (see
  // syncCheckoutCompletion) — the entitlement updates when the
  // subscription.* webhook arrives instead.
  async findLatestSubscriptionForCustomer(): Promise<ProviderSubscriptionSnapshot | null> {
    return null;
  },

  async cancelSubscription(providerSubscriptionId: string, atPeriodEnd: boolean): Promise<void> {
    const rzp = client();
    await rzp.subscriptions.cancel(providerSubscriptionId, atPeriodEnd);
  },

  async reactivateSubscription(_providerSubscriptionId: string): Promise<boolean> {
    // Razorpay does not support resuming a subscription already scheduled
    // for cancellation — the caller must create a new subscription instead.
    return false;
  },

  async addAdditionalCapacity(): Promise<{ newTotalQuantity: number }> {
    // Razorpay subscriptions don't support Stripe-style persistent,
    // quantity-adjustable line items — its "addons" API is a one-time
    // invoice charge, not a recurring per-unit quantity that renews with
    // the subscription. Self-serve extra capacity isn't available on this
    // provider yet — callers should catch this and fall back to a
    // contact-support message rather than surfacing it raw.
    throw new Error("Buying additional capacity isn't available for Razorpay subscriptions yet — please contact support.");
  },

  async openBillingPortal(): Promise<string | null> {
    // Razorpay has no self-serve hosted billing portal equivalent to
    // Stripe's; subscription management happens through the subscription's
    // own short_url (for payment method) or custom in-app UI (see
    // dashboard's "Manage subscription" screen).
    return null;
  },

  /**
   * Edge-Runtime-compatible signature verification using the Web Crypto API
   * (crypto.subtle) instead of Node's `crypto` module, which isn't available
   * under Cloudflare's Edge Runtime. HMAC-SHA256 over the raw body, compared
   * against the X-Razorpay-Signature header in constant time.
   *
   * The event id comes from the X-Razorpay-Event-Id header: a Razorpay
   * webhook body has no top-level id (its keys are entity, account_id,
   * event, contains, payload, created_at). Reading payload.id here, as this
   * once did, left every event without an id, which processProviderWebhook
   * treats as unverifiable — every signed webhook got a 400.
   */
  async verifyWebhookSignature(rawBody: string, signatureHeader: string | null, eventIdHeader?: string | null): Promise<WebhookVerifyResult> {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret || !signatureHeader) return { valid: false };

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signatureBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
    const expectedHex = Array.from(new Uint8Array(signatureBytes)).map((b) => b.toString(16).padStart(2, "0")).join("");

    if (!timingSafeEqualHex(expectedHex, signatureHeader)) return { valid: false };

    try {
      const payload = JSON.parse(rawBody);
      return {
        valid: true,
        eventId: eventIdHeader || fallbackEventId(payload),
        eventType: payload.event,
        payload,
      };
    } catch {
      return { valid: false };
    }
  },
};

/** Razorpay documents X-Razorpay-Event-Id on every webhook, so this should
 * never be needed. If it is, rejecting a correctly signed event would make
 * Razorpay retry it until it disables the webhook, so derive a key from the
 * signed body instead. created_at is fixed per event and kept across
 * retries, so the key still de-duplicates. */
function fallbackEventId(payload: any): string | undefined {
  const entityId = payload?.payload?.subscription?.entity?.id ?? payload?.payload?.payment?.entity?.id;
  if (!payload?.event || !entityId || !payload?.created_at) return undefined;
  return `${payload.event}:${entityId}:${payload.created_at}`;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function razorpaySubscriptionToSnapshot(sub: any): ProviderSubscriptionSnapshot {
  return {
    providerSubscriptionId: sub.id,
    providerCustomerId: sub.customer_id ?? "",
    status: mapRazorpayStatus(sub.status),
    currentPeriodStart: sub.current_start ? new Date(sub.current_start * 1000).toISOString() : null,
    currentPeriodEnd: sub.current_end ? new Date(sub.current_end * 1000).toISOString() : null,
    cancelAtPeriodEnd: !!sub.cancel_at_cycle_end,
    cancelledAt: sub.ended_at ? new Date(sub.ended_at * 1000).toISOString() : null,
    // Razorpay subscriptions don't support a delayed-first-charge trial the
    // way Stripe's subscription_data.trial_end does — no trial concept to
    // report here.
    trialStart: null,
    trialEnd: null,
  };
}
