import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContactType, EndUserContact } from "./otp";

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Creates a new session row and returns the raw token — callers decide how
 * to deliver it (an httpOnly cookie on web, a value stored in SecureStore
 * on mobile). Only the token's hash is stored server-side, so a DB read
 * alone can never impersonate a session. */
export async function createEndUserSessionToken(
  db: SupabaseClient,
  contact: EndUserContact,
  ttlMs: number,
  deviceLabel?: string
): Promise<string> {
  const token = randomToken();
  const tokenHash = await hashToken(token);

  const { error } = await db.from("end_user_sessions").insert({
    contact_id: contact.contactId,
    contact_type: contact.contactType,
    session_token_hash: tokenHash,
    expires_at: new Date(Date.now() + ttlMs).toISOString(),
    device_label: deviceLabel ?? null,
  });
  if (error) throw new Error(`Failed to create session: ${error.message}`);

  return token;
}

export interface EndUserSessionInfo {
  contactId: string;
  contactType: ContactType;
}

/** Validates a raw session token against end_user_sessions. Returns null
 * for missing/expired/unknown tokens — callers must treat that as "not
 * authenticated" and require re-verification. */
export async function validateEndUserSessionToken(db: SupabaseClient, token: string): Promise<EndUserSessionInfo | null> {
  const tokenHash = await hashToken(token);
  const { data } = await db
    .from("end_user_sessions")
    .select("*")
    .eq("session_token_hash", tokenHash)
    .maybeSingle();

  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;

  await db
    .from("end_user_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", data.id);

  return { contactId: data.contact_id, contactType: data.contact_type };
}

export async function deleteEndUserSessionToken(db: SupabaseClient, token: string): Promise<void> {
  const tokenHash = await hashToken(token);
  await db.from("end_user_sessions").delete().eq("session_token_hash", tokenHash);
}

export interface TrustedDevice {
  id: string;
  deviceLabel: string | null;
  createdAt: string;
  lastSeenAt: string;
  isCurrent: boolean;
}

/** Lists every trusted-device session for the signed-in contact, so a
 * "Trusted devices" settings UI can show what has standing access and let
 * the user sign any of them out individually. currentToken is optional —
 * pass it (the caller's own raw token) to mark which row is "this device". */
export async function listTrustedDevices(db: SupabaseClient, contactId: string, currentToken?: string): Promise<TrustedDevice[]> {
  const currentHash = currentToken ? await hashToken(currentToken) : null;

  const { data } = await db
    .from("end_user_sessions")
    .select("*")
    .eq("contact_id", contactId)
    .order("last_seen_at", { ascending: false });

  return (data ?? []).map((row: any) => ({
    id: row.id,
    deviceLabel: row.device_label,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    isCurrent: row.session_token_hash === currentHash,
  }));
}

/** Signs out every trusted device for this contact (e.g. after a privacy
 * setting change or on request) — re-verification via WhatsApp OTP is
 * required everywhere afterward. */
export async function signOutAllDevices(db: SupabaseClient, contactId: string): Promise<void> {
  await db.from("end_user_sessions").delete().eq("contact_id", contactId);
}

export async function signOutDevice(db: SupabaseClient, contactId: string, sessionId: string): Promise<void> {
  await db.from("end_user_sessions").delete().match({ id: sessionId, contact_id: contactId });
}
