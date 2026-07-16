import { createClient } from "@supabase/supabase-js";
import {
  findContactByWhatsappNumber as findContactByWhatsappNumberCore,
  issueOtp as issueOtpCore,
  verifyOtp as verifyOtpCore,
  type ContactType,
  type EndUserContact,
  type VerifyOtpResult,
} from "@nutriai/end-user-core";

export type { ContactType, EndUserContact, VerifyOtpResult };

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** Thin wrapper over @nutriai/end-user-core's core logic — reads this app's
 * env vars (service-role client, OTP pepper, WhatsApp credentials) and
 * delegates the actual DB/WhatsApp work to the shared package, which
 * apps/mobile-api also calls for the mobile OTP login flow. */
export async function findContactByWhatsappNumber(rawNumber: string): Promise<EndUserContact | null> {
  return findContactByWhatsappNumberCore(admin(), rawNumber);
}

export async function issueOtp(contact: EndUserContact): Promise<void> {
  const templateName = process.env.WHATSAPP_OTP_TEMPLATE_NAME;
  if (!templateName) throw new Error("WHATSAPP_OTP_TEMPLATE_NAME is not configured");

  await issueOtpCore(admin(), contact, process.env.END_USER_OTP_PEPPER ?? "", {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN!,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID!,
    templateName,
    languageCode: process.env.WHATSAPP_OTP_TEMPLATE_LANGUAGE ?? "en",
  });
}

export async function verifyOtp(contact: EndUserContact, submittedCode: string): Promise<VerifyOtpResult> {
  return verifyOtpCore(admin(), contact, submittedCode, process.env.END_USER_OTP_PEPPER ?? "");
}
