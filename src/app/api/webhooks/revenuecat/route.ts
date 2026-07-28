export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { findEntitlementByOwner, applyProviderSubscriptionSnapshot } from "@/lib/entitlements/entitlements";
import { buildSnapshotFromRevenueCatEvent, providerForStore, moduleForRevenueCatProductId, extraCapacityModuleForRevenueCatProductId, mapRevenueCatEventToStatus, isActiveIshStatus, type RevenueCatEvent } from "@/lib/billing/revenuecat";

// RevenueCat webhook — Self, Family, and Coach mobile subscriptions all go
// through here (module resolved per-event from the purchased product id,
// see moduleForRevenueCatProductId). Unlike Stripe/Razorpay (see
// webhook-handler.ts), RevenueCat's payload is already the authoritative,
// receipt-verified entitlement state, and its subscriber identity
// (app_user_id) is configured client-side to always be the Supabase auth
// user id — so resolution is a direct owner_id lookup, no
// provider_subscription_id/customer_id/checkout-metadata fallback chain
// needed.
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
    if (insertError) {
      // "23505" (unique_violation) means a concurrent request already
      // recorded this exact event — genuinely a duplicate, safe to treat
      // as already-seen. Any other error (e.g. the "invalid input value
      // for enum payment_provider" that silently swallowed every real
      // store webhook here for a long time, see migration 0042) must
      // surface loudly instead — returning 200 "duplicate" for it means
      // RevenueCat never retries and this app never notices anything went
      // wrong at all.
      if (insertError.code === "23505") {
        return NextResponse.json({ received: true, result: "duplicate" });
      }
      console.error("[revenuecat-webhook] failed to record event:", event.id, insertError.message);
      return NextResponse.json({ received: false, error: insertError.message }, { status: 500 });
    }
  }

  const markProcessed = () =>
    admin
      .from("payment_webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("provider", provider)
      .eq("provider_event_id", event.id);

  // Extra-capacity add-on purchases (adults_additional_person /
  // coach_additional_person) don't carry their own plan/trial/status the
  // way self_premium/family_premium/coach_premium do — they only ever
  // toggle workspaces.extra_capacity on (still-active-ish status) or off
  // (expired/cancelled), so they're handled entirely separately from
  // applyProviderSubscriptionSnapshot below. See this v1's scope: mobile
  // only supports buying exactly one extra slot (a boolean, not an
  // adjustable Stripe-style quantity) — buying more than one requires web.
  const extraCapacityModule = extraCapacityModuleForRevenueCatProductId(event.product_id);
  if (extraCapacityModule) {
    const status = mapRevenueCatEventToStatus(event);
    if (status) {
      const target = await findEntitlementByOwner(event.app_user_id, extraCapacityModule);
      if (target) {
        await admin
          .from("workspaces")
          .update({ extra_capacity: isActiveIshStatus(status) ? 1 : 0 })
          .eq("id", target.workspaceId);
      }
    }
    await markProcessed();
    return NextResponse.json({ received: true, result: "processed" });
  }

  const snapshot = buildSnapshotFromRevenueCatEvent(event);
  if (!snapshot) {
    await markProcessed();
    return NextResponse.json({ received: true, result: "ignored", reason: `event type ${event.type} not acted on` });
  }

  const entitlementModule = moduleForRevenueCatProductId(event.product_id);
  if (!entitlementModule) {
    await markProcessed();
    return NextResponse.json({ received: true, result: "ignored", reason: `unrecognized product id ${event.product_id}` });
  }

  const target = await findEntitlementByOwner(event.app_user_id, entitlementModule);
  if (!target) {
    await markProcessed();
    return NextResponse.json({ received: true, result: "ignored", reason: `no matching ${entitlementModule} entitlement for this app_user_id` });
  }

  await applyProviderSubscriptionSnapshot({
    workspaceId: target.workspaceId,
    module: entitlementModule,
    provider,
    providerPriceId: event.product_id ?? null,
    snapshot,
    ownerId: target.ownerId,
  });

  await markProcessed();
  return NextResponse.json({ received: true, result: "processed" });
}
