export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";

// Minimal receiver for a Telnyx Messaging Profile's inbound-SMS webhook.
// Built for a one-off need: reading an OTP SMS sent to a newly-purchased
// Telnyx number during Meta's WhatsApp Business number-verification flow.
// Logs the inbound message body so it can be read from deploy logs — not a
// real integration (no signature verification, no persistence). If this
// number becomes a permanent part of the product (e.g. Telnyx-based SMS),
// replace this with a verified, persisted handler.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  const payload = body?.data?.payload;
  console.log("[telnyx] inbound sms webhook:", JSON.stringify({
    eventType: body?.data?.event_type,
    from: payload?.from?.phone_number,
    to: payload?.to?.[0]?.phone_number,
    text: payload?.text,
    receivedAt: payload?.received_at,
  }));

  // Telnyx expects a 200 regardless of payload shape, or it will retry.
  return new NextResponse("OK", { status: 200 });
}

// Telnyx pings the webhook URL with a GET during Messaging Profile setup
// in some configurations — respond 200 so setup doesn't fail validation.
export async function GET() {
  return new NextResponse("OK", { status: 200 });
}
