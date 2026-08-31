import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSignedMealPhotoUrl } from "@nutriai/nutrition-core";
import type { FoodAnalysisResult } from "@/lib/ai/food-analyzer";
import { sendPushNotificationToProfile } from "./push";

/** The caregiver-facing "your mother logged a lunch" push.
 *
 * Lives here rather than inside conversation-handler because a meal reaches
 * meal_logs by TWO routes, and for a long time only one of them notified:
 *
 *   1. the WhatsApp reply path (conversation-handler's saveMeal), and
 *   2. the stale-clarification sweep in
 *      /api/cron/send-meal-reminders, which commits a pending_meal when a
 *      clarifying question ("is that a dosa or a pancake?") goes unanswered
 *      for 10+ minutes.
 *
 * Route 2 saved the meal and messaged the person who ate it, but never
 * pushed the caregiver — so every meal that needed a clarification the
 * contact ignored went silently unreported, while still showing up in the
 * app. That looks exactly like "push notifications stopped working".
 */

/** Signed-URL lifetime for a meal photo attached to a push notification.
 * Longer than the 1-hour dashboard default (resolveSignedMealPhotoUrl) on
 * purpose: a notification can sit unopened in the shade overnight, and the
 * OS fetches the image at *display* time, so a 1-hour link would routinely
 * expire into a missing thumbnail. 24 hours is still short enough that a
 * link leaked out of a notification payload stops working within a day. */
export const MEAL_PHOTO_PUSH_URL_TTL_SECONDS = 24 * 60 * 60;

/** "a lunch" / "an omelette"-style article, so the notification title reads
 * naturally for both consonant- and vowel-initial meal labels. */
function aOrAn(word: string): string {
  return /^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`;
}

/** Rounds a min/max estimate into the compact "480–600" (or plain "520"
 * when the range collapses) form used throughout notification copy. */
function formatEstimateRange(min: number | undefined, max: number | undefined): string | null {
  const lo = Math.round(min ?? 0);
  const hi = Math.round(max ?? 0);
  if (!lo && !hi) return null;
  return lo === hi ? `${lo}` : `${lo}–${hi}`;
}

/** Builds the notification body: what was eaten, then the two numbers a
 * caregiver actually acts on (calories and protein). Food names come from
 * the analysis's structured items rather than analysis.summary, which is
 * conversational WhatsApp prose ("Nice — that looks like…") and reads badly
 * truncated on a lock screen. Caps the list at three items so the body
 * stays inside the ~2 lines Android/iOS show collapsed.
 *
 * Exported for tests. */
export function summariseMealForNotification(analysis: FoodAnalysisResult): string {
  const names = (analysis.foods ?? []).map((f) => f.name).filter(Boolean);
  const shown = names.slice(0, 3).join(", ");
  const remainder = names.length - 3;
  const foodPart = shown
    ? remainder > 0
      ? `${shown} +${remainder} more`
      : shown
    : analysis.summary;

  const parts: string[] = [];
  if (foodPart) parts.push(foodPart);

  const calories = formatEstimateRange(analysis.total_calories_min, analysis.total_calories_max);
  if (calories) parts.push(`~${calories} kcal`);
  const protein = formatEstimateRange(analysis.total_protein_min, analysis.total_protein_max);
  if (protein) parts.push(`${protein}g protein`);

  return parts.join(" · ");
}

export function relationshipLabelForNotification(
  relationship: string | null | undefined,
  gender: string | null | undefined
): string | null {
  switch (relationship) {
    case "son":
    case "daughter":
    case "friend":
      return relationship;
    case "parent":
      return gender === "male" ? "father" : gender === "female" ? "mother" : "parent";
    case "sibling":
      return gender === "male" ? "brother" : gender === "female" ? "sister" : "sibling";
    case "spouse":
      return gender === "male" ? "husband" : gender === "female" ? "wife" : "spouse";
    default:
      return null;
  }
}

/** The contact fields this notification reads. The WhatsApp path already
 * has these loaded and passes them straight through; the cron sweep only
 * has an id, so it lets the lookup below fetch them. */
export interface FamilyMealContact {
  id: string;
  full_name: string;
  caregiver_id: string | null;
  relationship: string | null;
  relationship_type: string | null;
  gender: string | null;
}

const CONTACT_COLUMNS = "id, full_name, caregiver_id, relationship, relationship_type, gender";

export interface NotifyCaregiverParams {
  workspaceId: string;
  mealType: string;
  analysis?: FoodAnalysisResult;
  /** Pre-loaded contact, when the caller already has one. */
  contact?: FamilyMealContact;
  /** Used to load the contact when `contact` isn't supplied. */
  adultsContactId?: string;
}

/**
 * Push-notifies the caregiver that someone they look after logged a meal.
 *
 * Only fires for a family-plan workspace, and never for a contact whose
 * relationship_type is "self" — a "self" contact on a multi-member family
 * plan (added via PersonForm's "Myself" chip) is the caregiver themselves,
 * who would just be getting notified about their own upload.
 *
 * Best-effort and fully swallowed: a push failure must never affect the
 * WhatsApp save-confirmation flow or the cron sweep that call this.
 */
export async function notifyCaregiverOfFamilyMeal(
  db: SupabaseClient,
  { workspaceId, mealType, analysis, contact, adultsContactId }: NotifyCaregiverParams
): Promise<void> {
  try {
    let resolved = contact ?? null;
    if (!resolved) {
      if (!adultsContactId) return;
      const { data } = await db
        .from("adults_contacts")
        .select(CONTACT_COLUMNS)
        .eq("id", adultsContactId)
        .maybeSingle();
      resolved = (data as FamilyMealContact | null) ?? null;
    }
    if (!resolved) return;
    if (resolved.relationship_type === "self") return;

    // The caregiver comes from the CONTACT, never from the conversation
    // row: whatsapp_conversations has no trainer_id/caregiver_id column at
    // all, so the sweep's old `conv.trainer_id` was silently undefined —
    // which both wrote a null meal_logs.trainer_id and, had it notified,
    // would have addressed the push to nobody.
    const caregiverId = resolved.caregiver_id;
    if (!caregiverId) return;

    const { data: workspace } = await db
      .from("workspaces")
      .select("plan")
      .eq("id", workspaceId)
      .maybeSingle();
    if (workspace?.plan !== "family") return;

    const firstName = resolved.full_name.split(" ")[0];
    const who = relationshipLabelForNotification(resolved.relationship, resolved.gender);
    // Title carries who + which meal (the old body's entire content), which
    // frees the body to carry what they actually ate — the part a caregiver
    // glancing at a lock screen wants without opening the app.
    const title = who
      ? `Your ${who} logged ${aOrAn(mealType)}`
      : `${firstName} logged ${aOrAn(mealType)}`;
    const body = analysis
      ? summariseMealForNotification(analysis)
      : who
        ? `Your ${who} just logged a ${mealType}.`
        : `${firstName} just logged a ${mealType}.`;

    const imageUrl = analysis?.image_url
      ? await resolveSignedMealPhotoUrl(db, analysis.image_url, MEAL_PHOTO_PUSH_URL_TTL_SECONDS)
      : undefined;

    await sendPushNotificationToProfile(caregiverId, {
      title,
      body,
      imageUrl,
      // imageUrl is mirrored into data so the in-app notification list /
      // tap handler can show the same thumbnail without re-signing, and
      // so iOS (no service extension yet — see PushNotificationPayload)
      // still has the photo available to the JS side.
      data: { type: "meal_logged", adultsContactId: resolved.id, workspaceId, imageUrl },
    });
  } catch (err) {
    console.error(
      "[notifications] notifyCaregiverOfFamilyMeal failed:",
      err instanceof Error ? err.message : err
    );
  }
}
