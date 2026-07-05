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
import { setSharingPaused, requestRemoval as requestRemovalService } from "@/lib/end-user/dashboard-service";

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
  } catch {
    return { ok: false, error: "Couldn't send a code right now. Please try again in a moment." };
  }
}

export type VerifyResult = { ok: true } | { ok: false; error: string };

export async function verifyOtpAction(whatsappNumber: string, code: string): Promise<VerifyResult> {
  if (!FEATURE_ENABLED) return { ok: false, error: "This feature is not available yet." };

  const contact = await findContactByWhatsappNumber(whatsappNumber);
  if (!contact) return { ok: false, error: "We don't recognize this WhatsApp number yet." };

  const result = await verifyOtp(contact, code);
  if (!result.ok) {
    const messages: Record<string, string> = {
      not_found: "Please request a new code.",
      expired: "That code has expired — request a new one.",
      already_used: "That code was already used — request a new one.",
      too_many_attempts: "Too many incorrect attempts — request a new code.",
      incorrect_code: "That code isn't right. Please try again.",
    };
    return { ok: false, error: messages[result.reason] };
  }

  await createEndUserSession(contact);
  return { ok: true };
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
