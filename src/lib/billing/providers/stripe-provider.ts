import type { PaymentProvider, CheckoutParams, CheckoutResult, ProviderSubscriptionSnapshot, WebhookVerifyResult } from "@/lib/billing/provider";
import { getStripePriceId } from "./stripe-price-ids";
import { mapStripeStatus } from "./stripe-status";

// Plain fetch against Stripe's REST API instead of the `stripe` npm SDK —
// the SDK is a large, barely tree-shakeable client (it registers every API
// resource class up front regardless of which ones are actually called),
// and it alone was responsible for a large share of every billing-touching
// route's Cloudflare Pages Function size (checkout, subscription-management,
// this webhook route, and any dashboard page that imports either). Stripe's
// API is plain REST/form-encoded, so hand-rolling the handful of endpoints
// actually used here removes that weight from every one of those routes at
// once. Mirrors the same "plain fetch, no SDK" pattern already used by
// src/lib/billing/welcome-email.ts and src/lib/feedback/send-feedback-email.ts.
const STRIPE_API = "https://api.stripe.com/v1";

function apiKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return key;
}

/** Recursively flattens a params object into Stripe's bracketed
 * form-encoding (e.g. `{ subscription_data: { trial_end: 123 } }` →
 * `subscription_data[trial_end]=123`, `{ line_items: [{ price: "x" }] }` →
 * `line_items[0][price]=x`) — the same encoding Stripe's own client
 * libraries produce for nested/array params. */
function toFormParams(input: Record<string, unknown>, prefix = ""): URLSearchParams {
  const params = new URLSearchParams();
  function walk(value: unknown, key: string) {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, `${key}[${i}]`));
    } else if (typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        walk(v, `${key}[${k}]`);
      }
    } else {
      params.append(key, String(value));
    }
  }
  for (const [k, v] of Object.entries(input)) walk(v, prefix ? `${prefix}[${k}]` : k);
  return params;
}

async function stripeRequest<T = any>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const url = method === "GET" && body
    ? `${STRIPE_API}${path}?${toFormParams(body).toString()}`
    : `${STRIPE_API}${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: method === "POST" && body ? toFormParams(body).toString() : undefined,
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error?.message ?? `Stripe API error (${response.status})`);
  }
  return json as T;
}

export const stripeProvider: PaymentProvider = {
  name: "stripe",

  async createOrRetrieveCustomer({ ownerId, email, existingCustomerId }) {
    if (existingCustomerId) {
      const existing = await stripeRequest<{ id: string; deleted?: boolean }>("GET", `/customers/${existingCustomerId}`);
      if (!existing.deleted) return existing.id;
    }
    const customer = await stripeRequest<{ id: string }>("POST", "/customers", {
      email,
      metadata: { tistra_owner_id: ownerId },
    });
    return customer.id;
  },

  async createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult> {
    const priceId = getStripePriceId(params.market, params.pricingTier ?? params.module, params.interval);

    // Stripe supports delaying the first invoice to a future instant via
    // subscription_data.trial_end — this is how "subscribe during an active
    // trial, charged at trial end" is implemented for Stripe specifically.
    const trialEnd = params.delayBillingUntil
      ? Math.floor(new Date(params.delayBillingUntil).getTime() / 1000)
      : undefined;
    const chargesImmediately = !trialEnd;

    const session = await stripeRequest<{ url: string | null }>("POST", "/checkout/sessions", {
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
    try {
      const sub = await stripeRequest("GET", `/subscriptions/${providerSubscriptionId}`);
      return stripeSubscriptionToSnapshot(sub);
    } catch {
      return null;
    }
  },

  async findLatestSubscriptionForCustomer(customerId: string): Promise<ProviderSubscriptionSnapshot | null> {
    try {
      // status: "all" — a brand-new subscription created seconds ago is
      // "trialing", not "active", and the default list call excludes
      // anything but "active"/"past_due" style statuses.
      const subs = await stripeRequest<{ data: any[] }>("GET", "/subscriptions", { customer: customerId, status: "all", limit: 1 });
      const sub = subs.data[0];
      return sub ? stripeSubscriptionToSnapshot(sub) : null;
    } catch {
      return null;
    }
  },

  async cancelSubscription(providerSubscriptionId: string, atPeriodEnd: boolean): Promise<void> {
    if (atPeriodEnd) {
      await stripeRequest("POST", `/subscriptions/${providerSubscriptionId}`, { cancel_at_period_end: true });
    } else {
      await stripeRequest("DELETE", `/subscriptions/${providerSubscriptionId}`);
    }
  },

  async reactivateSubscription(providerSubscriptionId: string): Promise<boolean> {
    await stripeRequest("POST", `/subscriptions/${providerSubscriptionId}`, { cancel_at_period_end: false });
    return true;
  },

  async openBillingPortal({ customerId, returnUrl }): Promise<string | null> {
    const session = await stripeRequest<{ url: string }>("POST", "/billing_portal/sessions", { customer: customerId, return_url: returnUrl });
    return session.url;
  },

  async addAdditionalCapacity({ providerSubscriptionId, priceId, quantity }): Promise<{ newTotalQuantity: number }> {
    const items = await stripeRequest<{ data: Array<{ id: string; price: { id: string }; quantity?: number }> }>(
      "GET",
      "/subscription_items",
      { subscription: providerSubscriptionId, limit: 100 }
    );
    const existing = items.data.find((item) => item.price.id === priceId);

    if (existing) {
      const newTotalQuantity = (existing.quantity ?? 0) + quantity;
      await stripeRequest("POST", `/subscription_items/${existing.id}`, {
        quantity: newTotalQuantity,
        proration_behavior: "always_invoice",
      });
      return { newTotalQuantity };
    }

    const created = await stripeRequest<{ quantity?: number }>("POST", "/subscription_items", {
      subscription: providerSubscriptionId,
      price: priceId,
      quantity,
      proration_behavior: "always_invoice",
    });
    return { newTotalQuantity: created.quantity ?? quantity };
  },

  // Web Crypto (SubtleCrypto) based HMAC-SHA256 verification, mirroring
  // Stripe's own documented signature scheme exactly (see
  // https://docs.stripe.com/webhooks#verify-manually) — Edge-Runtime
  // compatible, unlike Node's synchronous `crypto` module the SDK's sync
  // constructEvent relies on.
  async verifyWebhookSignature(rawBody: string, signatureHeader: string | null): Promise<WebhookVerifyResult> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret || !signatureHeader) return { valid: false };
    try {
      const parts = Object.fromEntries(
        signatureHeader.split(",").map((part) => {
          const [k, v] = part.split("=");
          return [k, v];
        })
      );
      const timestamp = parts.t;
      const signature = parts.v1;
      if (!timestamp || !signature) return { valid: false };

      // 5-minute tolerance, matching the SDK's default.
      const age = Math.abs(Date.now() / 1000 - Number(timestamp));
      if (!Number.isFinite(age) || age > 300) return { valid: false };

      const signedPayload = `${timestamp}.${rawBody}`;
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
      const expected = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");

      if (expected !== signature) return { valid: false };

      const event = JSON.parse(rawBody);
      return { valid: true, eventId: event.id, eventType: event.type, payload: event };
    } catch {
      return { valid: false };
    }
  },
};

export function stripeSubscriptionToSnapshot(sub: any): ProviderSubscriptionSnapshot {
  const item = sub.items?.data?.[0];
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
