import { createClient } from "@supabase/supabase-js";
import { sendTextMessage, normalizePhone } from "./client";
import { analyzeFood, buildConfirmationMessage, buildSuccessMessage, FoodAnalysisResult } from "@/lib/ai/food-analyzer";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const WORKOUT_PHRASES = [
  "gym", "workout", "worked out", "cardio", "hiit", "crossfit",
  "leg day", "chest day", "back day", "arm day", "shoulder day", "push day", "pull day",
  "went for a run", "went running", "went for a walk", "went cycling",
  "yoga", "lifting", "hit the gym", "at the gym", "training session",
  "treadmill", "ran ", "jogging", "skipped", "deadlift", "bench press", "squats",
];

function isWorkoutMessage(text: string) {
  const t = text.toLowerCase();
  return WORKOUT_PHRASES.some((p) => t.includes(p));
}

const GREETINGS = ["hi", "hello", "hey", "hii", "hlo", "namaste", "namaskar", "gm", "sup", "good morning", "good afternoon", "good evening"];
const AFFIRMATIVES = ["yes", "y", "ok", "okay", "haan", "han", "ha", "correct", "right", "looks good", "perfect", "sure", "yep", "yup", "log it", "save it", "confirmed", "👍", "✅"];
const NEGATIVES = ["no", "nope", "nahi", "wrong", "change", "edit", "update", "not right", "incorrect", "different"];

function isGreeting(text: string) {
  const t = text.toLowerCase().trim();
  return GREETINGS.some((g) => t === g || t.startsWith(g + " ") || t.startsWith(g + "!") || t.startsWith(g + ","));
}
function isAffirmative(text: string) {
  const t = text.toLowerCase().trim();
  return AFFIRMATIVES.some((a) => t === a || t.startsWith(a + " ") || t.startsWith(a + "!") || t.startsWith(a + ","));
}
function isNegative(text: string) {
  const t = text.toLowerCase().trim();
  return NEGATIVES.some((n) => t === n || t.startsWith(n + " ") || t.startsWith(n + ","));
}

interface IncomingMessage {
  from: string;
  type: "text" | "image" | "audio" | "other";
  text?: string;
  mediaId?: string;
  mediaMimeType?: string;
}

// Adults-specific warmer messages
function buildAdultsConfirmation(analysis: FoodAnalysisResult): string {
  const foodLines = analysis.foods
    .map((f) => `• ${f.name} – ${f.quantity}`)
    .join("\n");
  const avgProtein = Math.round((analysis.total_protein_min + analysis.total_protein_max) / 2);
  const avgCal = Math.round((analysis.total_calories_min + analysis.total_calories_max) / 2);

  return `What a lovely meal! 😊 I can see:\n${foodLines}\n\nThat's roughly *${avgProtein}g protein and ${avgCal} kcal*.\n\nDoes that look right? Reply *Yes* to save it, or tell me what to correct 🙏`;
}

function buildAdultsSuccess(analysis: FoodAnalysisResult, targetProteinG?: number): string {
  const time = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  const mealType = analysis.meal_type.charAt(0).toUpperCase() + analysis.meal_type.slice(1);
  const avgProtein = Math.round((analysis.total_protein_min + analysis.total_protein_max) / 2);
  const avgCal = Math.round((analysis.total_calories_min + analysis.total_calories_max) / 2);

  let note = "Keep eating well! 🌟";
  if (targetProteinG) {
    const pct = Math.round((avgProtein / targetProteinG) * 100);
    if (pct >= 25) note = `That's about ${pct}% of your daily protein — protein helps keep you strong! 💪`;
  }

  return `✅ *${mealType} saved!*\n\n_${time}_\n${avgProtein}g protein · ${avgCal} kcal\n\n${note}`;
}

export async function handleIncomingMessage(msg: IncomingMessage, mediaBuffer?: Uint8Array) {
  const db = admin();
  const normalizedFrom = normalizePhone(msg.from);

  // Look up in gym_clients first
  const { data: gymClients } = await db
    .from("gym_clients")
    .select("id, full_name, whatsapp_number, workspace_id, trainer_id, gym_client_goals(target_protein_g, status)")
    .order("created_at", { ascending: false });

  const gymClient = (gymClients ?? []).find((c: any) =>
    normalizePhone(c.whatsapp_number ?? "") === normalizedFrom
  );

  // If not a gym client, look up in adults_contacts
  let adultsContact: any = null;
  if (!gymClient) {
    const { data: adultsContacts } = await db
      .from("adults_contacts")
      .select("id, full_name, whatsapp_number, workspace_id, caregiver_id, adults_contact_goals(target_protein_g, status)")
      .order("created_at", { ascending: false });

    adultsContact = (adultsContacts ?? []).find((c: any) =>
      normalizePhone(c.whatsapp_number ?? "") === normalizedFrom
    );
  }

  if (!gymClient && !adultsContact) {
    await sendTextMessage(msg.from, "Hi! 👋 I'm NutriAI, your nutrition assistant.\n\nI don't recognize this number yet — please ask the person who set this up to add you first.");
    return;
  }

  const isAdults = !!adultsContact;
  const entity = gymClient ?? adultsContact;
  const entityId = entity.id;
  const workspaceId = entity.workspace_id;
  const trainerId = isAdults ? entity.caregiver_id : entity.trainer_id;
  const firstName = entity.full_name.split(" ")[0];

  // Mark invite accepted on first-ever message from this contact
  if (isAdults && adultsContact.invite_sent_at && !adultsContact.invite_accepted_at) {
    await db
      .from("adults_contacts")
      .update({ invite_accepted_at: new Date().toISOString() })
      .eq("id", entityId);
  }

  // Get or create conversation state
  const { data: conv } = await db
    .from("whatsapp_conversations")
    .select("*")
    .eq("whatsapp_number", normalizedFrom)
    .single();

  const state = conv?.state ?? "idle";
  const pendingMeal = conv?.pending_meal ?? null;

  async function setConvState(newState: string, newPendingMeal?: FoodAnalysisResult | null) {
    await db.from("whatsapp_conversations").upsert({
      ...(isAdults ? { adults_contact_id: entityId } : { client_id: entityId }),
      workspace_id: workspaceId,
      whatsapp_number: normalizedFrom,
      product_type: isAdults ? "adults" : "gym",
      state: newState,
      pending_meal: newPendingMeal ?? null,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "whatsapp_number" });
  }

  async function saveMeal(analysis: FoodAnalysisResult) {
    await db.from("meal_logs").insert({
      ...(isAdults ? { adults_contact_id: entityId } : { client_id: entityId }),
      workspace_id: workspaceId,
      trainer_id: trainerId,
      meal_type: analysis.meal_type,
      logged_at: new Date().toISOString(),
      foods: analysis.foods,
      total_calories_min: analysis.total_calories_min,
      total_calories_max: analysis.total_calories_max,
      total_protein_min: analysis.total_protein_min,
      total_protein_max: analysis.total_protein_max,
      total_carbs_min: analysis.total_carbs_min,
      total_carbs_max: analysis.total_carbs_max,
      total_fat_min: analysis.total_fat_min,
      total_fat_max: analysis.total_fat_max,
      ai_summary: analysis.summary,
      source: "whatsapp",
    });
  }

  // Handle greeting
  if (msg.type === "text" && msg.text && isGreeting(msg.text)) {
    const greetMsg = isAdults
      ? `Hello ${firstName}! 😊\n\nWhenever you eat something, just send me a photo or describe it — I'll keep track for you. Your family will be so happy! 🌟`
      : `Hi ${firstName}! 👋\n\nJust send me a photo of your meal or describe what you ate, and I'll log it for you! 🥗`;
    await sendTextMessage(msg.from, greetMsg);
    return;
  }

  // Workout detection (gym only)
  if (!isAdults && state === "idle" && msg.type === "text" && msg.text && isWorkoutMessage(msg.text)) {
    await db.from("workout_logs").insert({
      client_id: entityId,
      workspace_id: workspaceId,
      trainer_id: trainerId,
      logged_at: new Date().toISOString(),
      description: msg.text,
      source: "whatsapp",
    });
    await sendTextMessage(
      msg.from,
      `💪 Workout logged!\n\n_${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}_\n\nKeep it up! Now send me a photo of your next meal 🥗`
    );
    return;
  }

  const activeGoal = isAdults
    ? (entity.adults_contact_goals ?? []).find((g: any) => g.status === "active")
    : (entity.gym_client_goals ?? []).find((g: any) => g.status === "active");

  const targetProtein = activeGoal?.target_protein_g;

  if (state === "idle" || state === "awaiting_correction") {
    const isCorrecting = state === "awaiting_correction";
    try {
      let analysis: FoodAnalysisResult;

      if (msg.type === "image" && mediaBuffer) {
        analysis = await analyzeFood({
          imageBuffer: mediaBuffer,
          imageMimeType: msg.mediaMimeType,
          correctionContext: isCorrecting ? JSON.stringify(pendingMeal?.foods) : undefined,
          text: msg.text,
        });
      } else if (msg.type === "text" && msg.text) {
        analysis = await analyzeFood({
          text: msg.text,
          correctionContext: isCorrecting ? JSON.stringify(pendingMeal?.foods) : undefined,
        });
      } else {
        const hint = isAdults
          ? "You can send me a photo of your plate or describe what you had 😊"
          : "Just send me a photo or describe what you ate and I'll log it! 🍽️";
        await sendTextMessage(msg.from, hint);
        return;
      }

      const confirmMsg = isAdults ? buildAdultsConfirmation(analysis) : buildConfirmationMessage(analysis);
      await sendTextMessage(msg.from, confirmMsg);
      await setConvState("awaiting_confirmation", analysis);
    } catch (err) {
      console.error("[NutriAI] food analysis error:", err instanceof Error ? err.message : err);
      const hint = isAdults
        ? "I couldn't quite make that out. Could you describe what you had? (e.g. \"idli, sambar and tea\")"
        : "Hmm, I couldn't quite identify that meal. Could you describe what you ate? (e.g. \"2 rotis, 1 katori dal, 1 bowl rice\")";
      await sendTextMessage(msg.from, hint);
    }
    return;
  }

  if (state === "awaiting_confirmation") {
    const text = msg.text ?? "";

    if (isAffirmative(text)) {
      if (pendingMeal) {
        await saveMeal(pendingMeal);
        const successMsg = isAdults
          ? buildAdultsSuccess(pendingMeal, targetProtein)
          : buildSuccessMessage(pendingMeal, targetProtein);
        await sendTextMessage(msg.from, successMsg);
      }
      await setConvState("idle", null);
      return;
    }

    if (isNegative(text) && text.split(" ").length <= 2) {
      const ask = isAdults ? "Of course! What should I change? 😊" : "What should I change? Just tell me what was different 😊";
      await sendTextMessage(msg.from, ask);
      await setConvState("awaiting_correction", pendingMeal);
      return;
    }

    if (msg.text && msg.text.length > 5 && !isAffirmative(text)) {
      await setConvState("awaiting_correction", pendingMeal);
      try {
        const analysis = await analyzeFood({ text: msg.text, correctionContext: JSON.stringify(pendingMeal?.foods) });
        const confirmMsg = isAdults ? buildAdultsConfirmation(analysis) : buildConfirmationMessage(analysis);
        await sendTextMessage(msg.from, confirmMsg);
        await setConvState("awaiting_confirmation", analysis);
      } catch {
        const ask = isAdults ? "What should I change? 😊" : "What should I change? Just tell me what was different 😊";
        await sendTextMessage(msg.from, ask);
      }
      return;
    }

    const repeat = isAdults
      ? "Reply *Yes* to save this meal, or tell me what to correct 🙏"
      : "Reply *Yes* to log this meal, or tell me what to change 😊";
    await sendTextMessage(msg.from, repeat);
    return;
  }
}
