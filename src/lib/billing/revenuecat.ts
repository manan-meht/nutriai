import type { EntitlementStatus } from "@/lib/entitlements/entitlements";
import type { PaymentProviderName, ProviderSubscriptionSnapshot } from "./provider";

// RevenueCat webhook event shape (subset actually used) — see
// https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields.
// Unlike Stripe/Razorpay, RevenueCat's webhook already carries the
// authoritative entitlement state directly (it's the system of record for
// the purchase, having already verified the receipt with Apple/Google) —
// there's no "re-fetch from the provider API" step here the way
// webhook-handler.ts does for Stripe/Razorpay, since there's nothing more
// authoritative to fetch than what RevenueCat already verified.
export type RevenueCatEventType =
  | "INITIAL_PURCHASE"
  | "RENEWAL"
  | "CANCELLATION"
  | "UNCANCELLATION"
  | "NON_RENEWING_PURCHASE"
  | "SUBSCRIPTION_PAUSED"
  | "EXPIRATION"
  | "BILLING_ISSUE"
  | "PRODUCT_CHANGE"
  | "SUBSCRIPTION_EXTENDED"
  | "TRANSFER"
  | "TEST";

export type RevenueCatStore = "APP_STORE" | "MAC_APP_STORE" | "PLAY_STORE" | "AMAZON" | "STRIPE" | "PROMOTIONAL";

export interface RevenueCatEvent {
  id: string;
  type: RevenueCatEventType;
  app_user_id: string;
  original_app_user_id?: string;
  product_id?: string;
  period_type?: "TRIAL" | "INTRO" | "NORMAL";
  purchased_at_ms?: number | null;
  expiration_at_ms?: number | null;
  event_timestamp_ms?: number;
  store: RevenueCatStore;
  environment?: "SANDBOX" | "PRODUCTION";
  original_transaction_id?: string;
}

/** Only the two stores this app currently sells subscriptions through map
 * to a payment_provider value — Stripe-via-RevenueCat/Amazon/promotional
 * grants aren't part of this rollout (Self/Family mobile only, per this
 * feature's scope) and are left for the caller to ignore. */
export function providerForStore(store: RevenueCatStore): PaymentProviderName | null {
  if (store === "APP_STORE" || store === "MAC_APP_STORE") return "apple";
  if (store === "PLAY_STORE") return "google_play";
  return null;
}

function toIso(ms: number | null | undefined): string | null {
  return typeof ms === "number" ? new Date(ms).toISOString() : null;
}

/** Maps a RevenueCat event to our internal status. TEST events (sent by
 * the "send test webhook" button in the RevenueCat dashboard) and any
 * event type this app doesn't act on yet return null — callers should
 * acknowledge (200) without touching an entitlement row. */
export function mapRevenueCatEventToStatus(event: RevenueCatEvent): EntitlementStatus | null {
  switch (event.type) {
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "UNCANCELLATION":
    case "PRODUCT_CHANGE":
    case "SUBSCRIPTION_EXTENDED":
    case "NON_RENEWING_PURCHASE":
    case "TRANSFER":
      return event.period_type === "TRIAL" ? "trialing" : "active";
    case "CANCELLATION":
      // Auto-renew turned off, but access continues until expiration_at_ms
      // — matches cancel_at_period_end's existing semantics exactly.
      return "cancel_at_period_end";
    case "SUBSCRIPTION_PAUSED":
      // Google Play's subscription-pause feature (no Apple equivalent) —
      // access is suspended but the subscription isn't cancelled. Closest
      // existing fit; revisit if this needs to be visually distinct from
      // an ordinary pending cancellation. TODO.
      return "cancel_at_period_end";
    case "EXPIRATION":
      return "expired";
    case "BILLING_ISSUE":
      return "grace_period";
    case "TEST":
      return null;
    default:
      return null;
  }
}

export function buildSnapshotFromRevenueCatEvent(event: RevenueCatEvent): ProviderSubscriptionSnapshot | null {
  const status = mapRevenueCatEventToStatus(event);
  if (!status) return null;

  return {
    // original_transaction_id is stable across renewals (unlike each
    // individual transaction id), the closest equivalent to Stripe's
    // subscription id — falls back to the event's own id for event types
    // that don't carry one (shouldn't happen for the types mapped above).
    providerSubscriptionId: event.original_transaction_id ?? event.id,
    providerCustomerId: event.app_user_id,
    status,
    currentPeriodStart: toIso(event.purchased_at_ms),
    currentPeriodEnd: toIso(event.expiration_at_ms),
    cancelAtPeriodEnd: event.type === "CANCELLATION" || event.type === "SUBSCRIPTION_PAUSED",
    cancelledAt: event.type === "CANCELLATION" ? toIso(event.event_timestamp_ms) : null,
  };
}
