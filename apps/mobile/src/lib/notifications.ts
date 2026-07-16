import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { api } from "./api";

// Foreground behavior — without this, a notification that arrives while the
// app is open and focused shows nothing at all (Expo's default handler is a
// no-op). We want it to behave like a normal Android notification even in
// foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

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
