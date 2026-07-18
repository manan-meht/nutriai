import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContactType } from "./otp";

export type AuditEvent =
  | "code_generated"
  | "code_regenerated"
  | "code_revoked"
  | "code_verification_failed"
  | "code_used"
  | "participant_access_granted";

/** Records a Temporary Access Code lifecycle event. Never includes the
 * plaintext code — metadata is for context only (e.g. failure reason,
 * generated-by role), matching the "do not log the plaintext code"
 * requirement. Best-effort: a logging failure should never block the
 * actual access-code flow, so this swallows its own errors. */
export async function recordAuditEvent(
  db: SupabaseClient,
  event: AuditEvent,
  contactId: string,
  contactType: ContactType,
  opts: { actorUserId?: string; metadata?: Record<string, unknown> } = {}
): Promise<void> {
  try {
    await db.from("end_user_audit_events").insert({
      event,
      contact_id: contactId,
      contact_type: contactType,
      actor_user_id: opts.actorUserId ?? null,
      metadata: opts.metadata ?? {},
    });
  } catch {
    // Best-effort — see module doc.
  }
}
