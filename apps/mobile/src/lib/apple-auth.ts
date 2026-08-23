import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from './supabase';

/**
 * Sign in with Apple.
 *
 * Apple requires this wherever an app offers Google or Facebook sign-in
 * (App Store guideline 4.8), and requires the NATIVE sheet on iOS rather
 * than a browser round-trip. So this does not go through
 * signInWithProvider like the other two: it takes the identity token
 * Apple hands back and exchanges it with Supabase directly, which also
 * means no Apple Services ID is needed — the bundle id is the audience.
 *
 * The catch worth knowing: Apple returns the user's NAME exactly once, on
 * the very first authorization for this bundle id. Every later sign-in
 * returns nulls, and there is no way to ask again short of the user
 * revoking access in iOS Settings. So the name is captured here and written
 * to the profile immediately; missing it means the account is nameless
 * forever.
 */

export function appleSignInSupported(): boolean {
  return Platform.OS === 'ios';
}

/** True when the device can actually present the sheet — iOS 13+. */
export async function appleSignInAvailable(): Promise<boolean> {
  if (!appleSignInSupported()) return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export class AppleSignInCancelled extends Error {
  constructor() {
    super('Sign in with Apple was cancelled.');
    this.name = 'AppleSignInCancelled';
  }
}

export async function signInWithApple(): Promise<void> {
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (err: any) {
    // The user dismissed the sheet. Not a failure to report as one.
    if (err?.code === 'ERR_REQUEST_CANCELED') throw new AppleSignInCancelled();
    throw err;
  }

  if (!credential.identityToken) {
    throw new Error("Apple didn't return a sign-in token. Please try again.");
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;

  // Only ever populated on the first authorization — see the note above.
  const given = credential.fullName?.givenName?.trim() ?? '';
  const family = credential.fullName?.familyName?.trim() ?? '';
  const fullName = [given, family].filter(Boolean).join(' ');
  if (fullName) {
    // Best effort: a failure here must not undo a successful sign-in.
    try {
      await supabase.auth.updateUser({ data: { full_name: fullName } });
    } catch {
      // ignored deliberately
    }
  }
}
