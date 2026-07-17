import { NextRequest, NextResponse } from "next/server";
import { findContactByWhatsappNumber, issueOtp } from "@nutriai/end-user-core";
import { createServiceClient } from "@/lib/supabase";

export const runtime = "edge";

// POST /end-user/request-otp — mobile equivalent of the web app's
// requestOtpAction (src/app/(public)/my-progress/actions.ts). Public (no
// auth) by design — this *is* the first step of authenticating; the
// WhatsApp number itself is the only "credential" here, verified by the
// OTP that follows.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const whatsappNumber = body?.whatsappNumber;
  if (typeof whatsappNumber !== "string" || !whatsappNumber) {
    return NextResponse.json({ error: "whatsappNumber is required" }, { status: 400 });
  }

  const db = createServiceClient();
  const contact = await findContactByWhatsappNumber(db, whatsappNumber);
  if (!contact) {
    return NextResponse.json({ error: "We couldn't find that number. Ask whoever added you to double-check it." }, { status: 404 });
  }

  try {
    await issueOtp(db, contact, process.env.END_USER_OTP_PEPPER ?? "", {
      msg91: {
        authKey: process.env.MSG91_AUTH_KEY!,
        templateId: process.env.MSG91_OTP_TEMPLATE_ID!,
        senderId: process.env.MSG91_SENDER_ID!,
      },
      twilio: {
        accountSid: process.env.TWILIO_ACCOUNT_SID!,
        authToken: process.env.TWILIO_AUTH_TOKEN!,
        fromNumberOrMessagingServiceSid: process.env.TWILIO_FROM_NUMBER_OR_MESSAGING_SERVICE_SID!,
      },
    });
  } catch (err) {
    console.error("[end-user/request-otp] issueOtp failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't send a code right now. Please try again in a moment." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
