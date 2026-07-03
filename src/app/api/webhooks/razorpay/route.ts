import { NextRequest, NextResponse } from "next/server";
import { razorpayProvider } from "@/lib/billing/providers/razorpay-provider";
import { processProviderWebhook } from "@/lib/billing/webhook-handler";

// Razorpay signs the raw request body with HMAC-SHA256 — never call
// request.json() before verifying.
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  const outcome = await processProviderWebhook(razorpayProvider, "razorpay", rawBody, signature).catch((err) => {
    console.error("[razorpay webhook] processing error:", err instanceof Error ? err.message : err);
    return { result: "ignored" as const, reason: "internal error" };
  });

  if (outcome.result === "invalid_signature") {
    return new NextResponse("Invalid signature", { status: 400 });
  }

  return NextResponse.json({ received: true, result: outcome.result });
}
