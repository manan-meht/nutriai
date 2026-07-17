export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendTextMessage } from "@/lib/whatsapp/client";
import { resolveMealLabel, formatMealLabel } from "@/lib/ai/food-analyzer";

// If a clarification question (e.g. "is this an omelette, a dosa, or a
// pancake?") goes unanswered, the meal previously just sat in
// whatsapp_conversations.pending_meal forever, never logged — and the
// conversation lock could get stuck at state: "processing" if a later
// message hit it (see conversation-handler.ts's saveBestGuessForClarification
// for the "a new photo arrives before the old question is answered" case,
// handled inline there since it has the full message-handling closures
// available). This route handles the other case: nobody replied at all.
// After STALE_CLARIFICATION_MS of silence, save the meal using the AI's
// original best-guess values and release the conversation back to idle.
//
// Deliberately simpler than the live webhook's saveMeal(): this route runs
// with no per-message closures (no db-scoped entityId/workspaceId/msg
// context to reuse), so it re-derives the minimum it needs directly rather
// than importing conversation-handler.ts's internals. It skips
// meal_submissions/review-console recording and the family push
// notification that the live path has — both are follow-up work, not core
// to "don't lose the meal and don't leave the lock stuck."
//
// Cloudflare Pages has no built-in Cron Triggers — pinged periodically by
// the same companion Worker as send-meal-reminders (apps/meal-reminders-cron),
// on a tighter interval so the 10-minute threshold isn't overshot by much.
const STALE_CLARIFICATION_MS = 10 * 60 * 1000;

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const db = createServiceClient();
  const cutoff = new Date(Date.now() - STALE_CLARIFICATION_MS).toISOString();

  const { data: stale } = await db
    .from("whatsapp_conversations")
    .select("*")
    .eq("state", "awaiting_clarification")
    .lt("last_message_at", cutoff);

  let resolved = 0;
  let skipped = 0;

  for (const conv of stale ?? []) {
    const pending = conv.pending_meal;
    if (!pending) {
      skipped++;
      continue;
    }

    const isAdults = !!conv.adults_contact_id;
    const entityId = isAdults ? conv.adults_contact_id : conv.client_id;

    // Adults contacts carry their own timezone; gym_clients don't (see
    // conversation-handler.ts's contactTimezone comment) — same fallback.
    let timezone: string | undefined;
    if (isAdults) {
      const { data: contact } = await db.from("adults_contacts").select("timezone").eq("id", entityId).maybeSingle();
      timezone = contact?.timezone;
    }

    const resolvedLabel = resolveMealLabel(pending.meal_type, new Date(), timezone);

    const { data: mealRow, error: mealError } = await db
      .from("meal_logs")
      .insert({
        ...(isAdults ? { adults_contact_id: entityId } : { client_id: entityId }),
        workspace_id: conv.workspace_id,
        trainer_id: conv.trainer_id,
        meal_type: resolvedLabel,
        logged_at: new Date().toISOString(),
        foods: pending.foods,
        total_calories_min: pending.total_calories_min,
        total_calories_max: pending.total_calories_max,
        total_protein_min: pending.total_protein_min,
        total_protein_max: pending.total_protein_max,
        total_carbs_min: pending.total_carbs_min,
        total_carbs_max: pending.total_carbs_max,
        total_fat_min: pending.total_fat_min,
        total_fat_max: pending.total_fat_max,
        total_fiber_min: pending.total_fiber_min,
        total_fiber_max: pending.total_fiber_max,
        ai_summary: pending.summary,
        image_url: pending.image_url ?? null,
        source: "whatsapp",
      })
      .select("id")
      .single();

    if (mealError || !mealRow) {
      console.error("[resolve-stale-clarifications] meal_logs insert failed:", conv.id, mealError?.message);
      skipped++;
      continue;
    }

    try {
      if (conv.whatsapp_number) {
        await sendTextMessage(
          conv.whatsapp_number,
          `Since I didn't hear back, I've saved your ${formatMealLabel(resolvedLabel).toLowerCase()} using my best guess: ${pending.summary}.`
        );
      }
    } catch (err) {
      // The meal is already saved — a failed notification shouldn't
      // prevent releasing the lock below.
      console.error("[resolve-stale-clarifications] notification send failed:", conv.id, err instanceof Error ? err.message : err);
    }

    await db
      .from("whatsapp_conversations")
      .update({
        state: "idle",
        pending_meal: { ...pending, status: "saved", savedMealId: mealRow.id, updatedAt: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      })
      .eq("id", conv.id);

    resolved++;
  }

  return NextResponse.json({ checked: (stale ?? []).length, resolved, skipped });
}
