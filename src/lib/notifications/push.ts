import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Generic Expo push send helper — not tied to meals or family plans. The
// "family meal logged" notification (see saveMeal() in
// src/lib/whatsapp/conversation-handler.ts) is the first caller, but any
// future notification (coach/gym meal alerts, billing-launch announcements,
// meal reminders migrating off WhatsApp, etc.) should call this same
// function rather than duplicating the Expo Push API request.
//
// Uses Expo's push service directly (https://exp.host/--/api/v2/push/send)
// rather than talking to FCM/APNs ourselves — this is Expo's own supported
// path for apps built with EAS and requires no server-side Firebase/APNs
// credentials on our end; Expo's push service forwards to FCM for Android
// using the credentials configured in the EAS project.

const EXPO_PUSH_API = "https://exp.host/--/api/v2/push/send";

export interface PushNotificationPayload {
  title: string;
  body: string;
  /** Arbitrary JSON delivered to the app alongside the notification —
   * e.g. { type: "meal_logged", contactId } so a tap could deep-link. */
  data?: Record<string, unknown>;
}

function serviceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Sends a push notification to every registered device for a given profile
 * (a caregiver could have more than one — see migration 0028). Best-effort:
 * never throws, since a push failure should never break the WhatsApp
 * message flow that triggered it. Returns the number of devices the
 * notification was dispatched to (0 if the profile has no registered
 * devices or the send failed).
 */
export async function sendPushNotificationToProfile(
  profileId: string,
  payload: PushNotificationPayload
): Promise<number> {
  try {
    const db = serviceClient();
    const { data: tokens, error } = await db
      .from("push_tokens")
      .select("expo_push_token")
      .eq("profile_id", profileId);

    if (error) {
      console.error("[push] failed to look up push tokens:", error.message);
      return 0;
    }
    if (!tokens || tokens.length === 0) return 0;

    const messages = tokens.map((t: { expo_push_token: string }) => ({
      to: t.expo_push_token,
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
    }));

    const res = await fetch(EXPO_PUSH_API, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    if (!res.ok) {
      console.error("[push] Expo push API returned", res.status, await res.text().catch(() => ""));
      return 0;
    }

    return messages.length;
  } catch (err) {
    console.error("[push] sendPushNotificationToProfile failed:", err instanceof Error ? err.message : err);
    return 0;
  }
}
