import { NextRequest, NextResponse } from "next/server";
import { stripeProvider } from "@/lib/billing/providers/stripe-provider";
import { processProviderWebhook } from "@/lib/billing/webhook-handler";

// Stripe requires the raw, unparsed request body to verify the signature —
// never call request.json() before this.
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

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
