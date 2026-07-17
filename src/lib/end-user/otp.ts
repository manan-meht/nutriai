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
  return verifyOtpCore(admin(), contact, submittedCode, process.env.END_USER_OTP_PEPPER ?? "");
}
