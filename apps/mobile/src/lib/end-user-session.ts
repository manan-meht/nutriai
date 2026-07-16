import * as SecureStore from "expo-secure-store";

// Persists the participant's session token in the OS Keychain/Keystore —
// same protection tier as the Supabase refresh token (see lib/supabase.ts)
// since this token grants the same kind of standing access. Deliberately
// separate from Supabase Auth entirely: this is the OTP-verified end-user
// session (see @nutriai/end-user-core), not a Supabase JWT, and a device
// can hold both a caregiver's Supabase session and a participant's
// end-user session at the same time without conflict.

const TOKEN_KEY = "tistra_end_user_session_token";
const CONTACT_KEY = "tistra_end_user_contact";

export type EndUserContactType = "adults" | "gym";

export interface StoredEndUserContact {
  contactId: string;
  contactType: EndUserContactType;
  fullName: string;
}

export async function saveEndUserSession(token: string, contact: StoredEndUserContact): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(CONTACT_KEY, JSON.stringify(contact));
}

export async function getEndUserSessionToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function getStoredEndUserContact(): Promise<StoredEndUserContact | null> {
  const raw = await SecureStore.getItemAsync(CONTACT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function clearEndUserSession(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(CONTACT_KEY);
}
