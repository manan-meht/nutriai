import { createClient } from "@supabase/supabase-js";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Claims a WhatsApp message id (wamid) for processing. Returns true the
 * first time a given id is seen (go ahead and process it), false on every
 * subsequent call for the same id (a Meta webhook redelivery — skip
 * entirely, no AI call, no reply). Uses an insert-and-check-conflict
 * pattern rather than a read-then-write check, so it's safe against two
 * near-simultaneous deliveries of the same retried webhook.
 */
export async function claimMessageId(messageId: string): Promise<boolean> {
  const { error } = await admin().from("whatsapp_processed_messages").insert({ message_id: messageId });
  if (!error) return true;
  // Postgres unique_violation — someone already claimed this id.
  if (error.code === "23505") return false;
  // Any other error (e.g. transient network issue): fail open rather than
  // silently dropping a real message the user is waiting on.
  console.error("[whatsapp-dedup] claim failed, processing anyway:", error);
  return true;
}

/**
 * Claims a WhatsApp media id, the same way claimMessageId claims a wamid.
 * Covers a different redelivery path: the WhatsApp client itself silently
 * resending a photo as a second, distinct message (its own wamid) after a
 * flaky send. That isn't caught by claimMessageId since the wamid differs,
 * but the underlying media id — assigned once per upload by Meta — is the
 * same, so claiming it here stops the same photo being analyzed and logged
 * twice under two different message ids.
 */
export async function claimMediaId(mediaId: string): Promise<boolean> {
  const { error } = await admin().from("whatsapp_processed_media").insert({ media_id: mediaId });
  if (!error) return true;
  if (error.code === "23505") return false;
  console.error("[whatsapp-dedup] media claim failed, processing anyway:", error);
  return true;
}

/**
 * Releases a claim so a Meta redelivery can retry the message.
 *
 * The claim tables are "claim before work", which is right for
 * exactly-once: a redelivery arriving while the first attempt is still
 * running must not trigger a second AI analysis. But it means a claim that
 * is never followed by completed work turns into permanent data loss — the
 * user's photo is dropped and every retry Meta sends is skipped.
 *
 * So a failed attempt gives the claim back. The worst case becomes a
 * duplicate (visible, correctable) instead of a silent loss (invisible,
 * and the user only finds out when their meal never appears).
 */
export async function releaseMessageId(messageId: string): Promise<void> {
  const { error } = await admin().from("whatsapp_processed_messages").delete().eq("message_id", messageId);
  if (error) console.error("[whatsapp-dedup] failed to release message claim:", error);
}

export async function releaseMediaId(mediaId: string): Promise<void> {
  const { error } = await admin().from("whatsapp_processed_media").delete().eq("media_id", mediaId);
  if (error) console.error("[whatsapp-dedup] failed to release media claim:", error);
}
