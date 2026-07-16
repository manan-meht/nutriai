import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import type { ContactType, EndUserContact } from "@/lib/end-user/otp";
import { parentTrustedSessionDays } from "@/lib/billing/feature-flags";
import {
  createEndUserSessionToken,
  validateEndUserSessionToken,
  deleteEndUserSessionToken,
  listTrustedDevices as listTrustedDevicesCore,
  signOutDevice as signOutDeviceCore,
  signOutAllDevices as signOutAllDevicesCore,
  type TrustedDevice,
} from "@nutriai/end-user-core";

export type { TrustedDevice };

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

/** Creates a new session (via @nutriai/end-user-core) and sets the
 * httpOnly cookie — the web-specific half of session delivery; the mobile
 * app instead gets the raw token back as JSON and stores it in
 * SecureStore (see apps/mobile-api's /end-user/verify-otp route). */
export async function createEndUserSession(contact: EndUserContact, deviceLabel?: string): Promise<void> {
  const ttlMs = sessionTtlMs();
  const token = await createEndUserSessionToken(admin(), contact, ttlMs, deviceLabel);

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

/** Reads and validates the session cookie. Returns null for missing/
 * expired/unknown tokens — callers must treat that as "not authenticated"
 * and redirect to re-verification. */
export async function getEndUserSession(): Promise<EndUserSessionInfo | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return validateEndUserSessionToken(admin(), token);
}

export async function clearEndUserSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (token) await deleteEndUserSessionToken(admin(), token);
  store.delete(SESSION_COOKIE_NAME);
}

/** Lists every trusted-device session for the signed-in contact, so the
 * "Trusted devices" settings UI can show what has standing access and let
 * the user sign any of them out individually. */
export async function listTrustedDevices(contactId: string): Promise<TrustedDevice[]> {
  const store = await cookies();
  const currentToken = store.get(SESSION_COOKIE_NAME)?.value;
  return listTrustedDevicesCore(admin(), contactId, currentToken);
}

/** Signs out every trusted device for this contact (e.g. after a privacy
 * setting change or on request) — re-verification via WhatsApp OTP is
 * required everywhere afterward. */
export async function signOutAllDevices(contactId: string): Promise<void> {
  await signOutAllDevicesCore(admin(), contactId);
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

export async function signOutDevice(contactId: string, sessionId: string): Promise<void> {
  await signOutDeviceCore(admin(), contactId, sessionId);
}
