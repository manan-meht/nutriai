"use server";

import { END_USER_DASHBOARD_ENABLED, PARENT_DASHBOARD_ACCESS_ENABLED } from "@/lib/billing/feature-flags";
import { findContactByWhatsappNumber, issueOtp, verifyOtp } from "@/lib/end-user/otp";
import {
  createEndUserSession,
  clearEndUserSession,
  getEndUserSession,
  listTrustedDevices,
  signOutAllDevices,
  signOutDevice,
  type TrustedDevice,
} from "@/lib/end-user/session";
import { setSharingPaused, requestRemoval as requestRemovalService, hasAcceptedConsent, acceptConsent } from "@/lib/end-user/dashboard-service";

// This flow now serves both the general end-user dashboard and the
// parent-access flow (spec: WhatsApp-OTP dashboard access for a parent
// invited by a family member) — either flag being on is enough, since
// they share the exact same OTP/session/dashboard infrastructure.
const FEATURE_ENABLED = END_USER_DASHBOARD_ENABLED || PARENT_DASHBOARD_ACCESS_ENABLED;

export type RequestOtpResult = { ok: true } | { ok: false; error: string };

export async function requestOtpAction(whatsappNumber: string): Promise<RequestOtpResult> {
  if (!FEATURE_ENABLED) return { ok: false, error: "This feature is not available yet." };

  const contact = await findContactByWhatsappNumber(whatsappNumber);
  if (!contact) {
    return { ok: false, error: "We don't recognize this WhatsApp number yet. Ask the person who added you to check the number." };
  }

  try {
    await issueOtp(contact);
    return { ok: true };
  } catch (err) {
    // This was previously a bare `catch {}` — silently swallowing the
    // real cause (e.g. missing WHATSAPP_OTP_TEMPLATE_NAME, an
    // unapproved template, or a Graph API error) made it impossible to
    // diagnose from production logs. Log loudly so this can't hide again.
    console.error("[requestOtpAction] issueOtp failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: "Couldn't send a code right now. Please try again in a moment." };
  }
}

export type VerifyResult = { ok: true; needsConsent: boolean } | { ok: false; error: string };

export async function verifyOtpAction(whatsappNumber: string, code: string): Promise<VerifyResult> {
  if (!FEATURE_ENABLED) return { ok: false, error: "This feature is not available yet." };

  const contact = await findContactByWhatsappNumber(whatsappNumber);
  if (!contact) return { ok: false, error: "We don't recognize this WhatsApp number yet." };

  const result = await verifyOtp(contact, code);
  if (!result.ok) {
    const messages: Record<string, string> = {
      not_found: "That code didn't work. Please check the number and code, or ask for a new access code.",
      expired: "This access code has expired. Please ask for a new one.",
      already_used: "That code was already used — please ask for a new access code.",
      revoked: "That code is no longer valid — please ask for a new access code.",
      too_many_attempts: "Too many incorrect attempts — please ask for a new access code.",
      incorrect_code: "That code didn't work. Please check the number and code, or ask for a new access code.",
    };
    return { ok: false, error: messages[result.reason] };
  }

  await createEndUserSession(contact);
  // Consent screen ("Review your Tistra Health access") is required before
  // any dashboard access — /my-progress/dashboard itself shows it inline
  // when needed, so the caller can always redirect there regardless.
  const needsConsent = !(await hasAcceptedConsent(contact.contactId));
  return { ok: true, needsConsent };
}

/** "Accept and continue" — records consent, dashboard access proceeds. */
export async function acceptConsentAction(): Promise<{ ok: boolean }> {
  const session = await getEndUserSession();
  if (!session) return { ok: false };
  await acceptConsent(session.contactId, session.contactType);
  return { ok: true };
}

/** "Decline" — per the spec, declining must not grant dashboard access.
 * Ends the session outright rather than leaving it half-authenticated;
 * the person can request a fresh code later if they change their mind. */
export async function declineConsentAction(): Promise<void> {
  await clearEndUserSession();
}

export async function pauseSharingAction(paused: boolean): Promise<void> {
  const session = await getEndUserSession();
  if (!session) return;
  await setSharingPaused(session.contactId, session.contactType, paused);
}

export async function requestRemovalAction(): Promise<void> {
  const session = await getEndUserSession();
  if (!session) return;
  await requestRemovalService(session.contactId, session.contactType);
}

export async function signOutEndUserAction(): Promise<void> {
  await clearEndUserSession();
}

export async function listTrustedDevicesAction(): Promise<TrustedDevice[]> {
  const session = await getEndUserSession();
  if (!session) return [];
  return listTrustedDevices(session.contactId);
}

export async function signOutDeviceAction(sessionId: string): Promise<void> {
  const session = await getEndUserSession();
  if (!session) return;
  await signOutDevice(session.contactId, sessionId);
}

/** Re-verification (a fresh WhatsApp OTP) is required everywhere after
 * this — matches the spec's "sign out of all devices" trusted-devices
 * control. */
export async function signOutAllDevicesAction(): Promise<void> {
  const session = await getEndUserSession();
  if (!session) return;
  await signOutAllDevices(session.contactId);
}
