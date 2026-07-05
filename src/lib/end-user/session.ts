import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import type { ContactType, EndUserContact } from "@/lib/end-user/otp";
import { parentTrustedSessionDays } from "@/lib/billing/feature-flags";

export const SESSION_COOKIE_NAME = "tistra_end_user_session";

// Configurable via PARENT_TRUSTED_SESSION_DAYS (default 90, per spec) —
// used for every end-user session, since /my-progress serves both the
// general end-user dashboard and the parent-access flow with the same
// underlying OTP/session infrastructure.
function sessionTtlMs(): number {
  return parentTrustedSessionDays() * 24 * 60 * 60 * 1000;
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Creates a new session row and sets the HTTP-only cookie. Only the
 * token's hash is stored server-side — the raw token exists only in the
 * cookie, so a DB read alone can never impersonate a session. */
export async function createEndUserSession(contact: EndUserContact, deviceLabel?: string): Promise<void> {
  const token = randomToken();
  const tokenHash = await hashToken(token);
  const db = admin();
  const ttlMs = sessionTtlMs();

  const { error } = await db.from("end_user_sessions").insert({
    contact_id: contact.contactId,
    contact_type: contact.contactType,
    session_token_hash: tokenHash,
    expires_at: new Date(Date.now() + ttlMs).toISOString(),
    device_label: deviceLabel ?? null,
  });
  if (error) throw new Error(`Failed to create session: ${error.message}`);

  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: ttlMs / 1000,
  });
}

export interface EndUserSessionInfo {
  contactId: string;
  contactType: ContactType;
}

/** Reads and validates the session cookie against end_user_sessions.
 * Returns null for missing/expired/unknown tokens — callers must treat
 * that as "not authenticated" and redirect to re-verification. */
export async function getEndUserSession(): Promise<EndUserSessionInfo | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const tokenHash = await hashToken(token);
  const db = admin();
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

export async function clearEndUserSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    const tokenHash = await hashToken(token);
    await admin().from("end_user_sessions").delete().eq("session_token_hash", tokenHash);
  }
  store.delete(SESSION_COOKIE_NAME);
}

export interface TrustedDevice {
  id: string;
  deviceLabel: string | null;
  createdAt: string;
  lastSeenAt: string;
  isCurrent: boolean;
}

/** Lists every trusted-device session for the signed-in contact, so the
 * "Trusted devices" settings UI can show what has standing access and let
 * the user sign any of them out individually. */
export async function listTrustedDevices(contactId: string): Promise<TrustedDevice[]> {
  const store = await cookies();
  const currentToken = store.get(SESSION_COOKIE_NAME)?.value;
  const currentHash = currentToken ? await hashToken(currentToken) : null;

  const db = admin();
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
export async function signOutAllDevices(contactId: string): Promise<void> {
  await admin().from("end_user_sessions").delete().eq("contact_id", contactId);
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

export async function signOutDevice(contactId: string, sessionId: string): Promise<void> {
  await admin().from("end_user_sessions").delete().match({ id: sessionId, contact_id: contactId });
}
