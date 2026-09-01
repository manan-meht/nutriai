import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { router } from "expo-router";
import { api } from "./api";

// Foreground behavior — without this, a notification that arrives while the
// app is open and focused shows nothing at all (Expo's default handler is a
// no-op). We want it to behave like a normal Android notification even in
// foreground.
//
// Wrapped in try/catch: expo-notifications was fully removed from Expo Go as
// of SDK 53 (native push registration/handling isn't available there at
// all), and calling this at module load time throws immediately rather than
// degrading — which crashes the whole app on import, before
// registerForPushNotificationsAsync's own try/catch below ever gets a
// chance to run. A development/production build (which does have the native
// module) is unaffected either way.
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch (err) {
  console.warn("[notifications] setNotificationHandler unavailable (likely Expo Go):", err);
}

/** The permission facts a caller needs to decide what to offer.
 *
 * `status` alone is not enough on Android: a permission that has NEVER been
 * requested reports as "denied" there, indistinguishable from a real user
 * refusal by status alone. `canAskAgain` is what separates them — true means
 * the OS will still show the prompt, false means only the system Settings
 * page can change it. Getting this wrong is what left 13 family-plan
 * caregivers with no push token: the card keyed off `undetermined`, which
 * Android never reports, so it never rendered and never asked.
 *
 * Returns nulls when unavailable (Expo Go, or no physical device). */
export interface PushPermissionState {
  status: Notifications.PermissionStatus | null;
  canAskAgain: boolean;
}

export async function getPushPermissionState(): Promise<PushPermissionState> {
  try {
    if (!Device.isDevice) return { status: null, canAskAgain: false };
    const { status, canAskAgain } = await Notifications.getPermissionsAsync();
    return { status, canAskAgain };
  } catch (err) {
    console.warn("[notifications] getPushPermissionState unavailable (likely Expo Go):", err);
    return { status: null, canAskAgain: false };
  }
}

/** Status only. Kept for callers that genuinely do not care why. */
export async function getPushPermissionStatus(): Promise<Notifications.PermissionStatus | null> {
  return (await getPushPermissionState()).status;
}

/**
 * Re-registers this device's push token, but ONLY if notification
 * permission has already been granted — so it never triggers the OS
 * dialog and can safely run on every authenticated app launch.
 *
 * This exists because an Expo push token is not stable for the life of an
 * install. Clearing the app's data, reinstalling, or an FCM re-registration
 * all mint a NEW token and silently orphan the old one, which stays in
 * push_tokens looking perfectly healthy. Until this ran app-wide, the only
 * things that refreshed a token were adults/index.tsx (self plan only) and
 * PushPermissionCard on that same screen — so a family-plan caregiver who
 * hadn't opened the family list since their last reinstall had no live
 * token at all, and every notification for them was delivered to nothing.
 *
 * Worse, PushPermissionCard's dismissal is permanent: once "Not now" is
 * tapped the card never returns, so before this there was no path back to a
 * working token short of reinstalling. Permission being granted is the only
 * thing that should matter, and here it is the only thing that does.
 */
export async function refreshPushTokenIfGranted(): Promise<void> {
  try {
    if (!Device.isDevice) return;
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return;
    await registerForPushNotificationsAsync();
  } catch (err) {
    console.warn("[notifications] refreshPushTokenIfGranted failed:", err);
  }
}

/**
 * Requests notification permission (no-op if already granted/denied) and,
 * if granted, registers this device's Expo push token with mobile-api.
 * Safe to call on every authenticated app launch — registerPushToken()
 * upserts, so re-calling with the same token is a cheap no-op server-side.
 *
 * Deliberately swallows all failures rather than surfacing them to the
 * user: push notifications are a nice-to-have, not a blocking part of the
 * core WhatsApp-based tracking flow, and a simulator/emulator (no physical
 * push capability) or a denied permission should never interrupt app usage.
 */
export async function registerForPushNotificationsAsync(): Promise<void> {
  try {
    if (!Device.isDevice) return; // emulators/simulators can't receive real pushes

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== "granted") return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );

    await api.registerPushToken(expoPushToken, Platform.OS === "android" ? "android" : "ios");
  } catch (err) {
    console.error("[notifications] registration failed:", err);
  }
}

/** Routes a tapped notification to the screen it's actually about, keyed on
 * the `data` payload each sender attaches (see sendPushNotificationToProfile
 * call sites, e.g. notifyCaregiverOfFamilyMeal in
 * src/lib/whatsapp/conversation-handler.ts) — without this, every
 * notification just opened the app to whatever screen it happened to be on,
 * regardless of which family member/contact it was about. Add a case here
 * whenever a new notification `type` is introduced server-side. */
function navigateForNotificationData(data: Record<string, unknown> | undefined): void {
  if (!data) return;
  if (data.type === "meal_logged" && typeof data.adultsContactId === "string") {
    router.push(`/adults/${data.adultsContactId}`);
  }
}

/**
 * Wires up notification-tap navigation for both cases Expo distinguishes:
 * a tap while the app is already running (foreground or backgrounded, via
 * the response-received listener) and a tap that cold-launched the app
 * (via getLastNotificationResponseAsync, checked once on mount). Call once
 * from a layout that's already inside the authenticated app group, since
 * navigateForNotificationData pushes routes that assume a session exists.
 * Returns the cleanup function for the listener subscription.
 */
export function setupNotificationNavigation(): () => void {
  try {
    Notifications.getLastNotificationResponseAsync()
      .then((response) => navigateForNotificationData(response?.notification.request.content.data))
      .catch((err) => console.error("[notifications] getLastNotificationResponseAsync failed:", err));

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      navigateForNotificationData(response.notification.request.content.data);
    });

    return () => subscription.remove();
  } catch (err) {
    console.warn("[notifications] setupNotificationNavigation unavailable (likely Expo Go):", err);
    return () => {};
  }
}
