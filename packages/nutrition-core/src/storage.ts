import type { SupabaseClient } from "@supabase/supabase-js";

export const MEAL_PHOTOS_BUCKET = "meal-photos";

// Matches the public-URL shape Supabase's storage.from(bucket).getPublicUrl()
// produces: ".../storage/v1/object/public/meal-photos/<path>". Historical
// meal_logs.image_url/meal_submissions.image_url rows were stored this way
// while the bucket was public (see 0012_meal_photos.sql); new uploads store
// just the bare `<path>` going forward (see conversation-handler.ts's
// uploadMealPhoto). This lets one signed-URL helper handle both shapes
// without a backfill migration.
const PUBLIC_URL_MARKER = `/object/public/${MEAL_PHOTOS_BUCKET}/`;

/** Extracts the storage path from either a legacy full public URL or an
 * already-bare path. Exported mainly for testing. */
export function extractMealPhotoPath(value: string): string {
  const markerIndex = value.indexOf(PUBLIC_URL_MARKER);
  if (markerIndex === -1) return value;
  return value.slice(markerIndex + PUBLIC_URL_MARKER.length);
}

/** Turns a stored meal_logs.image_url/meal_submissions.image_url value
 * (legacy public URL or bare storage path) into a short-lived signed URL,
 * now that the meal-photos bucket is private (see
 * docs/FOOD_MODEL_IMPROVEMENT_AUDIT.md section F, gap #2 and
 * supabase/migrations/0040_private_meal_photos.sql). `admin` must be a
 * service-role client — signed-URL creation bypasses RLS/the bucket's
 * public flag entirely, matching this schema's existing convention of
 * service-role-only access to anything privacy-sensitive. Returns
 * undefined (never throws) for a null/empty value or a failed signing
 * call, so a missing/broken photo never blocks rendering the rest of a
 * meal.
 *
 * `expiresInSeconds` defaults to 1 hour — long enough for a dashboard page
 * load plus normal viewing, short enough that a leaked/cached link stops
 * working quickly. */
export async function resolveSignedMealPhotoUrl(
  admin: SupabaseClient,
  value: string | null | undefined,
  expiresInSeconds = 3600
): Promise<string | undefined> {
  if (!value) return undefined;
  const path = extractMealPhotoPath(value);
  const { data, error } = await admin.storage.from(MEAL_PHOTOS_BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error || !data) return undefined;
  return data.signedUrl;
}

/** Batch form of resolveSignedMealPhotoUrl for mapping a list of meal rows
 * — signs every value in parallel rather than serially awaiting each one
 * in a loop. Preserves input order/length (one output entry per input,
 * `undefined` for any that had no value or failed to sign). */
export async function resolveSignedMealPhotoUrls(
  admin: SupabaseClient,
  values: Array<string | null | undefined>,
  expiresInSeconds = 3600
): Promise<Array<string | undefined>> {
  return Promise.all(values.map((v) => resolveSignedMealPhotoUrl(admin, v, expiresInSeconds)));
}
