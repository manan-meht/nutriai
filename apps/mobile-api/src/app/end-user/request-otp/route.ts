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

  const templateName = process.env.WHATSAPP_OTP_TEMPLATE_NAME;
  if (!templateName) {
    return NextResponse.json({ error: "Couldn't send a code right now. Please try again in a moment." }, { status: 500 });
  }

  try {
    await issueOtp(db, contact, process.env.END_USER_OTP_PEPPER ?? "", {
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN!,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID!,
      templateName,
      languageCode: process.env.WHATSAPP_OTP_TEMPLATE_LANGUAGE ?? "en",
    });
  } catch (err) {
    console.error("[end-user/request-otp] issueOtp failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't send a code right now. Please try again in a moment." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
