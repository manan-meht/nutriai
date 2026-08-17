import type { SupabaseClient } from "@supabase/supabase-js";

// Family-loop reaction handling for the mobile app — mirrors the web app's
// reactToMeal server action (src/app/(adults)/adults/dashboard/actions.ts)
// and reaction-message builder. Duplicated here rather than shared,
// matching this app's existing convention (see feedback.ts's own comment):
// mobile-api is an independently deployed worker with its own bundle
// budget, and these few dozen lines aren't worth a cross-app dependency.
//
// Send-once rule: only the FIRST reaction on a meal triggers the WhatsApp
// line; an emoji change updates the stored row silently. Enforced by
// meal_reactions' unique constraint (migration 0055).

const GRAPH_URL = "https://graph.facebook.com/v21.0";

export type ReactionEmoji = "👍" | "🎉" | "❤️";
export const REACTION_EMOJIS: ReactionEmoji[] = ["👍", "🎉", "❤️"];

/** Attention, never judgment — identical warmth for dal and for cake. */
export function buildReactionMessage(input: { caregiverName: string; mealLabel: string; emoji: string }): string {
  return `${input.caregiverName} saw your ${input.mealLabel} and sent you a ${input.emoji} 😊`;
}

async function sendWhatsAppText(to: string, body: string): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) throw new Error("WhatsApp is not configured on mobile-api");

  const res = await fetch(`${GRAPH_URL}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace(/^\+/, ""), type: "text", text: { body } }),
  });
  if (!res.ok) throw new Error(`WhatsApp send failed: ${res.status} ${(await res.text().catch(() => "")).slice(0, 150)}`);
}

export async function reactToMeal(input: {
  /** RLS-scoped client for the authenticated caregiver — ownership checks. */
  supabase: SupabaseClient;
  /** Service-role client — meal_reactions is RLS-locked to server code. */
  admin: SupabaseClient;
  reactorProfileId: string;
  contactId: string;
  mealLogId: string;
  emoji: ReactionEmoji;
}): Promise<{ error?: string; emoji?: string }> {
  const { supabase, admin, reactorProfileId, contactId, mealLogId, emoji } = input;

  const { data: contact } = await supabase
    .from("adults_contacts")
    .select("id, whatsapp_number")
    .eq("id", contactId)
    .eq("caregiver_id", reactorProfileId)
    .single();
  if (!contact) return { error: "Contact not found" };

  const { data: meal } = await supabase
    .from("meal_logs")
    .select("id, meal_type")
    .eq("id", mealLogId)
    .eq("adults_contact_id", contactId)
    .single();
  if (!meal) return { error: "Meal not found" };

  const { error: insertError } = await admin
    .from("meal_reactions")
    .insert({ meal_log_id: mealLogId, reactor_profile_id: reactorProfileId, emoji });

  if (insertError) {
    if (insertError.code === "23505") {
      // Already reacted — update the emoji, never resend.
      await admin
        .from("meal_reactions")
        .update({ emoji, updated_at: new Date().toISOString() })
        .eq("meal_log_id", mealLogId)
        .eq("reactor_profile_id", reactorProfileId);
      return { emoji };
    }
    return { error: insertError.message };
  }

  // First reaction — send the WhatsApp line, best-effort (a closed 24h
  // window on an older meal fails quietly; the reaction is still stored).
  try {
    const { data: profile } = await admin.from("profiles").select("full_name").eq("id", reactorProfileId).maybeSingle();
    const rawName = profile?.full_name ?? "";
    const caregiverName = rawName && !/[@+]/.test(rawName) ? rawName.split(" ")[0] : "Your family member";
    const mealLabel = (meal.meal_type && meal.meal_type !== "other" ? meal.meal_type : "meal").toLowerCase();
    await sendWhatsAppText(contact.whatsapp_number, buildReactionMessage({ caregiverName, mealLabel, emoji }));
    await admin
      .from("meal_reactions")
      .update({ whatsapp_delivered: true })
      .eq("meal_log_id", mealLogId)
      .eq("reactor_profile_id", reactorProfileId);
  } catch (err) {
    console.error("[meal-reactions] WhatsApp send failed:", err instanceof Error ? err.message : err);
  }

  return { emoji };
}
