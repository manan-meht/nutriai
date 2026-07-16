import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhone, sendWhatsAppTemplate } from "./whatsapp";

export type ContactType = "adults" | "gym";

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export interface EndUserContact {
  contactId: string;
  contactType: ContactType;
  whatsappNumber: string;
  fullName: string;
}

async function hashCode(code: string, whatsappNumber: string, pepper: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${code}:${whatsappNumber}:${pepper}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateSixDigitCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const n = new DataView(bytes.buffer).getUint32(0);
  return String(n % 1_000_000).padStart(6, "0");
}

/** Looks up a WhatsApp number against adults_contacts / gym_clients, the
 * same live tables the WhatsApp bot itself uses — no separate identity
 * store, so this always matches whatever record the caregiver/coach set up.
 * Shared by both the web /my-progress flow and the mobile app's OTP login. */
export async function findContactByWhatsappNumber(db: SupabaseClient, rawNumber: string): Promise<EndUserContact | null> {
  const normalized = normalizePhone(rawNumber);

  const { data: adultsContacts } = await db
    .from("adults_contacts")
    .select("id, full_name, whatsapp_number")
    .is("deleted_at", null);
  const adultsMatch = (adultsContacts ?? []).find(
    (c: any) => normalizePhone(c.whatsapp_number ?? "") === normalized
  );
  if (adultsMatch) {
    return { contactId: adultsMatch.id, contactType: "adults", whatsappNumber: normalized, fullName: adultsMatch.full_name };
  }

  const { data: gymClients } = await db
    .from("gym_clients")
    .select("id, full_name, whatsapp_number")
    .is("deleted_at", null);
  const gymMatch = (gymClients ?? []).find(
    (c: any) => normalizePhone(c.whatsapp_number ?? "") === normalized
  );
  if (gymMatch) {
    return { contactId: gymMatch.id, contactType: "gym", whatsappNumber: normalized, fullName: gymMatch.full_name };
  }

  return null;
}

export interface WhatsAppCredentials {
  accessToken: string;
  phoneNumberId: string;
  templateName: string;
  languageCode: string;
}

/** Issues a fresh OTP and sends it via the pre-approved WhatsApp template
 * (free-form text can't be the first message to a contact who hasn't
 * messaged the business number yet — same constraint as the invite flow).
 * Same OTP flow regardless of caller (web or mobile) — only the delivery
 * channel (WhatsApp) and storage (end_user_otp_codes) are involved, no
 * platform-specific state. */
export async function issueOtp(db: SupabaseClient, contact: EndUserContact, pepper: string, whatsapp: WhatsAppCredentials): Promise<void> {
  const code = generateSixDigitCode();
  const codeHash = await hashCode(code, contact.whatsappNumber, pepper);

  const { error } = await db.from("end_user_otp_codes").insert({
    contact_id: contact.contactId,
    contact_type: contact.contactType,
    whatsapp_number: contact.whatsappNumber,
    code_hash: codeHash,
    expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
  });
  if (error) throw new Error(`Failed to store OTP: ${error.message}`);

  await sendWhatsAppTemplate({
    accessToken: whatsapp.accessToken,
    phoneNumberId: whatsapp.phoneNumberId,
    to: contact.whatsappNumber,
    templateName: whatsapp.templateName,
    languageCode: whatsapp.languageCode,
    bodyParameters: [code],
  });
}

export type VerifyOtpResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "expired" | "already_used" | "too_many_attempts" | "incorrect_code" };

/** Verifies the most recent unconsumed OTP for this number. Rate-limited
 * per-code (not just per-number) so a slow brute-force against one issued
 * code is blocked without needing a separate global rate limiter. */
export async function verifyOtp(db: SupabaseClient, contact: EndUserContact, submittedCode: string, pepper: string): Promise<VerifyOtpResult> {
  const { data: latest } = await db
    .from("end_user_otp_codes")
    .select("*")
    .eq("whatsapp_number", contact.whatsappNumber)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest) return { ok: false, reason: "not_found" };
  if (latest.consumed_at) return { ok: false, reason: "already_used" };
  if (new Date(latest.expires_at).getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (latest.attempt_count >= MAX_ATTEMPTS) return { ok: false, reason: "too_many_attempts" };

  const submittedHash = await hashCode(submittedCode.trim(), contact.whatsappNumber, pepper);
  if (submittedHash !== latest.code_hash) {
    await db
      .from("end_user_otp_codes")
      .update({ attempt_count: latest.attempt_count + 1 })
      .eq("id", latest.id);
    return { ok: false, reason: "incorrect_code" };
  }

  await db
    .from("end_user_otp_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", latest.id);
  return { ok: true };
}
