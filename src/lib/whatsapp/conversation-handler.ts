import { createClient } from "@supabase/supabase-js";
import { sendTextMessage, normalizePhone } from "./client";
import { analyzeFood, buildConfirmationMessage, buildSuccessMessage, FoodAnalysisResult } from "@/lib/ai/food-analyzer";
import { getEntitlementSnapshot } from "@/lib/entitlements/entitlements";
import { END_USER_DASHBOARD_ENABLED } from "@/lib/billing/feature-flags";
import { classifyMeal } from "@/lib/nutrition/food-classification";
import { parseJoinCommand, type ParsedJoinCommand } from "@/lib/invites/parse-command";
import { getInviteByToken, validateInviteForClaim, markInviteClaimed } from "@/lib/invites/service";
import { buildWelcomeMessage, INVITE_ERROR_MESSAGES } from "@/lib/invites/messages";
import { trackInviteEvent } from "@/lib/invites/analytics";

const MY_PROGRESS_CTA = "\n\n📊 Want to see your own progress? Reply *My Progress* anytime.";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const MEAL_PHOTOS_BUCKET = "meal-photos";

function extensionForMimeType(mimeType?: string): string {
  if (!mimeType) return "jpg";
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  return "jpg";
}

/** Uploads the WhatsApp meal photo to Supabase Storage and returns its
 * public URL, so it can be attached to the pending meal (and later the
 * saved meal_logs row) for display in the caregiver/self dashboards.
 * Best-effort: a failed upload should never block meal logging. */
async function uploadMealPhoto(
  db: ReturnType<typeof admin>,
  entityId: string,
  buffer: Uint8Array,
  mimeType?: string
): Promise<string | undefined> {
  try {
    const path = `${entityId}/${Date.now()}.${extensionForMimeType(mimeType)}`;
    const { error } = await db.storage.from(MEAL_PHOTOS_BUCKET).upload(path, buffer, {
      contentType: mimeType ?? "image/jpeg",
      upsert: false,
    });
    if (error) {
      console.error("[whatsapp] meal photo upload failed:", error.message);
      return undefined;
    }
    const { data } = db.storage.from(MEAL_PHOTOS_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  } catch (err) {
    console.error("[whatsapp] meal photo upload threw:", err instanceof Error ? err.message : err);
    return undefined;
  }
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

// A lock this old is treated as abandoned (e.g. the function that claimed it
// crashed or timed out mid-analysis) rather than a genuinely in-flight
// message, so a new message isn't locked out forever.
const LOCK_STALE_MS = 60_000;

/** Handles a "JOIN FAMILY/SELF/COACHCLIENT <token>" message — the human-
 * initiated first message of a WhatsApp-first onboarding flow (see
 * src/lib/invites). Validates the invite, links the claiming WhatsApp
 * number to the right profile (creating it now for the 'self' flow, since
 * that profile doesn't exist until claim time), marks the invite claimed,
 * and replies with a welcome message. Never sends anything unprompted —
 * this only ever runs in response to a message the human sent first. */
async function handleInviteClaim(
  db: ReturnType<typeof admin>,
  from: string,
  normalizedFrom: string,
  command: ParsedJoinCommand
) {
  const invite = await getInviteByToken(db, command.token);
  const validation = validateInviteForClaim(invite);

  if (!validation.ok) {
    // Logged for abuse detection (e.g. repeated guesses against random
    // tokens) and ordinary debugging (expired/already-claimed links).
    console.warn("[whatsapp] invite claim failed:", { token: command.token, type: command.type, reason: validation.reason, from: normalizedFrom });
    await sendTextMessage(from, INVITE_ERROR_MESSAGES[validation.reason]);
    return;
  }

  // A token is only ever valid for the type it was created for — treat a
  // mismatched "JOIN SELF <token>" against a family invite the same as an
  // invalid token, rather than silently reinterpreting it.
  if (invite!.inviteType !== command.type) {
    console.warn("[whatsapp] invite type mismatch:", { token: command.token, expected: invite!.inviteType, got: command.type, from: normalizedFrom });
    await sendTextMessage(from, INVITE_ERROR_MESSAGES.invalid);
    return;
  }

  let targetProfileId = invite!.targetProfileId ?? undefined;

  if (command.type === "family" || command.type === "coach_client") {
    const table = command.type === "family" ? "adults_contacts" : "gym_clients";
    if (!targetProfileId) {
      console.error(`[whatsapp] ${command.type} invite has no target_profile_id:`, invite!.id);
      await sendTextMessage(from, INVITE_ERROR_MESSAGES.invalid);
      return;
    }
    await db
      .from(table)
      .update({
        whatsapp_number: normalizedFrom,
        // adults_contacts' invite_accepted_at drives the dashboard's
        // "Accepted" badge (see AdultsDashboardClient.tsx) — without this,
        // that badge stayed stuck on "pending" forever for anyone onboarded
        // through this WhatsApp-first flow, since it was previously only
        // ever set by the old bot-initiated invite's "first message" check.
        ...(command.type === "family" ? { invite_accepted_at: new Date().toISOString() } : {}),
      })
      .eq("id", targetProfileId);
  } else {
    // Self flow: the profile doesn't exist yet — create it now, claimed by
    // whoever just messaged in. Mirrors addSelfContact's plan="self" setup
    // (src/app/(adults)/adults/dashboard/actions.ts) without going through
    // the dashboard-only entitlement pre-checks; the DB-level
    // enforce_family_member_limit trigger (migration 0002/0003) still
    // applies unconditionally regardless of this insert's caller.
    const displayName = typeof invite!.metadata.displayName === "string" ? invite!.metadata.displayName : "You";
    await db.from("workspaces").update({ plan: "self" }).eq("id", invite!.workspaceId);
    const { data: contact, error } = await db
      .from("adults_contacts")
      .insert({
        workspace_id: invite!.workspaceId,
        caregiver_id: invite!.createdByUserId,
        full_name: displayName,
        whatsapp_number: normalizedFrom,
        relationship_type: "self",
        invite_sent_at: new Date().toISOString(),
        invite_accepted_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !contact) {
      console.error("[whatsapp] failed to create self-tracking profile on claim:", error?.message);
      await sendTextMessage(from, INVITE_ERROR_MESSAGES.invalid);
      return;
    }
    targetProfileId = contact.id;
  }

  await markInviteClaimed(db, invite!.id, { claimedByWhatsappNumber: normalizedFrom, targetProfileId });
  trackInviteEvent("invite_claimed", { inviteType: command.type, inviteId: invite!.id });
  await sendTextMessage(from, buildWelcomeMessage(command.type));
}

export async function handleIncomingMessage(msg: IncomingMessage, mediaBuffer?: Uint8Array) {
  const db = admin();
  const normalizedFrom = normalizePhone(msg.from);

  // WhatsApp-first onboarding: "JOIN FAMILY/SELF/COACHCLIENT <token>" is
  // handled before the normal contact lookup below, since by definition the
  // sender isn't linked to a contact/client yet. See src/lib/invites — the
  // bot never sends the first message of a conversation; the human always
  // initiates by sending this prefilled command from a wa.me link.
  if (msg.type === "text" && msg.text) {
    const joinCommand = parseJoinCommand(msg.text);
    if (joinCommand) {
      await handleInviteClaim(db, msg.from, normalizedFrom, joinCommand);
      return;
    }
  }

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
    await sendTextMessage(msg.from, "Hi! 👋 I'm Tistra Health, your nutrition assistant.\n\nI don't recognize this number yet — please ask the person who set this up to add you first.");
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

  // Cheap, non-authoritative peek — only used to gate the greeting/workout
  // short-circuits below, which don't mutate conversation state and are
  // safe to act on with a slightly stale read. The AI-analysis section
  // further down re-reads authoritatively via claimConversationLock().
  const { data: conv } = await db
    .from("whatsapp_conversations")
    .select("*")
    .eq("whatsapp_number", normalizedFrom)
    .maybeSingle();
  const peekState = conv?.state ?? "idle";

  // whatsapp_conversations has separate client_id (FK -> gym_clients) and
  // adults_contact_id (FK -> adults_contacts) columns — exactly one must be
  // set per row (see migration 0006). Writing the wrong one (or a
  // non-existent column, per an earlier version of this fix) fails the
  // insert/update outright.
  const entityColumn = isAdults ? { adults_contact_id: entityId } : { client_id: entityId };

  async function setConvState(newState: string, newPendingMeal?: FoodAnalysisResult | null) {
    const { error } = await db.from("whatsapp_conversations").upsert({
      ...entityColumn,
      workspace_id: workspaceId,
      whatsapp_number: normalizedFrom,
      state: newState,
      pending_meal: newPendingMeal ?? null,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "whatsapp_number" });
    // A write here failing silently is exactly what caused conversation
    // state to never persist for adults contacts previously (wrong/missing
    // columns) — log loudly so that class of bug can't hide again.
    if (error) console.error("[whatsapp] setConvState failed:", error.message);
  }

  /**
   * Compare-and-swap claim on the conversation row, so two messages arriving
   * close together (e.g. two photos sent back-to-back) can't both read the
   * same state and race to write conflicting next-states — which is what
   * previously caused a "Yes" reply to be misrouted into the food-analysis
   * branch when a concurrent message had left the row in the wrong state.
   * Returns the authoritative state/pendingMeal at claim time, or
   * acquired:false if another message is genuinely still being processed.
   */
  async function claimConversationLock(): Promise<{
    acquired: boolean;
    state: string;
    pendingMeal: FoodAnalysisResult | null;
  }> {
    const { data: existing } = await db
      .from("whatsapp_conversations")
      .select("*")
      .eq("whatsapp_number", normalizedFrom)
      .maybeSingle();

    const nowIso = new Date().toISOString();

    if (!existing) {
      const { data: created, error } = await db
        .from("whatsapp_conversations")
        .insert({
          ...entityColumn,
          workspace_id: workspaceId,
          whatsapp_number: normalizedFrom,
          state: "processing",
          last_message_at: nowIso,
          updated_at: nowIso,
        })
        .select()
        .maybeSingle();
      // A unique-constraint conflict here (concurrent insert race) is
      // expected and treated as "locked". Any other error is not — log it
      // so a schema mismatch or similar can't fail silently again.
      if (error && !error.message?.toLowerCase().includes("duplicate")) {
        console.error("[whatsapp] claimConversationLock insert failed:", error.message);
      }
      return created
        ? { acquired: true, state: "idle", pendingMeal: null }
        : { acquired: false, state: "idle", pendingMeal: null };
    }

    const isStale = existing.state === "processing" && existing.updated_at &&
      Date.now() - new Date(existing.updated_at).getTime() > LOCK_STALE_MS;

    if (existing.state === "processing" && !isStale) {
      return { acquired: false, state: existing.state, pendingMeal: existing.pending_meal ?? null };
    }

    // Optimistic concurrency: only succeeds if the row hasn't changed since
    // we just read it — if a concurrent request already claimed it between
    // our read and this write, this update matches zero rows.
    const { data: claimed } = await db
      .from("whatsapp_conversations")
      .update({ state: "processing", updated_at: nowIso })
      .eq("whatsapp_number", normalizedFrom)
      .eq("state", existing.state)
      .eq("updated_at", existing.updated_at)
      .select()
      .maybeSingle();

    if (!claimed) {
      return { acquired: false, state: existing.state, pendingMeal: existing.pending_meal ?? null };
    }

    return { acquired: true, state: existing.state, pendingMeal: existing.pending_meal ?? null };
  }

  async function saveMeal(analysis: FoodAnalysisResult) {
    const { data: mealRow, error: mealError } = await db
      .from("meal_logs")
      .insert({
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
        image_url: analysis.image_url ?? null,
        source: "whatsapp",
      })
      .select("id")
      .single();

    if (mealError || !mealRow) {
      console.error("[whatsapp] meal_logs insert failed:", mealError?.message);
      return;
    }

    await recordMealSubmissionForReview(analysis, mealRow.id);
  }

  /** Feeds the Tistra Meal Review Console (src/app/(admin)/admin) so
   * employees can QC AI classifications and build the food knowledge base.
   * Best-effort and non-blocking — a failure here must never prevent the
   * user-facing meal from being saved above. */
  async function recordMealSubmissionForReview(analysis: FoodAnalysisResult, mealLogId: string) {
    try {
      const classified = classifyMeal({
        id: mealLogId,
        loggedAt: new Date().toISOString(),
        mealType: analysis.meal_type,
        foods: analysis.foods,
        aiSummary: analysis.summary,
      });

      const { data: submission, error: submissionError } = await db
        .from("meal_submissions")
        .insert({
          user_id: entityId,
          user_type: isAdults ? "adults" : "gym",
          meal_log_id: mealLogId,
          image_url: analysis.image_url ?? null,
          caption: msg.type === "text" ? msg.text ?? null : null,
          meal_type: analysis.meal_type,
          source: "whatsapp",
          image_quality: analysis.image_url ? "clear" : "unknown",
        })
        .select("id")
        .single();

      if (submissionError || !submission) {
        console.error("[whatsapp] meal_submissions insert failed:", submissionError?.message);
        return;
      }

      const friedFoodPresent = analysis.foods.some((f) => /fried|pakora|tikki|cutlet|bhaji|vada/i.test(f.name));
      const healthierDirectionSignal =
        classified.mealBalanceStatus === "strong" && classified.homeCookedLikelihood === "high"
          ? "positive"
          : classified.mealBalanceStatus === "needs_support" && classified.ultraProcessedLikelihood === "high"
            ? "negative"
            : "neutral";

      await db.from("ai_meal_classifications").insert({
        meal_submission_id: submission.id,
        model_name: "gemini-3.5-flash",
        prompt_version: "v1",
        taxonomy_version: "v1",
        food_knowledge_base_version: "v1",
        detected_items_json: analysis.foods,
        structured_ai_output_json: analysis,
        protein_anchor_status: classified.proteinAnchorStatus,
        vegetable_fiber_status: classified.vegetableFiberStatus,
        carb_status: classified.carbPresent ? "present" : "missing",
        meal_balance_status: classified.mealBalanceStatus,
        home_cooked_likelihood: classified.homeCookedLikelihood,
        enjoyment_food_present: classified.enjoymentFoodPresent,
        sugary_drink_present: classified.sugaryDrinkPresent,
        fried_food_present: friedFoodPresent,
        ultra_processed_likelihood: classified.ultraProcessedLikelihood,
        healthier_direction_signal: healthierDirectionSignal,
        suggested_next_step: classified.suggestedNextStep,
        // No native confidence score from Gemini today — this heuristic
        // (foods detected at all vs. not) is a placeholder the review
        // console can refine once real confidence is available.
        confidence_score: analysis.foods.length > 0 ? 0.85 : 0.4,
        raw_ai_response_json: analysis,
      });
    } catch (err) {
      console.error("[whatsapp] meal review console recording failed:", err instanceof Error ? err.message : err);
    }
  }

  // "My Progress" — send the end-user dashboard link. Only offered when
  // the feature flag is on; otherwise this falls through to normal
  // meal-logging handling like any other text.
  if (END_USER_DASHBOARD_ENABLED && msg.type === "text" && msg.text?.trim().toLowerCase() === "my progress") {
    const { getProductDomain } = await import("@/lib/product/resolve-product");
    const domain = getProductDomain(isAdults ? "adults" : "gym");
    await sendTextMessage(msg.from, `📊 View your progress here:\nhttps://${domain}/my-progress`);
    return;
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
  if (!isAdults && peekState === "idle" && msg.type === "text" && msg.text && isWorkoutMessage(msg.text)) {
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

  // Block new AI meal analysis (the costly path) once the owner's trial or
  // subscription has lapsed. Greetings and workout logging above are
  // unaffected — they don't call the AI analyzer.
  const entitlement = await getEntitlementSnapshot(workspaceId, isAdults ? "adults" : "gym");
  if (entitlement.isReadOnly && (peekState === "idle" || peekState === "awaiting_correction" || peekState === "awaiting_confirmation")) {
    await sendTextMessage(
      msg.from,
      "This account's free trial has ended, so I can't analyze new meals right now. Please ask the person who set this up to subscribe — your past meals are still safe and visible in the dashboard."
    );
    return;
  }

  // Everything below mutates conversation state across an AI call, so it
  // must be serialized per phone number — claim the lock before touching
  // any of it, and every exit path from here must release it (by calling
  // setConvState) so a concurrent message never gets stuck behind a lock
  // that's never freed.
  const claim = await claimConversationLock();
  if (!claim.acquired) {
    await sendTextMessage(
      msg.from,
      isAdults
        ? "Still working on your last message — one moment! 🙏"
        : "Still processing your last message — hang tight! 🙏"
    );
    return;
  }

  const state = claim.state;
  const pendingMeal = claim.pendingMeal;

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
        // Reuse the photo already attached to a prior correction round
        // rather than re-uploading it on every correction message.
        analysis.image_url = pendingMeal?.image_url ?? (await uploadMealPhoto(db, entityId, mediaBuffer, msg.mediaMimeType));
      } else if (msg.type === "text" && msg.text) {
        analysis = await analyzeFood({
          text: msg.text,
          correctionContext: isCorrecting ? JSON.stringify(pendingMeal?.foods) : undefined,
        });
        // A text correction to a meal originally logged from a photo should
        // keep showing that photo rather than losing it.
        analysis.image_url = pendingMeal?.image_url;
      } else {
        const hint = isAdults
          ? "You can send me a photo of your plate or describe what you had 😊"
          : "Just send me a photo or describe what you ate and I'll log it! 🍽️";
        await sendTextMessage(msg.from, hint);
        await setConvState(state, pendingMeal); // release lock, unchanged
        return;
      }

      const confirmMsg = isAdults ? buildAdultsConfirmation(analysis) : buildConfirmationMessage(analysis);
      await sendTextMessage(msg.from, confirmMsg);
      await setConvState("awaiting_confirmation", analysis);
    } catch (err) {
      console.error("[whatsapp] food analysis error:", err instanceof Error ? err.message : err);
      const hint = isAdults
        ? "I couldn't quite make that out. Could you describe what you had? (e.g. \"idli, sambar and tea\")"
        : "Hmm, I couldn't quite identify that meal. Could you describe what you ate? (e.g. \"2 rotis, 1 katori dal, 1 bowl rice\")";
      await sendTextMessage(msg.from, hint);
      await setConvState(state, pendingMeal); // release lock, unchanged
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
        await sendTextMessage(msg.from, successMsg + (END_USER_DASHBOARD_ENABLED ? MY_PROGRESS_CTA : ""));
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
      try {
        const analysis = await analyzeFood({ text: msg.text, correctionContext: JSON.stringify(pendingMeal?.foods) });
        const confirmMsg = isAdults ? buildAdultsConfirmation(analysis) : buildConfirmationMessage(analysis);
        await sendTextMessage(msg.from, confirmMsg);
        await setConvState("awaiting_confirmation", analysis);
      } catch {
        const ask = isAdults ? "What should I change? 😊" : "What should I change? Just tell me what was different 😊";
        await sendTextMessage(msg.from, ask);
        await setConvState("awaiting_confirmation", pendingMeal); // release lock, unchanged
      }
      return;
    }

    const repeat = isAdults
      ? "Reply *Yes* to save this meal, or tell me what to correct 🙏"
      : "Reply *Yes* to log this meal, or tell me what to change 😊";
    await sendTextMessage(msg.from, repeat);
    await setConvState("awaiting_confirmation", pendingMeal); // release lock, unchanged
    return;
  }
}
