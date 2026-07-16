import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContactType } from "./otp";

export async function setSharingPaused(db: SupabaseClient, contactId: string, contactType: ContactType, paused: boolean): Promise<void> {
  await db.from("end_user_access_settings").upsert({
    contact_id: contactId,
    contact_type: contactType,
    paused_at: paused ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  });
}

export async function requestRemoval(db: SupabaseClient, contactId: string, contactType: ContactType): Promise<void> {
  await db.from("end_user_access_settings").upsert({
    contact_id: contactId,
    contact_type: contactType,
    removal_requested_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

export async function isSharingPaused(db: SupabaseClient, contactId: string): Promise<boolean> {
  const { data } = await db
    .from("end_user_access_settings")
    .select("paused_at")
    .eq("contact_id", contactId)
    .maybeSingle();
  return !!data?.paused_at;
}
