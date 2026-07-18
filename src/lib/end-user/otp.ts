import { createClient } from "@supabase/supabase-js";
import {
  findContactByWhatsappNumber as findContactByWhatsappNumberCore,
  issueOtp as issueOtpCore,
  verifyOtp as verifyOtpCore,
  generateAccessCode as generateAccessCodeCore,
  revokeActiveAccessCodes as revokeActiveAccessCodesCore,
  recordAuditEvent,
  type ContactType,
  type EndUserContact,
  type VerifyOtpResult,
  type GeneratedByRole,
} from "@nutriai/end-user-core";

export type { ContactType, EndUserContact, VerifyOtpResult, GeneratedByRole };

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** Thin wrapper over @nutriai/end-user-core's core logic — reads this app's
 * env vars (service-role client, OTP pepper, SMS provider credentials) and
 * delegates the actual DB/send work to the shared package, which
 * apps/mobile-api also calls for the mobile OTP login flow. */
export async function findContactByWhatsappNumber(rawNumber: string): Promise<EndUserContact | null> {
  return findContactByWhatsappNumberCore(admin(), rawNumber);
}

export async function issueOtp(contact: EndUserContact): Promise<void> {
  await issueOtpCore(admin(), contact, process.env.END_USER_OTP_PEPPER ?? "", {
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
}

export async function verifyOtp(contact: EndUserContact, submittedCode: string): Promise<VerifyOtpResult> {
  const db = admin();
  const result = await verifyOtpCore(db, contact, submittedCode, process.env.END_USER_OTP_PEPPER ?? "");
  if (result.ok) {
    await recordAuditEvent(db, "code_used", contact.contactId, contact.contactType);
    await recordAuditEvent(db, "participant_access_granted", contact.contactId, contact.contactType);
  } else {
    await recordAuditEvent(db, "code_verification_failed", contact.contactId, contact.contactType, { metadata: { reason: result.reason } });
  }
  return result;
}

/** Generates a Temporary Access Code for a family owner/coach to share
 * manually — see @nutriai/end-user-core's generateAccessCode. Returns the
 * plaintext code; callers must display it exactly once and never log it. */
export async function generateAccessCode(
  contact: EndUserContact,
  generatedByUserId: string,
  generatedByRole: GeneratedByRole,
  ttlMs?: number
): Promise<{ code: string; expiresAt: string }> {
  const db = admin();
  const result = await generateAccessCodeCore(db, contact, generatedByUserId, generatedByRole, process.env.END_USER_OTP_PEPPER ?? "", ttlMs);
  await recordAuditEvent(db, "code_generated", contact.contactId, contact.contactType, { actorUserId: generatedByUserId });
  return result;
}

/** Regenerates — same as generateAccessCode, but logs "code_regenerated"
 * instead of "code_generated" for a clearer audit trail (generateAccessCode
 * itself already revokes any prior active code either way). */
export async function regenerateAccessCode(
  contact: EndUserContact,
  generatedByUserId: string,
  generatedByRole: GeneratedByRole,
  ttlMs?: number
): Promise<{ code: string; expiresAt: string }> {
  const db = admin();
  const result = await generateAccessCodeCore(db, contact, generatedByUserId, generatedByRole, process.env.END_USER_OTP_PEPPER ?? "", ttlMs);
  await recordAuditEvent(db, "code_regenerated", contact.contactId, contact.contactType, { actorUserId: generatedByUserId });
  return result;
}

export async function revokeAccessCode(contact: EndUserContact, actorUserId: string): Promise<void> {
  const db = admin();
  await revokeActiveAccessCodesCore(db, contact);
  await recordAuditEvent(db, "code_revoked", contact.contactId, contact.contactType, { actorUserId });
}
