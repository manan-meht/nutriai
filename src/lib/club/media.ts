import type { SupabaseClient } from "@supabase/supabase-js";
import { COACH_MEDIA_BUCKET } from "./config";

// Coach photos: the profile portrait and the gallery shown on a coach's
// card and profile.
//
// The bucket is private (migration 0057), so nothing here ever returns a
// storage path to a browser — paths are resolved to short-lived signed
// URLs server-side, the same pattern meal photos use. A failure to sign
// returns undefined rather than throwing, so one broken image can never
// blank a coach's whole profile.

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_GALLERY_IMAGES = 6;

/** Turns a stored coach photo path into a signed URL. Accepts a full URL
 * unchanged, so any historical row holding one still renders. */
export async function resolveSignedCoachPhotoUrl(
  admin: SupabaseClient,
  value: string | null | undefined,
  expiresInSeconds = 3600
): Promise<string | undefined> {
  if (!value) return undefined;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  const { data, error } = await admin.storage.from(COACH_MEDIA_BUCKET).createSignedUrl(value, expiresInSeconds);
  if (error || !data) return undefined;
  return data.signedUrl;
}

/** Batch form, preserving order and length. */
export async function resolveSignedCoachPhotoUrls(
  admin: SupabaseClient,
  values: Array<string | null | undefined>,
  expiresInSeconds = 3600
): Promise<Array<string | undefined>> {
  return Promise.all(values.map((v) => resolveSignedCoachPhotoUrl(admin, v, expiresInSeconds)));
}

export type UploadCheck = { ok: true } | { ok: false; error: string };

/** Validates an uploaded image before it reaches storage. Shared by the
 * profile photo and gallery paths so the rules can't drift apart. */
export function checkUpload(file: File): UploadCheck {
  if (!file.type.startsWith("image/")) return { ok: false, error: "That file isn't an image." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "That image is larger than 8MB." };
  if (file.size === 0) return { ok: false, error: "That file is empty." };
  return { ok: true };
}

/** Storage path for a coach's upload. Keyed by coach profile id so one
 * coach's folder can never be written to by another. */
export function coachMediaPath(coachProfileId: string, kind: "profile" | "gallery", file: File): string {
  const extension = (file.type.split("/")[1] ?? "jpg").replace("jpeg", "jpg").replace("+xml", "");
  return `${coachProfileId}/${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
}
