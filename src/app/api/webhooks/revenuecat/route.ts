export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { findEntitlementByOwner, applyProviderSubscriptionSnapshot } from "@/lib/entitlements/entitlements";
import { buildSnapshotFromRevenueCatEvent, providerForStore, type RevenueCatEvent } from "@/lib/billing/revenuecat";

// RevenueCat webhook — Self/Family (module "adults") mobile subscriptions
// only, per this feature's rollout scope (Coach/Gym stays web/manual
// billing for now). Unlike Stripe/Razorpay (see webhook-handler.ts),
// RevenueCat's payload is already the authoritative, receipt-verified
// entitlement state, and its subscriber identity (app_user_id) is
// configured client-side to always be the Supabase auth user id — so
// resolution is a direct owner_id lookup, no provider_subscription_id/
// customer_id/checkout-metadata fallback chain needed.
//
// RevenueCat doesn't sign webhooks with an HMAC scheme like Stripe/
// Razorpay — it sends back whatever fixed Authorization header value you
// configure in its dashboard, verbatim, on every request. A plain string
// compare against that shared secret is the whole verification step.
export async function POST(request: NextRequest) {
  const expectedAuth = process.env.REVENUECAT_WEBHOOK_AUTH_HEADER;
  const authHeader = request.headers.get("authorization");
  if (!expectedAuth || authHeader !== expectedAuth) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const event = body?.event as RevenueCatEvent | undefined;
  if (!event?.id || !event.type || !event.app_user_id) {
    return NextResponse.json({ received: true, result: "ignored", reason: "malformed payload" });
  }

  const admin = createServiceClient();

  // Idempotency, same table/pattern Stripe/Razorpay use (see
  // webhook-handler.ts) — keyed by (provider, provider_event_id). The
  // store (apple/google_play), not "revenuecat", is the provider value
  // here since payment_provider's DB enum has no "revenuecat" member —
  // RevenueCat is the integration layer, not a store.
  const provider = providerForStore(event.store);
  if (!provider) {
    return NextResponse.json({ received: true, result: "ignored", reason: `unsupported store ${event.store}` });
  }

  const { data: existing } = await admin
    .from("payment_webhook_events")
    .select("id, processed_at")
    .eq("provider", provider)
    .eq("provider_event_id", event.id)
    .maybeSingle();

  if (existing?.processed_at) {
    return NextResponse.json({ received: true, result: "duplicate" });
  }

  if (!existing) {
    const { error: insertError } = await admin.from("payment_webhook_events").insert({
      provider,
      provider_event_id: event.id,
      event_type: event.type,
      payload: body as object,
    });
    if (insertError) return NextResponse.json({ received: true, result: "duplicate" });
  }

  const markProcessed = () =>
    admin
      .from("payment_webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("provider", provider)
      .eq("provider_event_id", event.id);

  const snapshot = buildSnapshotFromRevenueCatEvent(event);
  if (!snapshot) {
    await markProcessed();
    return NextResponse.json({ received: true, result: "ignored", reason: `event type ${event.type} not acted on` });
  }

  // Self/Family only — see this route's module doc comment.
  const target = await findEntitlementByOwner(event.app_user_id, "adults");
  if (!target) {
    await markProcessed();
    return NextResponse.json({ received: true, result: "ignored", reason: "no matching adults entitlement for this app_user_id" });
  }

  await applyProviderSubscriptionSnapshot({
    workspaceId: target.workspaceId,
    module: "adults",
    provider,
    providerPriceId: event.product_id ?? null,
    snapshot,
  });

  await markProcessed();
  return NextResponse.json({ received: true, result: "processed" });
}
