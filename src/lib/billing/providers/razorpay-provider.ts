import crypto from "crypto";
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
    const customer = await rzp.customers.create({
      email,
      notes: { tistra_owner_id: ownerId },
    } as any);
    return customer.id;
  },

  async createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult> {
    if (params.market !== "IN") {
      throw new Error("Razorpay checkout is only available for the IN market");
    }
    const rzp = client();
    const planId = getRazorpayPlanId(params.module, params.interval);

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

  async cancelSubscription(providerSubscriptionId: string, atPeriodEnd: boolean): Promise<void> {
    const rzp = client();
    await rzp.subscriptions.cancel(providerSubscriptionId, atPeriodEnd);
  },

  async reactivateSubscription(_providerSubscriptionId: string): Promise<boolean> {
    // Razorpay does not support resuming a subscription already scheduled
    // for cancellation — the caller must create a new subscription instead.
    return false;
  },

  async openBillingPortal(): Promise<string | null> {
    // Razorpay has no self-serve hosted billing portal equivalent to
    // Stripe's; subscription management happens through the subscription's
    // own short_url (for payment method) or custom in-app UI (see
    // dashboard's "Manage subscription" screen).
    return null;
  },

  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): WebhookVerifyResult {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret || !signatureHeader) return { valid: false };

    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    const valid = timingSafeEqualHex(expected, signatureHeader);
    if (!valid) return { valid: false };

    try {
      const payload = JSON.parse(rawBody);
      return {
        valid: true,
        eventId: payload.id ?? undefined,
        eventType: payload.event,
        payload,
      };
    } catch {
      return { valid: false };
    }
  },
};

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
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
  };
}
