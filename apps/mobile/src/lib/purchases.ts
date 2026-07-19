import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, type CustomerInfo } from 'react-native-purchases';

// RevenueCat wraps both Apple's and Google Play's native billing — see
// src/app/api/webhooks/revenuecat/route.ts (main web app) for the server
// side of this. `appUserID` is deliberately set to the Supabase auth user
// id (not RevenueCat's own anonymous id) so the webhook's app_user_id ==
// entitlements.owner_id lookup works with no extra alias-mapping step.
//
// Self/Family (module "adults") only — Coach/Gym stays web/manual billing
// per this rollout's scope, so this is never configured from the gym
// product's screens.
let configuredForUserId: string | null = null;

function apiKeyForPlatform(): string | null {
  if (Platform.OS === 'ios') return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? null;
  if (Platform.OS === 'android') return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? null;
  return null;
}

/** Idempotent — safe to call from a useEffect keyed on the auth user id;
 * a no-op if already configured for this exact user. Never throws: a
 * missing API key (e.g. local dev without RevenueCat env vars set) just
 * means the paywall screen won't be able to fetch offerings, which it
 * already handles as an empty-offerings state. */
export async function configurePurchases(userId: string): Promise<void> {
  if (configuredForUserId === userId) return;

  const apiKey = apiKeyForPlatform();
  if (!apiKey) {
    console.warn('[purchases] No RevenueCat API key configured for this platform — billing is unavailable.');
    return;
  }

  if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.WARN);
  Purchases.configure({ apiKey, appUserID: userId });
  configuredForUserId = userId;
}

/** Called on sign-out so a subsequent sign-in (possibly a different
 * person on a shared device) doesn't inherit the previous user's
 * RevenueCat identity/cache. */
export async function logOutPurchases(): Promise<void> {
  if (!configuredForUserId) return;
  try {
    await Purchases.logOut();
  } catch (err) {
    // logOut() throws if called on an already-anonymous user (e.g. this
    // ran once already) — never let that block the actual app sign-out.
    console.warn('[purchases] logOut failed (likely already logged out):', err);
  } finally {
    configuredForUserId = null;
  }
}

/** True if `customerInfo` shows an active entitlement — checked
 * client-side right after a purchase for an instant UI update, without
 * waiting for the RevenueCat webhook to reach our backend and update the
 * persisted entitlements row (that write is still the source of truth for
 * every other screen/session; this is purely an optimistic unlock). */
export function hasActiveEntitlement(customerInfo: CustomerInfo, entitlementId: string): boolean {
  return Boolean(customerInfo.entitlements.active[entitlementId]);
}
