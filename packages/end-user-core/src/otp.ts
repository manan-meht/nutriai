import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhone } from "./whatsapp";
import { sendOtpSms, type OtpSmsCredentials } from "./sms";

export type ContactType = "adults" | "gym";

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
/** How long verification is locked once MAX_ATTEMPTS is reached on a
 * given code — a fresh code (regenerated or a new OTP) is unaffected;
 * this only blocks further guesses against the SAME code_hash. */
const LOCK_DURATION_MS = 15 * 60 * 1000;

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

/** Issues a fresh OTP and sends it via SMS (MSG91 for +91, Twilio
 * elsewhere — see sms.ts) rather than WhatsApp. SMS doesn't have
 * WhatsApp's "must have messaged within 24h" restriction, so it works
 * reliably for a first-time login too, at the cost of needing India's DLT
 * template registration (regulatory, not provider-specific) and a Twilio
 * account for the rest of the world. Same OTP flow regardless of caller
 * (web or mobile) — only the delivery channel and storage
 * (end_user_otp_codes) are involved, no platform-specific state. */
export async function issueOtp(db: SupabaseClient, contact: EndUserContact, pepper: string, sms: OtpSmsCredentials): Promise<void> {
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

  // contact.whatsappNumber is normalizePhone()'d (digits only) — SMS
  // sending needs E.164 ("+" prefix).
  await sendOtpSms(`+${contact.whatsappNumber}`, code, sms);
}

export type GeneratedByRole = "family_owner" | "coach";

const ACCESS_CODE_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/** Generates a Temporary Access Code for a family owner/coach to share
 * manually (e.g. over WhatsApp) — the participant-side "beta-safe
 * fallback" that doesn't depend on SMS/WhatsApp OTP delivery at all. Uses
 * the exact same end_user_otp_codes row shape as issueOtp (same hashing,
 * same verifyOtp checks it against), so no separate verification path is
 * needed — a manually-generated code and a system-sent OTP are
 * indistinguishable to verifyOtp, just tagged with who generated it.
 *
 * Regenerating invalidates any previously active (unused, unexpired,
 * unrevoked) code for this contact — only one active code per contact at
 * a time, matching the spec's "regenerating invalidates previous active
 * codes" rule. Returns the plaintext code — callers must display it
 * exactly once and never log it (see the caller-side "never log
 * plaintext" requirement). */
export async function generateAccessCode(
  db: SupabaseClient,
  contact: EndUserContact,
  generatedByUserId: string,
  generatedByRole: GeneratedByRole,
  pepper: string,
  ttlMs: number = ACCESS_CODE_DEFAULT_TTL_MS
): Promise<{ code: string; expiresAt: string }> {
  await revokeActiveAccessCodes(db, contact);

  const code = generateSixDigitCode();
  const codeHash = await hashCode(code, contact.whatsappNumber, pepper);
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  const { error } = await db.from("end_user_otp_codes").insert({
    contact_id: contact.contactId,
    contact_type: contact.contactType,
    whatsapp_number: contact.whatsappNumber,
    code_hash: codeHash,
    expires_at: expiresAt,
    generated_by_user_id: generatedByUserId,
    generated_by_role: generatedByRole,
  });
  if (error) throw new Error(`Failed to store access code: ${error.message}`);

  return { code, expiresAt };
}

/** Revokes every currently-active (unused, unexpired, unrevoked) code for
 * this contact — used both by generateAccessCode (regeneration) and the
 * standalone "Revoke code" action. A no-op if nothing is active. */
export async function revokeActiveAccessCodes(db: SupabaseClient, contact: EndUserContact): Promise<void> {
  await db
    .from("end_user_otp_codes")
    .update({ revoked_at: new Date().toISOString() })
    .eq("contact_id", contact.contactId)
    .eq("contact_type", contact.contactType)
    .is("consumed_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString());
}

export type VerifyOtpResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "expired" | "already_used" | "revoked" | "too_many_attempts" | "incorrect_code" };

/** Verifies the most recent code (OTP or Temporary Access Code — same row
 * shape, see generateAccessCode) for this number. Rate-limited per-code
 * (not just per-number) so a slow brute-force against one issued code is
 * blocked without needing a separate global rate limiter; once
 * MAX_ATTEMPTS is hit, the code is locked for LOCK_DURATION_MS rather than
 * permanently unusable (a genuine owner mistyping a code shouldn't need a
 * brand new one for a temporary lock to clear, but the lock still forces a
 * real delay against guessing). */
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
  if (latest.revoked_at) return { ok: false, reason: "revoked" };
  if (new Date(latest.expires_at).getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (latest.locked_until && new Date(latest.locked_until).getTime() > Date.now()) return { ok: false, reason: "too_many_attempts" };
  if (latest.attempt_count >= MAX_ATTEMPTS) return { ok: false, reason: "too_many_attempts" };

  const submittedHash = await hashCode(submittedCode.trim(), contact.whatsappNumber, pepper);
  if (submittedHash !== latest.code_hash) {
    const nextAttemptCount = latest.attempt_count + 1;
    await db
      .from("end_user_otp_codes")
      .update({
        attempt_count: nextAttemptCount,
        ...(nextAttemptCount >= MAX_ATTEMPTS ? { locked_until: new Date(Date.now() + LOCK_DURATION_MS).toISOString() } : {}),
      })
      .eq("id", latest.id);
    return { ok: false, reason: "incorrect_code" };
  }

  await db
    .from("end_user_otp_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", latest.id);
  return { ok: true };
}
