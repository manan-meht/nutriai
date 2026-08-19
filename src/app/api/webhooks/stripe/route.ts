
import { NextRequest, NextResponse } from "next/server";
import { stripeProvider } from "@/lib/billing/providers/stripe-provider";
import { processProviderWebhook } from "@/lib/billing/webhook-handler";
import { createServiceClient } from "@/lib/supabase/server";
import { settleFromCheckoutSession } from "@/lib/club/payments";

// Stripe requires the raw, unparsed request body to verify the signature —
// never call request.json() before this.
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  // Marketplace bookings share this endpoint with subscriptions rather than
  // having their own: same secret, same signature check, one thing to
  // configure in Stripe. A booking session carries hold_id in its metadata,
  // which is what tells the two apart.
  //
  // The signature is verified by processProviderWebhook below; this handler
  // does not trust the payload either — it re-reads the session from Stripe
  // before settling anything.
  const clubOutcome = await handleClubBookingEvent(rawBody, signature).catch((err) => {
    console.error("[stripe webhook] club booking error:", err instanceof Error ? err.message : err);
    return false;
  });
  if (clubOutcome) return NextResponse.json({ received: true, result: "club_booking" });

  const outcome = await processProviderWebhook(stripeProvider, "stripe", rawBody, signature).catch((err) => {
    console.error("[stripe webhook] processing error:", err instanceof Error ? err.message : err);
    return { result: "ignored" as const, reason: "internal error" };
  });

  if (outcome.result === "invalid_signature") {
    return new NextResponse("Invalid signature", { status: 400 });
  }

  // Always 200 for everything else (duplicate/ignored/processed) so Stripe
  // doesn't retry events we've already handled or intentionally skip.
  return NextResponse.json({ received: true, result: outcome.result });
}

/** Settles a marketplace booking when its Checkout session completes.
 *
 * Returns true when the event was a booking payment and was handled, so the
 * subscription pipeline is not asked to make sense of it. */
async function handleClubBookingEvent(rawBody: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return false;
  }
  if (event?.type !== "checkout.session.completed") return false;

  const session = event?.data?.object;
  const holdId: string | undefined = session?.metadata?.hold_id;
  // No hold id means this is a subscription checkout, not a booking.
  if (!holdId || !session?.id) return false;

  // Verify the signature before acting on it — reuse the provider's check
  // rather than a second implementation.
  const verified = await stripeProvider.verifyWebhookSignature(rawBody, signature);
  if (!verified.valid) {
    console.error("[stripe webhook] club booking event failed signature check");
    return false;
  }

  const result = await settleFromCheckoutSession(createServiceClient(), session.id);
  if (!result.ok) {
    // Logged rather than retried: settlement is idempotent and the client's
    // return from Stripe attempts it too, so a transient failure here is
    // usually already resolved.
    console.error("[stripe webhook] settling booking failed:", result.message);
  }
  return true;
}
