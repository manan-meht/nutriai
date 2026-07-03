import { createServiceClient } from "@/lib/supabase/server";
import type { PaymentProvider, PaymentProviderName } from "./provider";
import {
  findEntitlementByProviderSubscriptionId,
  findEntitlementByProviderCustomerId,
  applyProviderSubscriptionSnapshot,
} from "@/lib/entitlements/entitlements";

export type WebhookOutcome =
  | { result: "invalid_signature" }
  | { result: "duplicate" } // already processed — idempotent no-op
  | { result: "ignored"; reason: string } // valid but not an event type we act on, or no matching entitlement
  | { result: "processed" };

/**
 * Shared webhook pipeline for both providers: verify signature -> record
 * the event exactly once (idempotency, survives provider retries) ->
 * resolve which entitlement it belongs to -> pull an authoritative
 * subscription snapshot from the provider (never trust the webhook payload
 * amounts/status directly — re-fetch) -> apply it.
 */
export async function processProviderWebhook(
  provider: PaymentProvider,
  providerName: PaymentProviderName,
  rawBody: string,
  signatureHeader: string | null
): Promise<WebhookOutcome> {
  const verified = await provider.verifyWebhookSignature(rawBody, signatureHeader);
  if (!verified.valid || !verified.eventId || !verified.eventType) {
    return { result: "invalid_signature" };
  }

  const admin = createServiceClient();

  // Idempotency: insert-or-detect-duplicate via the (provider, event_id)
  // unique constraint from migration 0001. If the insert conflicts, this
  // event was already recorded — and if it was already processed, skip.
  const { data: existing } = await admin
    .from("payment_webhook_events")
    .select("id, processed_at")
    .eq("provider", providerName)
    .eq("provider_event_id", verified.eventId)
    .maybeSingle();

  if (existing?.processed_at) {
    return { result: "duplicate" };
  }

  if (!existing) {
    const { error: insertError } = await admin.from("payment_webhook_events").insert({
      provider: providerName,
      provider_event_id: verified.eventId,
      event_type: verified.eventType,
      payload: verified.payload as object,
    });
    // A unique-constraint conflict here means a concurrent request beat us
    // to recording this same event — treat it the same as "already seen"
    // and let that other request's processing (or a future retry) own it.
    if (insertError) return { result: "duplicate" };
  }

  const subscriptionId = extractSubscriptionId(providerName, verified.payload);
  const customerId = extractCustomerId(providerName, verified.payload);

  let target = subscriptionId
    ? await findEntitlementByProviderSubscriptionId(providerName, subscriptionId)
    : null;
  if (!target && customerId) {
    target = await findEntitlementByProviderCustomerId(providerName, customerId);
  }
  // First-time "subscription created" events won't have a matching row yet
  // by provider_subscription_id — fall back to metadata embedded at
  // checkout time (workspace_id/module), which both adapters attach.
  if (!target) {
    const meta = extractMetadata(providerName, verified.payload);
    if (meta) target = meta;
  }

  if (!target || !subscriptionId) {
    await markProcessed(admin, providerName, verified.eventId);
    return { result: "ignored", reason: "no matching entitlement or subscription id" };
  }

  const snapshot = await provider.retrieveSubscription(subscriptionId);
  if (!snapshot) {
    await markProcessed(admin, providerName, verified.eventId);
    return { result: "ignored", reason: "subscription not found at provider" };
  }

  await applyProviderSubscriptionSnapshot({
    workspaceId: target.workspaceId,
    module: target.module,
    provider: providerName,
    snapshot,
  });

  await markProcessed(admin, providerName, verified.eventId);
  return { result: "processed" };
}

async function markProcessed(admin: ReturnType<typeof createServiceClient>, provider: PaymentProviderName, eventId: string) {
  await admin
    .from("payment_webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("provider", provider)
    .eq("provider_event_id", eventId);
}

function extractSubscriptionId(providerName: PaymentProviderName, payload: unknown): string | null {
  const p = payload as any;
  if (providerName === "stripe") {
    const obj = p?.data?.object;
    if (obj?.object === "subscription") return obj.id;
    if (obj?.object === "checkout.session") return obj.subscription ?? null;
    return null;
  }
  // Razorpay: subscription.* events carry payload.subscription.entity.id
  return p?.payload?.subscription?.entity?.id ?? null;
}

function extractCustomerId(providerName: PaymentProviderName, payload: unknown): string | null {
  const p = payload as any;
  if (providerName === "stripe") {
    const obj = p?.data?.object;
    return typeof obj?.customer === "string" ? obj.customer : obj?.customer?.id ?? null;
  }
  return p?.payload?.subscription?.entity?.customer_id ?? null;
}

function extractMetadata(
  providerName: PaymentProviderName,
  payload: unknown
): { workspaceId: string; module: "adults" | "gym" } | null {
  const p = payload as any;
  const meta = providerName === "stripe"
    ? p?.data?.object?.metadata
    : p?.payload?.subscription?.entity?.notes;
  const workspaceId = meta?.tistra_workspace_id;
  const billingModule = meta?.tistra_module;
  if (!workspaceId || (billingModule !== "adults" && billingModule !== "gym")) return null;
  return { workspaceId, module: billingModule };
}
