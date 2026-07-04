import { createClient } from "@supabase/supabase-js";
import { sendTemplateMessage } from "@/lib/whatsapp/client";
import { normalizePhone } from "@/lib/whatsapp/client";

export type ContactType = "adults" | "gym";

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function hashCode(code: string, whatsappNumber: string): Promise<string> {
  const pepper = process.env.END_USER_OTP_PEPPER ?? "";
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

export interface EndUserContact {
  contactId: string;
  contactType: ContactType;
  whatsappNumber: string;
  fullName: string;
}

/** Looks up a WhatsApp number against adults_contacts / gym_clients, the
 * same live tables the WhatsApp bot itself uses — no separate identity
 * store, so this always matches whatever record the caregiver/coach set up. */
export async function findContactByWhatsappNumber(rawNumber: string): Promise<EndUserContact | null> {
  const normalized = normalizePhone(rawNumber);
  const db = admin();

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

/** Issues a fresh OTP and sends it via the pre-approved WhatsApp template
 * (free-form text can't be the first message to a contact who hasn't
 * messaged the business number yet — same constraint as the invite flow). */
export async function issueOtp(contact: EndUserContact): Promise<void> {
  const code = generateSixDigitCode();
  const codeHash = await hashCode(code, contact.whatsappNumber);
  const db = admin();

  const { error } = await db.from("end_user_otp_codes").insert({
    contact_id: contact.contactId,
    contact_type: contact.contactType,
    whatsapp_number: contact.whatsappNumber,
    code_hash: codeHash,
    expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
  });
  if (error) throw new Error(`Failed to store OTP: ${error.message}`);

  const templateName = process.env.WHATSAPP_OTP_TEMPLATE_NAME;
  const languageCode = process.env.WHATSAPP_OTP_TEMPLATE_LANGUAGE ?? "en";
  if (!templateName) throw new Error("WHATSAPP_OTP_TEMPLATE_NAME is not configured");

  await sendTemplateMessage(contact.whatsappNumber, templateName, languageCode, [code]);
}

export type VerifyOtpResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "expired" | "already_used" | "too_many_attempts" | "incorrect_code" };

/** Verifies the most recent unconsumed OTP for this number. Rate-limited
 * per-code (not just per-number) so a slow brute-force against one issued
 * code is blocked without needing a separate global rate limiter. */
export async function verifyOtp(contact: EndUserContact, submittedCode: string): Promise<VerifyOtpResult> {
  const db = admin();
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

  const submittedHash = await hashCode(submittedCode.trim(), contact.whatsappNumber);
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
