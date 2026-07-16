import { NextRequest, NextResponse } from "next/server";
import { findContactByWhatsappNumber, verifyOtp, createEndUserSessionToken } from "@nutriai/end-user-core";
import { createServiceClient } from "@/lib/supabase";

export const runtime = "edge";

// Reads the same PARENT_TRUSTED_SESSION_DAYS env var the main web app's
// parentTrustedSessionDays() (src/lib/billing/feature-flags.ts) reads, so
// mobile and web sessions share the same TTL without duplicating that
// helper into a shared package for one config value.
function sessionTtlDays(): number {
  const raw = Number(process.env.PARENT_TRUSTED_SESSION_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : 90;
}

// POST /end-user/verify-otp — mobile equivalent of the web app's
// verifyOtpAction + createEndUserSession. Unlike web (which sets an
// httpOnly cookie), this returns the raw session token as JSON — the
// mobile app persists it in SecureStore and sends it back as
// `Authorization: Bearer <token>` on every subsequent /end-user/* call.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const whatsappNumber = body?.whatsappNumber;
  const code = body?.code;
  const deviceLabel = typeof body?.deviceLabel === "string" ? body.deviceLabel : undefined;

  if (typeof whatsappNumber !== "string" || !whatsappNumber || typeof code !== "string" || !code) {
    return NextResponse.json({ error: "whatsappNumber and code are required" }, { status: 400 });
  }

  const db = createServiceClient();
  const contact = await findContactByWhatsappNumber(db, whatsappNumber);
  if (!contact) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const result = await verifyOtp(db, contact, code, process.env.END_USER_OTP_PEPPER ?? "");
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 401 });
  }

  const sessionToken = await createEndUserSessionToken(db, contact, sessionTtlDays() * 24 * 60 * 60 * 1000, deviceLabel);

  return NextResponse.json({
    sessionToken,
    contactId: contact.contactId,
    contactType: contact.contactType,
    fullName: contact.fullName,
  });
}
