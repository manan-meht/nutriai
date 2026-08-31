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
  /** Optional thumbnail shown inside the notification itself (Expo's
   * `richContent.image`). Must be a URL the *device's OS* can fetch
   * unauthenticated at delivery time — for meal photos that means a signed
   * Supabase Storage URL with an expiry comfortably longer than the
   * notification is likely to sit unopened (see resolveSignedMealPhotoUrl
   * and notifyCaregiverOfFamilyMeal's MEAL_PHOTO_PUSH_URL_TTL_SECONDS).
   *
   * Platform reality, so nobody debugs this twice:
   * - Android: Expo forwards this as FCM's `notification.image`, and
   *   expo-notifications renders it as the notification's large icon (a
   *   thumbnail beside the text), not a full-width expanded picture.
   * - iOS: APNs only attaches remote images via a Notification Service
   *   Extension, which this app does not currently ship — so the image is
   *   silently ignored there and the title/body still render normally.
   *   `mutableContent` is set below so it starts working the moment an
   *   extension is added, with no server change.
   */
  imageUrl?: string;
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
      ...(payload.imageUrl
        ? {
            richContent: { image: payload.imageUrl },
            // Required for iOS to hand the notification to a Notification
            // Service Extension before display; harmless on Android and
            // harmless on iOS builds with no extension installed.
            mutableContent: true,
          }
        : {}),
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

    // A 200 here means Expo ACCEPTED the messages, not that any device got
    // one. Two further things can still go wrong, and until this block
    // existed both were invisible:
    //
    //   - a per-message ticket error (returned right here), and
    //   - a delivery failure reported only in the receipt, fetched later
    //     by pruneDeadPushTokens() below.
    //
    // The second is the one that actually bit: every token for a caregiver
    // came back DeviceNotRegistered at the receipt stage while this
    // function happily reported "sent to 9 devices" for weeks.
    const body = (await res.json().catch(() => null)) as
      | { data?: { id?: string; status?: string; details?: { error?: string } }[] }
      | null;
    const tickets = body?.data ?? [];

    const dead: string[] = [];
    const pending: { token: string; ticketId: string }[] = [];
    tickets.forEach((ticket, i) => {
      const token = tokens[i]?.expo_push_token;
      if (!token) return;
      if (ticket?.status === "error") {
        if (ticket.details?.error === "DeviceNotRegistered") dead.push(token);
        else console.error("[push] ticket error for a token:", ticket.details?.error ?? "unknown");
        return;
      }
      if (ticket?.id) pending.push({ token, ticketId: ticket.id });
    });

    if (dead.length > 0) await deleteTokens(db, dead);

    // Records which ticket each token is waiting on, so the receipt sweep
    // can resolve it. Best-effort: failing to record one only means that
    // token's receipt goes unchecked this round.
    await Promise.all(
      pending.map(({ token, ticketId }) =>
        db
          .from("push_tokens")
          .update({ last_ticket_id: ticketId, last_sent_at: new Date().toISOString() })
          .eq("profile_id", profileId)
          .eq("expo_push_token", token)
      )
    );

    const delivered = messages.length - dead.length;
    if (delivered === 0) {
      // Worth shouting about: the profile has registered devices but not
      // one of them can receive anything, which is indistinguishable from
      // "notifications are broken" to the person holding the phone.
      console.error("[push] profile", profileId, "has no reachable devices —", dead.length, "token(s) removed");
    }
    return delivered;
  } catch (err) {
    console.error("[push] sendPushNotificationToProfile failed:", err instanceof Error ? err.message : err);
    return 0;
  }
}

async function deleteTokens(db: SupabaseClient, tokens: string[]): Promise<void> {
  const { error } = await db.from("push_tokens").delete().in("expo_push_token", tokens);
  if (error) console.error("[push] failed to delete dead tokens:", error.message);
  else console.warn("[push] removed", tokens.length, "unregistered device token(s)");
}

const EXPO_RECEIPTS_API = "https://exp.host/--/api/v2/push/getReceipts";

/** Expo asks for a delay before receipts are looked up; it typically has an
 * answer well inside this, and the sweep that calls this runs every ~15
 * minutes anyway. */
const RECEIPT_MIN_AGE_MS = 5 * 60 * 1000;

/** Expo's documented cap for one getReceipts call. */
const RECEIPT_BATCH_SIZE = 1000;

/**
 * Resolves outstanding push receipts and deletes any token the platform
 * reports as unregistered (the app was uninstalled, its data cleared, or
 * FCM rotated the registration — all of which mint a new token and orphan
 * the old row, which nothing else ever cleans up).
 *
 * Safe to call on a schedule; returns what it did so the cron can report
 * it. Never throws.
 */
export async function pruneDeadPushTokens(): Promise<{ checked: number; removed: number }> {
  try {
    const db = serviceClient();
    const cutoff = new Date(Date.now() - RECEIPT_MIN_AGE_MS).toISOString();
    const { data: rows, error } = await db
      .from("push_tokens")
      .select("expo_push_token, last_ticket_id")
      .not("last_ticket_id", "is", null)
      .lt("last_sent_at", cutoff)
      .limit(RECEIPT_BATCH_SIZE);

    if (error) {
      console.error("[push] failed to load pending receipts:", error.message);
      return { checked: 0, removed: 0 };
    }
    if (!rows || rows.length === 0) return { checked: 0, removed: 0 };

    const ids = rows.map((r: { last_ticket_id: string }) => r.last_ticket_id);
    const res = await fetch(EXPO_RECEIPTS_API, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) {
      console.error("[push] getReceipts returned", res.status);
      return { checked: rows.length, removed: 0 };
    }

    const body = (await res.json().catch(() => null)) as
      | { data?: Record<string, { status?: string; details?: { error?: string } }> }
      | null;
    const receipts = body?.data ?? {};

    const dead: string[] = [];
    const resolved: string[] = [];
    for (const row of rows as { expo_push_token: string; last_ticket_id: string }[]) {
      const receipt = receipts[row.last_ticket_id];
      // No receipt yet: leave the ticket in place and re-check next run.
      if (!receipt) continue;
      resolved.push(row.expo_push_token);
      if (receipt.details?.error === "DeviceNotRegistered") dead.push(row.expo_push_token);
      else if (receipt.status === "error") {
        console.error("[push] delivery error:", receipt.details?.error ?? "unknown");
      }
    }

    if (dead.length > 0) await deleteTokens(db, dead);

    // Clears the ticket on everything that came back, so a resolved token
    // isn't re-checked forever.
    const keep = resolved.filter((t) => !dead.includes(t));
    if (keep.length > 0) {
      await db
        .from("push_tokens")
        .update({ last_ticket_id: null })
        .in("expo_push_token", keep);
    }

    return { checked: rows.length, removed: dead.length };
  } catch (err) {
    console.error("[push] pruneDeadPushTokens failed:", err instanceof Error ? err.message : err);
    return { checked: 0, removed: 0 };
  }
}
