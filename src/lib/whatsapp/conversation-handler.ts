import { createClient } from "@supabase/supabase-js";
import { sendTextMessage, normalizePhone } from "./client";
import {
  analyzeFood,
  answerNutritionQuestion,
  buildClarificationMessage,
  buildContradictionCheckMessage,
  buildSavedMessage,
  buildAutoSaveMessage,
  buildHighImpactClarificationMessage,
  buildLowConfidenceClarificationMessage,
  buildCorrectionUpdateMessage,
  computeSaveDecision,
  pickDiscardAck,
  pickUndoAck,
  resolveMealLabel,
  formatMealLabel,
  FoodAnalysisResult,
  MealType,
} from "@/lib/ai/food-analyzer";
import { getEntitlementSnapshot } from "@/lib/entitlements/entitlements";
import { END_USER_DASHBOARD_ENABLED } from "@/lib/billing/feature-flags";
import { classifyMeal, recommendProteinGrams } from "@nutriai/dashboard-core";
import { proteinTargetG, type FoodBalanceUserProfile } from "@nutriai/health-scoring";
import { parseJoinCommand, type ParsedJoinCommand } from "@/lib/invites/parse-command";
import { getInviteByToken, validateInviteForClaim, markInviteClaimed } from "@/lib/invites/service";
import { buildWelcomeMessage, INVITE_ERROR_MESSAGES } from "@/lib/invites/messages";
import { trackInviteEvent } from "@/lib/invites/analytics";
import { sendPushNotificationToProfile } from "@/lib/notifications/push";

const MY_PROGRESS_CTA = "\n\n📊 Want to see your own progress? Reply *My Progress* anytime.";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// adults_contacts.relationship stores generic terms (see RELATIONSHIPS in
// src/components/adults/AddContactModal.tsx: son/daughter/spouse/parent/
// sibling/friend/other), not gendered ones — "parent"/"spouse"/"sibling"
// are gender-neutral by design so the same option works regardless of the
// contact's gender. For push-notification copy ("Your mother just logged
// a lunch") we want the more natural gendered term where the contact's
// gender makes one unambiguous; "son"/"daughter"/"friend" are already
// gendered/neutral as stored and pass through unchanged. Returns null for
// "other", an unset relationship, or an unrecognized value — callers
// should fall back to the contact's first name in that case.
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
const AFFIRMATIVES = ["yes", "y", "ok", "okay", "haan", "han", "ha", "correct", "right", "looks right", "looks good", "perfect", "sure", "yep", "yup", "save", "log it", "save it", "confirmed", "👍", "✅"];

// A bare negative ("no", "nope") is genuinely ambiguous — it could mean
// "discard this" or "let me correct it" — so it's classified separately
// from both discard and correction, and gets a follow-up question instead
// of a guess. Anchored to the WHOLE message (not just a prefix), so "No,
// this is not chicken, it's fish." — a correction — never matches this:
// only a message that IS just a bare negative (optionally with trailing
// punctuation) counts.
const BARE_NEGATIVE_PATTERNS = [
  /^no\.?!?$/, /^nope\.?!?$/, /^nah\.?!?$/, /^no thanks?\.?!?$/, /^nahi\.?$/, /^na\.?$/,
];

// Short words that clearly signal "I want to correct something" but don't
// say what yet — distinct from a bare negative, which is ambiguous about
// whether the user wants to correct or discard.
const VAGUE_CORRECTION_WORDS = ["wrong", "change", "edit", "update", "not right", "incorrect", "different"];

// Explicit "don't log this" intent. Regex-based (rather than a plain
// keyword list) so natural phrasings like "nothing. No need to record
// anything" are caught by their meaning, not an exact-string match — a
// plain keyword list previously missed that exact reply, which fell
// through to being treated as a food correction and produced a
// nonsensical "I've revised the estimate" with the same, unchanged
// numbers. None of these require the WHOLE message to match, since a
// discard phrase can appear inside a longer sentence ("nothing, no need
// to record anything") — but none of them overlap with plain "no", so a
// correction like "No, this is fish" never matches any of these either.
const CANCEL_PATTERNS = [
  /^skip\.?$/, /^skip (it|this)\.?$/,
  /^cancel\.?$/,
  /^discard\.?$/,
  /^nothing\.?$/,
  /nothing to save/,
  /ignore this/,
  /^leave it( as is)?\.?$/,
  /don'?t (save|log|record|bother)/,
  /do not (save|log|record)/,
  /not recording/,
  /no need/,
  /never ?mind/,
  /forget it/,
];

const SHOW_TODAY_PHRASES = ["show today", "today's summary", "todays summary", "daily summary", "show my day", "show summary"];

function isGreeting(text: string) {
  const t = text.toLowerCase().trim();
  return GREETINGS.some((g) => t === g || t.startsWith(g + " ") || t.startsWith(g + "!") || t.startsWith(g + ","));
}
function isAffirmative(text: string) {
  const t = text.toLowerCase().trim();
  return AFFIRMATIVES.some((a) => t === a || t.startsWith(a + " ") || t.startsWith(a + "!") || t.startsWith(a + ","));
}
function isBareNegative(text: string) {
  const t = text.toLowerCase().trim();
  return BARE_NEGATIVE_PATTERNS.some((re) => re.test(t));
}
/** Only matches when the WHOLE message is just the vague word (plus
 * trailing punctuation) — a prefix match would also swallow real,
 * specific corrections like "change the rice to half cup" or "change to
 * dinner" (the latter is already handled earlier by detectMealTypeChange
 * anyway), losing the correction the user already gave in full. */
function isVagueCorrectionSignal(text: string) {
  const t = text.toLowerCase().trim();
  return VAGUE_CORRECTION_WORDS.some((w) => t === w || t === w + "." || t === w + "!");
}
function isCancel(text: string) {
  const t = text.toLowerCase().trim();
  return CANCEL_PATTERNS.some((re) => re.test(t));
}

// "Undo" wording used to remove an already-auto-saved meal. Distinct from
// (but overlapping with) isCancel's discard phrases — the SAME words
// ("skip", "don't record", "no need to record") mean different things
// depending on whether a meal has already been saved: before saving they
// mean "never log this," after saving they mean "take back what was
// logged." Both are routed through this single check; which one applies
// is determined by the caller's context (idle+recentlySaved / vs a
// pending, unsaved meal), not by the wording itself.
const UNDO_PATTERNS = [
  /^undo\.?$/,
  /remove (that|this|it)( log| meal)?/,
  /delete (that|this|it)( log| meal)?/,
];
function isUndoIntent(text: string) {
  const t = text.toLowerCase().trim();
  return UNDO_PATTERNS.some((re) => re.test(t)) || isCancel(t);
}

function isShowToday(text: string) {
  const t = text.toLowerCase().trim();
  return SHOW_TODAY_PHRASES.some((p) => t === p || t.includes(p)) || t === "today";
}
function isHypotheticalQuestion(text: string) {
  const t = text.toLowerCase().trim();
  if (!t.endsWith("?")) return false;
  return /^if (this|it|that) (was|were|had been)|^what if/.test(t);
}
function isNutritionQuestion(text: string) {
  const t = text.toLowerCase().trim();
  if (!t.endsWith("?")) return false;
  return /how many (calories|kcal|protein|carbs|grams)|what should i eat|what.?s (healthier|better)|is .* healthy|calories in|protein in|would this be|okay for (breakfast|lunch|dinner|snack)/.test(t);
}

type PendingReplyIntent = "confirm" | "discard" | "vague_correction" | "correction" | "ambiguous_negative" | "unclear";

/** Classifies a free-text reply to a pending meal estimate, in priority
 * order: confirmation, explicit discard, ambiguous bare negative, vague
 * correction signal, then (if there's enough text to work with) a real
 * correction. Question intent is handled separately, earlier in the
 * pipeline, since it applies regardless of state and never reaches this
 * classifier. */
export function classifyPendingReply(text: string): PendingReplyIntent {
  const t = text.trim();
  if (!t) return "unclear";
  if (isAffirmative(t)) return "confirm";
  if (isCancel(t)) return "discard";
  if (isBareNegative(t)) return "ambiguous_negative";
  if (isVagueCorrectionSignal(t)) return "vague_correction";
  if (t.length > 3) return "correction";
  return "unclear";
}

const MEAL_TYPE_WORDS: Record<string, MealType> = {
  breakfast: "breakfast", lunch: "lunch", dinner: "dinner", snack: "snack",
  tea: "tea", coffee: "coffee", wine: "wine", juice: "juice", drink: "drink",
};
function detectMealTypeChange(text: string): MealType | null {
  const t = text.toLowerCase();
  const m = t.match(/(?:change|make|save)(?: it| this)?(?: to| as)?\s+(breakfast|lunch|dinner|snack|tea|coffee|wine|juice|drink)\b/);
  if (m) return MEAL_TYPE_WORDS[m[1]];
  return null;
}

const HOT_DRINK_WORDS = ["tea", "coffee", "chai"];
const ALCOHOL_WORDS = ["wine", "beer", "whisky", "whiskey", "vodka", "rum", "alcohol", "cocktail"];
/** True when a correction's wording falls in a clearly different drink
 * category than what the previous guess was (e.g. photo looked like tea,
 * correction says "wine") — the one case where we ask a single clarifying
 * question before accepting the override outright. */
function isConflictingDrinkCorrection(previousMealType: MealType, correctionText: string): MealType | null {
  const t = correctionText.toLowerCase();
  const previousIsHot = previousMealType === "tea" || previousMealType === "coffee";
  const previousIsAlcohol = previousMealType === "wine";
  if (previousIsHot && ALCOHOL_WORDS.some((w) => t.includes(w))) return previousMealType;
  if (previousIsAlcohol && HOT_DRINK_WORDS.some((w) => t.includes(w))) return previousMealType;
  return null;
}

function isZeroMacro(a: FoodAnalysisResult) {
  return a.total_calories_min === 0 && a.total_calories_max === 0 && a.total_protein_min === 0 && a.total_protein_max === 0;
}

interface IncomingMessage {
  from: string;
  type: "text" | "image" | "audio" | "other";
  text?: string;
  mediaId?: string;
  mediaMimeType?: string;
}

/** Shape persisted in whatsapp_conversations.pending_meal — a FoodAnalysisResult
 * plus the bookkeeping needed to confirm/correct/save/detect duplicates. */
interface PendingMeal extends FoodAnalysisResult {
  status: "pending_confirmation" | "saved" | "awaiting_clarification" | "awaiting_correction_confirmation";
  savedMealId?: string;
  updatedAt: string;
}

const RECENT_SAVE_WINDOW_MS = 60 * 60 * 1000; // a correction after this long is treated as a new meal, not an edit

// A lock this old is treated as abandoned (e.g. the function that claimed it
// crashed or timed out mid-analysis) rather than a genuinely in-flight
// message, so a new message isn't locked out forever.
const LOCK_STALE_MS = 60_000;

const GREETING_REPEAT_GAP_MS = 6 * 60 * 60 * 1000; // don't repeat the full greeting within 6h

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
    // whoever just messaged in, using the details collected via the
    // "Add your details" form before the invite link was ever generated
    // (see saveSelfDetailsAndCreateInvite) rather than a bare name. Mirrors
    // addContact's field mapping / goal-row creation without going through
    // the dashboard-only entitlement pre-checks; the DB-level
    // enforce_family_member_limit trigger (migration 0002/0003) still
    // applies unconditionally regardless of this insert's caller.
    const meta = invite!.metadata as Record<string, unknown>;
    const fullName = typeof meta.fullName === "string" && meta.fullName ? meta.fullName : "You";
    await db.from("workspaces").update({ plan: "self" }).eq("id", invite!.workspaceId);
    const { data: contact, error } = await db
      .from("adults_contacts")
      .insert({
        workspace_id: invite!.workspaceId,
        caregiver_id: invite!.createdByUserId,
        full_name: fullName,
        whatsapp_number: normalizedFrom,
        relationship_type: "self",
        age: typeof meta.age === "number" ? meta.age : null,
        gender: typeof meta.gender === "string" ? meta.gender : null,
        weight_kg: typeof meta.weightKg === "number" ? meta.weightKg : null,
        height_cm: typeof meta.heightCm === "number" ? meta.heightCm : null,
        health_notes: typeof meta.healthNotes === "string" ? meta.healthNotes : null,
        invite_sent_at: new Date().toISOString(),
        invite_accepted_at: new Date().toISOString(),
        // Food Balance Score profile fields (see saveSelfDetailsAndCreateInvite
        // / SelfSetupCard.tsx) — replaces the old adults_contact_goals write
        // below entirely.
        primary_nutrition_goal: typeof meta.primaryNutritionGoal === "string" ? meta.primaryNutritionGoal : null,
        date_of_birth: typeof meta.dateOfBirth === "string" ? meta.dateOfBirth : null,
        metabolic_equation_sex: typeof meta.metabolicEquationSex === "string" ? meta.metabolicEquationSex : null,
        activity_level: typeof meta.activityLevel === "string" ? meta.activityLevel : null,
        resistance_training_status: typeof meta.resistanceTrainingStatus === "string" ? meta.resistanceTrainingStatus : null,
        target_weight_kg: typeof meta.targetWeightKg === "number" ? meta.targetWeightKg : null,
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
    .select("id, full_name, whatsapp_number, workspace_id, trainer_id, weight_kg, height_cm, age, gender, primary_nutrition_goal, date_of_birth, metabolic_equation_sex, activity_level, resistance_training_status")
    .order("created_at", { ascending: false });

  const gymClient = (gymClients ?? []).find((c: any) =>
    normalizePhone(c.whatsapp_number ?? "") === normalizedFrom
  );

  // If not a gym client, look up in adults_contacts
  let adultsContact: any = null;
  if (!gymClient) {
    const { data: adultsContacts } = await db
      .from("adults_contacts")
      .select("id, full_name, whatsapp_number, workspace_id, caregiver_id, timezone, weight_kg, height_cm, age, gender, relationship, primary_nutrition_goal, date_of_birth, metabolic_equation_sex, activity_level, resistance_training_status")
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
  // gym_clients has no timezone column — resolveMealLabel falls back to
  // Asia/Kolkata for those. Used so meal-type-by-time (see
  // resolveMealLabel) reflects the contact's actual clock, not the
  // server's or a hardcoded default.
  const contactTimezone: string | undefined = isAdults ? entity.timezone : undefined;

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
  // adults_contact_id (FK -> adults_contacts) columns — a CHECK constraint
  // (migration 0006) requires exactly one to be non-null per row. The same
  // phone number can end up registered as both a gym client and an adults
  // contact (e.g. reused test data); gymClient always wins the lookup above,
  // so a row previously linked to the adults contact must have that column
  // explicitly cleared here, or the upsert violates the constraint, fails,
  // and (since the error was only logged, not surfaced) silently leaves the
  // conversation lock stuck in "processing" forever.
  const entityColumn = isAdults
    ? { adults_contact_id: entityId, client_id: null }
    : { client_id: entityId, adults_contact_id: null };

  async function setConvState(newState: string, newPendingMeal?: PendingMeal | null, extra?: Record<string, unknown>) {
    const { error } = await db.from("whatsapp_conversations").upsert({
      ...entityColumn,
      workspace_id: workspaceId,
      whatsapp_number: normalizedFrom,
      state: newState,
      pending_meal: newPendingMeal ?? null,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...extra,
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
    pendingMeal: PendingMeal | null;
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

  function toPendingMeal(
    analysis: FoodAnalysisResult,
    status: PendingMeal["status"]
  ): PendingMeal {
    return { ...analysis, status, updatedAt: new Date().toISOString() };
  }

  /** Best-effort daily protein/calorie totals for the "Today so far" line.
   * Uses the midpoint of each meal's min/max range. Never throws — a
   * failure here should degrade to "no totals line", not break saving. */
  async function getDailyTotals(): Promise<{ protein: number; calories: number } | null> {
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const { data: todaysMeals, error } = await db
        .from("meal_logs")
        .select("total_protein_min, total_protein_max, total_calories_min, total_calories_max")
        .eq(isAdults ? "adults_contact_id" : "client_id", entityId)
        .gte("logged_at", startOfDay.toISOString());
      if (error || !todaysMeals) return null;
      let protein = 0;
      let calories = 0;
      for (const m of todaysMeals as any[]) {
        protein += Math.round(((m.total_protein_min ?? 0) + (m.total_protein_max ?? 0)) / 2);
        calories += Math.round(((m.total_calories_min ?? 0) + (m.total_calories_max ?? 0)) / 2);
      }
      return { protein, calories };
    } catch (err) {
      console.error("[whatsapp] getDailyTotals failed:", err instanceof Error ? err.message : err);
      return null;
    }
  }

  async function saveMeal(analysis: FoodAnalysisResult, resolvedLabel: MealType): Promise<string | undefined> {
    const { data: mealRow, error: mealError } = await db
      .from("meal_logs")
      .insert({
        ...(isAdults ? { adults_contact_id: entityId } : { client_id: entityId }),
        workspace_id: workspaceId,
        trainer_id: trainerId,
        meal_type: resolvedLabel,
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
        total_fiber_min: analysis.total_fiber_min,
        total_fiber_max: analysis.total_fiber_max,
        ai_summary: analysis.summary,
        image_url: analysis.image_url ?? null,
        source: "whatsapp",
      })
      .select("id")
      .single();

    if (mealError || !mealRow) {
      console.error("[whatsapp] meal_logs insert failed:", mealError?.message);
      return undefined;
    }

    await recordMealSubmissionForReview(analysis, mealRow.id);
    await notifyCaregiverOfFamilyMeal(resolvedLabel);
    return mealRow.id;
  }

  /** Force-saves a meal that's been sitting in "awaiting_clarification"
   * using the AI's original best-guess values, without ever getting the
   * clarification answered — called when a new photo arrives before the
   * old question was answered (a new photo always takes priority, and
   * silently discarding the earlier meal would be worse than logging it
   * with unresolved ambiguity). The stale-clarification cron sweep (10
   * minutes of silence — see src/app/api/cron/resolve-stale-clarifications)
   * does the equivalent for the "nobody sent anything else at all" case,
   * but as a standalone route it can't reuse this closure. */
  async function saveBestGuessForClarification(pending: PendingMeal): Promise<void> {
    const resolvedLabel = resolveMealLabel(pending.meal_type, new Date(), contactTimezone);
    const savedMealId = await saveMeal(pending, resolvedLabel);
    await sendTextMessage(
      msg.from,
      `Since a new photo came in, I've saved your earlier ${formatMealLabel(resolvedLabel).toLowerCase()} using my best guess: ${pending.summary}.`
    );
    await setConvState("idle", savedMealId ? { ...toPendingMeal(pending, "saved"), savedMealId } : null);
  }

  /**
   * Push-notifies the caregiver (trainerId, which for adults contacts is
   * caregiver_id — see the entity resolution above) when a meal is logged
   * on a family-plan workspace. Deliberately scoped to workspaces.plan ===
   * 'family': a 'self' workspace's caregiver *is* the person the meal
   * belongs to (notifying them about their own upload is redundant), and
   * gym/coach ('coach' plan / isAdults === false) isn't in scope for this
   * notification yet — see sendPushNotificationToProfile's docs for how to
   * extend this later.
   *
   * Best-effort and fully swallowed: a push failure must never affect the
   * WhatsApp save-confirmation flow that calls this.
   */
  async function notifyCaregiverOfFamilyMeal(resolvedLabel: MealType): Promise<void> {
    try {
      if (!isAdults) return;
      const { data: workspace } = await db
        .from("workspaces")
        .select("plan")
        .eq("id", workspaceId)
        .maybeSingle();
      if (workspace?.plan !== "family") return;

      const who = relationshipLabelForNotification(adultsContact.relationship, adultsContact.gender);
      const body = who ? `Your ${who} just logged a ${resolvedLabel}.` : `${firstName} just logged a ${resolvedLabel}.`;

      await sendPushNotificationToProfile(trainerId, {
        title: "Meal logged",
        body,
        data: { type: "meal_logged", adultsContactId: entityId, workspaceId },
      });
    } catch (err) {
      console.error("[whatsapp] notifyCaregiverOfFamilyMeal failed:", err instanceof Error ? err.message : err);
    }
  }

  /** Updates an already-saved meal_logs row in place (used when a
   * correction arrives shortly after a save — see item 12/duplicate-save
   * prevention: this must never create a second row for the same meal). */
  async function updateSavedMeal(mealLogId: string, analysis: FoodAnalysisResult, resolvedLabel: MealType) {
    const { error } = await db
      .from("meal_logs")
      .update({
        meal_type: resolvedLabel,
        foods: analysis.foods,
        total_calories_min: analysis.total_calories_min,
        total_calories_max: analysis.total_calories_max,
        total_protein_min: analysis.total_protein_min,
        total_protein_max: analysis.total_protein_max,
        total_carbs_min: analysis.total_carbs_min,
        total_carbs_max: analysis.total_carbs_max,
        total_fat_min: analysis.total_fat_min,
        total_fat_max: analysis.total_fat_max,
        total_fiber_min: analysis.total_fiber_min,
        total_fiber_max: analysis.total_fiber_max,
        ai_summary: analysis.summary,
      })
      .eq("id", mealLogId);
    if (error) console.error("[whatsapp] meal_logs update failed:", error.message);
  }

  /** "Undo" — removes an already-auto-saved meal_logs row outright.
   * meal_submissions/ai_meal_classifications rows (see
   * 0013_meal_review_console.sql) reference it via `on delete set null`,
   * so review-console history survives with the link cleared rather than
   * being deleted itself. */
  async function deleteMeal(mealLogId: string) {
    const { error } = await db.from("meal_logs").delete().eq("id", mealLogId);
    if (error) console.error("[whatsapp] meal_logs delete failed:", error.message);
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
        model_name: "gemini-2.5-flash",
        prompt_version: "v2",
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
        confidence_score: analysis.confidence === "high" ? 0.9 : analysis.confidence === "low" ? 0.4 : 0.7,
        raw_ai_response_json: analysis,
      });
    } catch (err) {
      console.error("[whatsapp] meal review console recording failed:", err instanceof Error ? err.message : err);
    }
  }

  /** Best-effort capture of a user correction that meaningfully changed the
   * AI's portion/protein/food/meal-type estimate, into
   * meal_portion_corrections (see 0018_meal_portion_corrections.sql). This
   * is the raw material for tightening the portion-estimation prompt over
   * time — a failure here must never block the correction flow itself. */
  async function recordPortionCorrectionFeedback(
    previous: FoodAnalysisResult,
    corrected: FoodAnalysisResult,
    correctionText: string,
    mealLogId?: string
  ) {
    try {
      const prevProtein = (previous.total_protein_min + previous.total_protein_max) / 2;
      const newProtein = (corrected.total_protein_min + corrected.total_protein_max) / 2;
      const proteinDelta = newProtein - prevProtein;
      const proteinChangedMeaningfully = Math.abs(proteinDelta) >= Math.max(5, prevProtein * 0.2);
      const foodChanged = previous.foods.map((f) => f.name.toLowerCase()).join(",") !== corrected.foods.map((f) => f.name.toLowerCase()).join(",");
      const mealTypeChanged = previous.meal_type !== corrected.meal_type;

      // Nothing worth recording — the correction didn't move the estimate
      // in any way we'd want to learn from.
      if (!proteinChangedMeaningfully && !foodChanged && !mealTypeChanged) return;

      let issueType: string;
      if (foodChanged && !proteinChangedMeaningfully) issueType = "wrong_food";
      else if (mealTypeChanged && !proteinChangedMeaningfully && !foodChanged) issueType = "wrong_meal_type";
      else if (proteinDelta < 0) issueType = "portion_overestimate";
      else if (proteinDelta > 0) issueType = "portion_underestimate";
      else issueType = "wrong_calories";

      const primaryFood = corrected.foods[0]?.name ?? previous.foods[0]?.name ?? null;

      await db.from("meal_portion_corrections").insert({
        user_id: entityId,
        user_type: isAdults ? "adults" : "gym",
        meal_log_id: mealLogId ?? null,
        image_url: corrected.image_url ?? previous.image_url ?? null,
        original_model_output: previous,
        user_correction_text: correctionText,
        final_logged_meal: corrected,
        issue_type: issueType,
        food_type: primaryFood,
        original_estimated_weight: previous.foods.map((f) => f.estimated_cooked_weight_grams).filter(Boolean).join(", ") || null,
        corrected_estimated_weight: corrected.foods.map((f) => f.estimated_cooked_weight_grams).filter(Boolean).join(", ") || null,
        original_protein_estimate: Math.round(prevProtein),
        corrected_protein_estimate: Math.round(newProtein),
      });
    } catch (err) {
      console.error("[whatsapp] meal_portion_corrections recording failed:", err instanceof Error ? err.message : err);
    }
  }

  /** The confidence-based auto-save decision point — every path that ends
   * up with a fresh (or corrected) FoodAnalysisResult funnels through
   * here, whether that's a brand-new photo, a resolved clarification, or
   * a correction to an already-saved meal. Decides, via
   * computeSaveDecision(), whether to pause for a targeted clarification
   * or to save/update immediately — "Reply Yes to save" is no longer the
   * default path. References `seed`/`targetProtein`, declared further
   * down in handleIncomingMessage — safe because this is only ever called
   * after those assignments have run. */
  async function finalizeEstimate(
    analysis: FoodAnalysisResult,
    opts: { existing?: PendingMeal; isClarificationResolution?: boolean } = {}
  ) {
    const decision = computeSaveDecision(analysis);

    if (decision.shouldAskClarification) {
      const clarificationMsg = decision.hasHighImpactAmbiguity
        ? buildHighImpactClarificationMessage(analysis, decision)
        : buildLowConfidenceClarificationMessage(decision);
      await sendTextMessage(msg.from, clarificationMsg);
      await setConvState("awaiting_clarification", toPendingMeal(analysis, "awaiting_clarification"));
      return;
    }

    const resolvedLabel = resolveMealLabel(analysis.meal_type, new Date(), contactTimezone);
    const existing = opts.existing;

    // Updating an already-saved meal (a correction, or a clarification
    // answer for a meal that — unusually — was already saved) happens in
    // place: never a second meal_logs row for the same meal.
    if (existing?.status === "saved" && existing.savedMealId) {
      await updateSavedMeal(existing.savedMealId, analysis, resolvedLabel);
      await sendTextMessage(msg.from, buildCorrectionUpdateMessage(resolvedLabel, analysis));
      await setConvState("idle", { ...toPendingMeal(analysis, "saved"), savedMealId: existing.savedMealId });
      return;
    }

    const savedMealId = await saveMeal(analysis, resolvedLabel);
    const dailyTotals = await getDailyTotals();
    const autoSaveMsg = buildAutoSaveMessage(analysis, resolvedLabel, decision, {
      seed,
      dailyTotals: dailyTotals ? { ...dailyTotals, targetProteinG: targetProtein } : null,
      isClarificationResolution: opts.isClarificationResolution,
    });
    await sendTextMessage(msg.from, autoSaveMsg + (END_USER_DASHBOARD_ENABLED ? MY_PROGRESS_CTA : ""));
    await setConvState("idle", savedMealId ? { ...toPendingMeal(analysis, "saved"), savedMealId } : null);
  }

  /** Shared "the user sent free text that should update/finalize a
   * pending or already-saved meal" handler — used for corrections arriving
   * directly, after a bare "no", after a clarification is answered, after
   * a drink-contradiction check, and after an auto-saved meal gets
   * corrected. Runs the conflicting-drink contradiction check and the
   * zero-macro guard, records portion-correction feedback, then hands off
   * to finalizeEstimate() to decide save/update/ask-again. References
   * `seed`, declared further down in handleIncomingMessage — safe because
   * this is only ever called after that assignment has run. */
  async function runFreeTextCorrection(
    correctionText: string,
    previous: PendingMeal | null,
    opts: { isClarificationResolution?: boolean; inheritPhoto?: boolean } = {}
  ) {
    // Every caller except the idle+recentlySaved shortcut is a genuine
    // mid-conversation correction to `previous` (answering a
    // clarification, resolving a contradiction check, replying inside
    // awaiting_edit_or_undo/awaiting_skip_or_correction/
    // awaiting_confirmation) — inheriting its photo is correct there. That
    // one shortcut is ambiguous: recentlySaved just means a meal was
    // saved a moment ago, not that this new text is about the same meal
    // (it could be a brand-new, unrelated meal logged by text), so it
    // opts out via inheritPhoto: false. Mirrors the isCorrecting gate in
    // the image/text branches below.
    const inheritPhoto = opts.inheritPhoto ?? true;

    if (previous) {
      const conflictBase = isConflictingDrinkCorrection(previous.meal_type, correctionText);
      if (conflictBase) {
        const analysis = await analyzeFood({ text: correctionText, correctionContext: JSON.stringify(previous.foods) });
        analysis.image_url = inheritPhoto ? previous.image_url : undefined;
        await sendTextMessage(msg.from, buildContradictionCheckMessage(formatMealLabel(conflictBase).toLowerCase(), analysis.meal_type));
        await setConvState("awaiting_correction_confirmation", toPendingMeal(analysis, "awaiting_correction_confirmation"));
        return;
      }
    }

    const analysis = await analyzeFood({ text: correctionText, correctionContext: JSON.stringify(previous?.foods) });
    analysis.image_url = inheritPhoto ? previous?.image_url : undefined;

    if (isZeroMacro(analysis) && !analysis.is_zero_calorie_item) {
      await sendTextMessage(msg.from, buildClarificationMessage(seed));
      await setConvState("awaiting_clarification", toPendingMeal(analysis, "awaiting_clarification"));
      return;
    }

    if (previous) {
      await recordPortionCorrectionFeedback(previous, analysis, correctionText, previous.status === "saved" ? previous.savedMealId : undefined);
    }

    await finalizeEstimate(analysis, { existing: previous ?? undefined, isClarificationResolution: opts.isClarificationResolution });
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

  // "show today" — a plain daily summary, doesn't touch conversation state
  // or the AI, safe to answer immediately.
  if (msg.type === "text" && msg.text && isShowToday(msg.text)) {
    const totals = await getDailyTotals();
    if (!totals || (totals.protein === 0 && totals.calories === 0)) {
      await sendTextMessage(msg.from, "No meals logged yet today.");
    } else {
      await sendTextMessage(msg.from, `Today so far: ${totals.protein}g protein · ${totals.calories.toLocaleString("en-IN")} kcal.`);
    }
    return;
  }

  // Handle greeting — only send the full onboarding greeting once per day
  // (or after a 6h+ gap); otherwise a short, non-repetitive nudge.
  if (msg.type === "text" && msg.text && isGreeting(msg.text)) {
    const lastGreetedAt = conv?.last_greeted_at ? new Date(conv.last_greeted_at).getTime() : 0;
    const recentlyGreeted = Date.now() - lastGreetedAt < GREETING_REPEAT_GAP_MS;
    const greetMsg = recentlyGreeted
      ? "Hey! Send a photo whenever you're ready 🙂"
      : isAdults
        ? `Hello ${firstName}! 😊\n\nWhenever you eat something, just send me a photo or describe it — I'll keep track for you.`
        : `Hi ${firstName}! 👋\n\nJust send me a photo of your meal or describe what you ate, and I'll log it for you!`;
    await sendTextMessage(msg.from, greetMsg);
    await setConvState(peekState, conv?.pending_meal ?? null, { last_greeted_at: new Date().toISOString() });
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
      `💪 Workout logged.\n\n_${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}_\n\nSend me a photo of your next meal whenever you're ready.`
    );
    return;
  }

  // Protein target for meal-feedback text — computed from the Food Balance
  // Score profile (primary_nutrition_goal + weight/goal-specific range) when
  // a goal has been set, same as the web dashboards; falls back to the
  // general age/weight/gender recommendation otherwise (replaces the old
  // adults_contact_goals/gym_client_goals-based target_protein_g).
  const foodBalanceProfile: FoodBalanceUserProfile | undefined = entity.primary_nutrition_goal
    ? {
        goal: entity.primary_nutrition_goal,
        dateOfBirth: entity.date_of_birth ?? undefined,
        age: entity.age ?? undefined,
        heightCm: entity.height_cm ?? undefined,
        currentWeightKg: entity.weight_kg ?? undefined,
        metabolicEquationSex: entity.metabolic_equation_sex ?? undefined,
        activityLevel: entity.activity_level ?? undefined,
        resistanceTraining: entity.resistance_training_status ?? undefined,
      }
    : undefined;
  const proteinRange = foodBalanceProfile ? proteinTargetG(foodBalanceProfile) : null;
  const targetProtein = proteinRange
    ? Math.round((proteinRange.lower + proteinRange.upper) / 2)
    : recommendProteinGrams({ weightKg: entity.weight_kg, heightCm: entity.height_cm, age: entity.age, gender: entity.gender });

  // Block new AI meal analysis (the costly path) once the owner's trial or
  // subscription has lapsed. Greetings, workout logging, and "show today"
  // above are unaffected — they don't call the AI analyzer.
  const entitlement = await getEntitlementSnapshot(workspaceId, isAdults ? "adults" : "gym");
  if (entitlement.isReadOnly && peekState !== "processing") {
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
  const text = msg.text ?? "";
  const seed = `${entityId}:${new Date().toDateString()}:${text.length}`;

  // Free-standing questions never mutate the pending/saved meal — answer
  // and release the lock unchanged, regardless of current state.
  if (msg.type === "text" && text) {
    if (isHypotheticalQuestion(text)) {
      try {
        const context = pendingMeal ? `${pendingMeal.summary} (${pendingMeal.foods.map((f) => `${f.name} ${f.quantity}`).join(", ")})` : undefined;
        const answer = await answerNutritionQuestion(text, context);
        await sendTextMessage(msg.from, `${answer}\n\nDo you want me to update the saved meal, or was this just a question?`);
      } catch {
        await sendTextMessage(msg.from, "I couldn't work that out right now — could you ask again in a moment?");
      }
      await setConvState(state, pendingMeal);
      return;
    }
    if (isNutritionQuestion(text)) {
      try {
        const answer = await answerNutritionQuestion(text);
        await sendTextMessage(msg.from, answer);
      } catch {
        await sendTextMessage(msg.from, "I couldn't work that out right now — could you ask again in a moment?");
      }
      await setConvState(state, pendingMeal);
      return;
    }
  }

  // Explicit discard intent ("skip", "don't save", "no need to record
  // anything", ...) — discard whatever's pending, from any confirm/
  // correct/clarify/ambiguous-negative state. Checked before any of those
  // states get a chance to (mis)treat the message as a correction.
  if (msg.type === "text" && text && isCancel(text) &&
    (state === "awaiting_confirmation" || state === "awaiting_correction" || state === "awaiting_clarification" ||
      state === "awaiting_correction_confirmation" || state === "awaiting_skip_or_correction")) {
    await sendTextMessage(msg.from, pickDiscardAck(seed));
    await setConvState("idle", null);
    return;
  }

  // A fresh photo always takes priority over whatever the conversation was
  // waiting on — previously an image arriving while state was
  // awaiting_confirmation/awaiting_clarification/awaiting_correction_confirmation
  // (e.g. a leftover unconfirmed meal from earlier) fell through every
  // branch below untouched, since none of them checked msg.type === "image",
  // and the bot silently re-sent the old "Reply Yes" prompt without ever
  // looking at the new photo. A new image is never a correction of the old
  // guess — it's treated as an entirely new estimate.
  if (msg.type === "image" && mediaBuffer &&
    (state === "awaiting_confirmation" || state === "awaiting_clarification" || state === "awaiting_correction_confirmation" ||
      state === "awaiting_skip_or_correction" || state === "awaiting_edit_or_undo")) {
    try {
      // A new photo arriving while the previous meal is still stuck
      // awaiting an unanswered clarification question — save that one now
      // with the AI's original best-guess values rather than leaving it
      // (or losing it) once this new photo takes over the conversation.
      if (state === "awaiting_clarification" && pendingMeal) {
        await saveBestGuessForClarification(pendingMeal);
      }

      // The photo upload doesn't depend on the analysis result (or vice
      // versa) — running them in parallel instead of sequentially shaves
      // the upload's full round-trip off the total reply latency.
      const [analysis, imageUrl] = await Promise.all([
        analyzeFood({ imageBuffer: mediaBuffer, imageMimeType: msg.mediaMimeType, text: msg.text }),
        uploadMealPhoto(db, entityId, mediaBuffer, msg.mediaMimeType),
      ]);
      analysis.image_url = imageUrl;

      if (isZeroMacro(analysis) && !analysis.is_zero_calorie_item) {
        await sendTextMessage(msg.from, buildClarificationMessage(seed));
        await setConvState("awaiting_clarification", toPendingMeal(analysis, "awaiting_clarification"));
        return;
      }

      // A brand new photo is always a fresh meal, never a correction/update
      // of whatever the conversation was previously waiting on.
      await finalizeEstimate(analysis);
    } catch (err) {
      console.error("[whatsapp] food analysis error (new photo mid-flow):", err instanceof Error ? err.message : err);
      const hint = isAdults
        ? "I couldn't quite make that out. Could you describe what you had? (e.g. \"idli, sambar and tea\")"
        : "Hmm, I couldn't quite identify that meal. Could you describe what you ate? (e.g. \"2 rotis, 1 katori dal, 1 bowl rice\")";
      await sendTextMessage(msg.from, hint);
      await setConvState(state, pendingMeal); // release lock, unchanged
    }
    return;
  }

  // A meal-type-only correction ("change to lunch", "make this dinner") on
  // a pending or just-saved meal doesn't need another AI call — just
  // relabel it directly.
  if (msg.type === "text" && text && pendingMeal) {
    const requestedType = detectMealTypeChange(text);
    if (requestedType) {
      const updated: PendingMeal = { ...pendingMeal, meal_type: requestedType, updatedAt: new Date().toISOString() };
      // An explicit "change to lunch"/"make this dinner" command is saved
      // exactly as asked — unlike the model's own guess, this is never
      // second-guessed against the clock (see resolveMealLabel's docs).
      const resolvedLabel = requestedType;
      if (pendingMeal.status === "saved" && pendingMeal.savedMealId &&
        Date.now() - new Date(pendingMeal.updatedAt).getTime() < RECENT_SAVE_WINDOW_MS) {
        await updateSavedMeal(pendingMeal.savedMealId, updated, resolvedLabel);
        await sendTextMessage(msg.from, `Got it — updated the saved ${formatMealLabel(resolvedLabel).toLowerCase()}.`);
        await setConvState("idle", { ...updated, status: "saved" });
      } else {
        await sendTextMessage(msg.from, `Got it — updated to ${formatMealLabel(resolvedLabel).toLowerCase()}.\n\nReply *Yes* to save, or tell me what else to change.`);
        await setConvState("awaiting_confirmation", { ...updated, status: "pending_confirmation" });
      }
      return;
    }
  }

  // Correction / portion-change / add / remove / replace item text arriving
  // shortly after a save updates that saved meal in place, instead of
  // logging an unrelated second meal (item 12).
  const recentlySaved = pendingMeal?.status === "saved" && pendingMeal.savedMealId &&
    Date.now() - new Date(pendingMeal.updatedAt).getTime() < RECENT_SAVE_WINDOW_MS;

  // "Undo" / "don't record" / "skip" / "no need to record" after an
  // auto-save removes that just-saved meal outright — the SAME wording
  // that discards a not-yet-saved meal (isCancel) means "take back what
  // was already logged" here instead of "never log it."
  if (state === "idle" && recentlySaved && msg.type === "text" && text && isUndoIntent(text)) {
    await deleteMeal(pendingMeal!.savedMealId!);
    await sendTextMessage(msg.from, pickUndoAck(seed));
    await setConvState("idle", null);
    return;
  }

  // A bare "no" after auto-save is just as ambiguous as before a save —
  // could mean "remove this" or "let me correct something" — so it gets
  // the same "ask, don't guess" treatment via awaiting_edit_or_undo.
  if (state === "idle" && recentlySaved && msg.type === "text" && text && isBareNegative(text)) {
    await sendTextMessage(msg.from, "No problem — should I remove this log, or do you want to correct something?");
    await setConvState("awaiting_edit_or_undo", pendingMeal);
    return;
  }

  // "Yes" (or similar) after the meal is already auto-saved has nothing
  // left to confirm — treat it as a no-op acknowledgment rather than
  // sending it to the LLM as if it were a food correction.
  if (state === "idle" && recentlySaved && msg.type === "text" && text && isAffirmative(text)) {
    await sendTextMessage(msg.from, "Already logged — no changes needed.");
    await setConvState("idle", pendingMeal);
    return;
  }

  if (state === "idle" && recentlySaved && msg.type === "text" && text && !isGreeting(text)) {
    try {
      await runFreeTextCorrection(text, pendingMeal, { inheritPhoto: false });
    } catch {
      await sendTextMessage(msg.from, isAdults ? "I couldn't update that — could you rephrase?" : "Couldn't update that — could you rephrase?");
      await setConvState("idle", pendingMeal);
    }
    return;
  }

  if (state === "idle" || state === "awaiting_correction") {
    const isCorrecting = state === "awaiting_correction";
    try {
      let analysis: FoodAnalysisResult;

      if (msg.type === "image" && mediaBuffer) {
        // A message in this branch always carries a real mediaBuffer, so it
        // must be uploaded — there's no cheap way to tell "resent the same
        // photo" apart from "sent a new one" without hashing, and assuming
        // the former (as a prior version of this code did, to skip
        // re-uploading during corrections) silently discarded genuinely new
        // correction photos: the new image was still analyzed by Gemini
        // (so the estimate looked right) but never saved, leaving the old
        // pendingMeal.image_url in place. Run the upload in parallel with
        // the Gemini analysis rather than after it: the two are
        // independent, and waiting for them sequentially was adding the
        // upload's full round-trip on top of the AI call's latency on
        // every single photo message.
        const [analysisResult, imageUrl] = await Promise.all([
          analyzeFood({
            imageBuffer: mediaBuffer,
            imageMimeType: msg.mediaMimeType,
            correctionContext: isCorrecting ? JSON.stringify(pendingMeal?.foods) : undefined,
            text: msg.text,
          }),
          uploadMealPhoto(db, entityId, mediaBuffer, msg.mediaMimeType),
        ]);
        analysis = analysisResult;
        analysis.image_url = imageUrl;
      } else if (msg.type === "text" && msg.text) {
        analysis = await analyzeFood({
          text: msg.text,
          correctionContext: isCorrecting ? JSON.stringify(pendingMeal?.foods) : undefined,
        });
        // A text correction to a meal originally logged from a photo should
        // keep showing that photo rather than losing it — but a fresh
        // text-only meal (state idle, not actually correcting) must not
        // inherit the previous meal's photo. Mirrors the isCorrecting gate
        // on the image branch above.
        analysis.image_url = isCorrecting ? pendingMeal?.image_url : undefined;
      } else {
        const hint = isAdults
          ? "You can send me a photo of your plate or describe what you had 😊"
          : "Just send me a photo or describe what you ate and I'll log it! 🍽️";
        await sendTextMessage(msg.from, hint);
        await setConvState(state, pendingMeal); // release lock, unchanged
        return;
      }

      // Contradiction check: a correction that flips to a clearly different
      // drink category than the previous guess gets one clarifying question
      // instead of being silently accepted.
      if (isCorrecting && pendingMeal && msg.type === "text" && msg.text) {
        const conflictBase = isConflictingDrinkCorrection(pendingMeal.meal_type, msg.text);
        if (conflictBase) {
          await sendTextMessage(msg.from, buildContradictionCheckMessage(formatMealLabel(conflictBase).toLowerCase(), analysis.meal_type));
          await setConvState("awaiting_correction_confirmation", toPendingMeal(analysis, "awaiting_correction_confirmation"));
          return;
        }
      }

      // Never let a photo/description that came back uncertain and 0/0 go
      // straight to "reply Yes to save" — ask a clarifying question instead.
      if (isZeroMacro(analysis) && !analysis.is_zero_calorie_item) {
        await sendTextMessage(msg.from, buildClarificationMessage(seed));
        await setConvState("awaiting_clarification", toPendingMeal(analysis, "awaiting_clarification"));
        return;
      }

      if (isCorrecting && pendingMeal && msg.type === "text" && msg.text) {
        await recordPortionCorrectionFeedback(pendingMeal, analysis, msg.text, pendingMeal.status === "saved" ? pendingMeal.savedMealId : undefined);
      }

      // Confidence-based auto-save: high/medium confidence with no
      // blocking ambiguity saves (or updates, if this was a correction to
      // an already-saved meal) immediately — "Reply Yes to save" is no
      // longer the default. Low confidence or a high-impact food-identity
      // ambiguity (tofu vs paneer vs chicken, 1 egg vs 3, ...) pauses for
      // one targeted question instead.
      await finalizeEstimate(analysis, { existing: isCorrecting ? (pendingMeal ?? undefined) : undefined });
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

  if (state === "awaiting_clarification") {
    // Any reply here is treated as the answer to the clarification
    // question (whether that was a generic "what is this?" or a targeted
    // high-impact-ambiguity question) — resolving it should log the meal
    // immediately (via finalizeEstimate inside runFreeTextCorrection), not
    // ask for a further "Yes."
    if (msg.type === "text" && msg.text) {
      try {
        await runFreeTextCorrection(msg.text, pendingMeal, { isClarificationResolution: true });
      } catch {
        await sendTextMessage(msg.from, buildClarificationMessage(seed));
        await setConvState("awaiting_clarification", pendingMeal);
      }
      return;
    }
    await sendTextMessage(msg.from, buildClarificationMessage(seed));
    await setConvState("awaiting_clarification", pendingMeal);
    return;
  }

  if (state === "awaiting_correction_confirmation") {
    if (isAffirmative(text) && pendingMeal) {
      const resolvedLabel = resolveMealLabel(pendingMeal.meal_type, new Date(), contactTimezone);
      const savedMealId = await saveMeal(pendingMeal, resolvedLabel);
      const dailyTotals = await getDailyTotals();
      const successMsg = buildSavedMessage(pendingMeal, resolvedLabel, {
        seed,
        dailyTotals: dailyTotals ? { ...dailyTotals, targetProteinG: targetProtein } : null,
      });
      await sendTextMessage(msg.from, successMsg + (END_USER_DASHBOARD_ENABLED ? MY_PROGRESS_CTA : ""));
      await setConvState("idle", savedMealId ? toPendingMeal({ ...pendingMeal, savedMealId } as any, "saved") : null);
      return;
    }
    if (msg.type === "text" && msg.text) {
      // User gave the real answer instead of confirming — treat as a fresh
      // correction, which (via finalizeEstimate) logs it immediately.
      try {
        await runFreeTextCorrection(msg.text, pendingMeal);
      } catch {
        await sendTextMessage(msg.from, "What should I log this as?");
        await setConvState("awaiting_correction_confirmation", pendingMeal);
      }
      return;
    }
    await sendTextMessage(msg.from, "Reply *Yes* to save, or tell me the correct item.");
    await setConvState("awaiting_correction_confirmation", pendingMeal);
    return;
  }

  // Reached when a bare "no" after an auto-saved meal was ambiguous about
  // whether the user meant to remove the log or correct something.
  // Explicit undo/discard wording is already handled by the isUndoIntent
  // check above (idle+recentlySaved), which runs before conversation state
  // even changes to this one — but a second bare "no" or "undo" typed here
  // still needs handling, since this state can be re-entered via its own
  // fallback below.
  if (state === "awaiting_edit_or_undo") {
    if (msg.type === "text" && text && isUndoIntent(text)) {
      if (pendingMeal?.savedMealId) {
        await deleteMeal(pendingMeal.savedMealId);
      }
      await sendTextMessage(msg.from, pickUndoAck(seed));
      await setConvState("idle", null);
      return;
    }

    if (msg.type === "text" && msg.text && msg.text.trim().length > 0) {
      try {
        await runFreeTextCorrection(msg.text, pendingMeal);
      } catch {
        await sendTextMessage(msg.from, "Please say Undo to remove this log, or tell me what to correct.");
        await setConvState("awaiting_edit_or_undo", pendingMeal); // release lock, unchanged
      }
      return;
    }

    await sendTextMessage(msg.from, "Please say Undo to remove this log, or tell me what to correct.");
    await setConvState("awaiting_edit_or_undo", pendingMeal); // release lock, unchanged
    return;
  }

  // Reached when a bare "no" (see BARE_NEGATIVE_PATTERNS) was ambiguous
  // about whether the user meant to discard the pending meal or correct
  // it — the bot asked which, and this is that follow-up reply. Explicit
  // discard is already handled by the shared isCancel() check above (this
  // state is in its applicable-states list), so only confirm/correction/
  // fallback need handling here.
  if (state === "awaiting_skip_or_correction") {
    if (isAffirmative(text)) {
      if (pendingMeal) {
        const resolvedLabel = resolveMealLabel(pendingMeal.meal_type, new Date(), contactTimezone);
        const savedMealId = await saveMeal(pendingMeal, resolvedLabel);
        const dailyTotals = await getDailyTotals();
        const successMsg = buildSavedMessage(pendingMeal, resolvedLabel, {
          seed,
          dailyTotals: dailyTotals ? { ...dailyTotals, targetProteinG: targetProtein } : null,
        });
        await sendTextMessage(msg.from, successMsg + (END_USER_DASHBOARD_ENABLED ? MY_PROGRESS_CTA : ""));
        await setConvState("idle", savedMealId ? { ...toPendingMeal(pendingMeal, "saved"), savedMealId } : null);
      } else {
        await sendTextMessage(msg.from, "There's nothing pending to save right now. Send a photo, or tell me what you'd like to log.");
        await setConvState("idle", null);
      }
      return;
    }

    if (msg.type === "text" && msg.text && msg.text.trim().length > 0) {
      try {
        await runFreeTextCorrection(msg.text, pendingMeal);
      } catch {
        await sendTextMessage(msg.from, "Please reply *Skip* to discard, or tell me what to correct.");
        await setConvState("awaiting_skip_or_correction", pendingMeal); // release lock, unchanged
      }
      return;
    }

    await sendTextMessage(msg.from, "Please reply *Skip* to discard, or tell me what to correct.");
    await setConvState("awaiting_skip_or_correction", pendingMeal); // release lock, unchanged
    return;
  }

  if (state === "awaiting_confirmation") {
    const intent = classifyPendingReply(text);

    if (intent === "confirm") {
      if (pendingMeal) {
        const resolvedLabel = resolveMealLabel(pendingMeal.meal_type, new Date(), contactTimezone);
        const savedMealId = await saveMeal(pendingMeal, resolvedLabel);
        const dailyTotals = await getDailyTotals();
        const successMsg = buildSavedMessage(pendingMeal, resolvedLabel, {
          seed,
          dailyTotals: dailyTotals ? { ...dailyTotals, targetProteinG: targetProtein } : null,
        });
        await sendTextMessage(msg.from, successMsg + (END_USER_DASHBOARD_ENABLED ? MY_PROGRESS_CTA : ""));
        await setConvState("idle", savedMealId ? { ...toPendingMeal(pendingMeal, "saved"), savedMealId } : null);
      } else {
        // "Yes" with nothing pending — this session's saved meal (if any and
        // recent) already reflects a prior confirmation; don't create a
        // duplicate. Ask what they want to do instead of guessing.
        await sendTextMessage(msg.from, "There's nothing pending to save right now. Send a photo, or tell me what you'd like to log.");
        await setConvState("idle", null);
      }
      return;
    }

    // A bare "no" — genuinely ambiguous. Don't guess whether the user
    // wants to discard or correct; ask which, and park the pending meal
    // untouched until they clarify.
    if (intent === "ambiguous_negative") {
      await sendTextMessage(
        msg.from,
        "No problem — should I skip this meal, or do you want to correct the food or portion?"
      );
      await setConvState("awaiting_skip_or_correction", pendingMeal);
      return;
    }

    // A short, unambiguous "I want to correct something" signal without
    // specifics yet ("wrong", "change") — ask what, rather than sending
    // that single word to the LLM as if it described food.
    if (intent === "vague_correction") {
      const ask = isAdults ? "Of course! What should I change? 😊" : "What should I change? Just tell me what was different 😊";
      await sendTextMessage(msg.from, ask);
      await setConvState("awaiting_correction", pendingMeal);
      return;
    }

    if (intent === "correction" && msg.text) {
      try {
        await runFreeTextCorrection(msg.text, pendingMeal);
      } catch {
        const ask = isAdults ? "What should I change? 😊" : "What should I change? Just tell me what was different 😊";
        await sendTextMessage(msg.from, ask);
        await setConvState("awaiting_confirmation", pendingMeal); // release lock, unchanged
      }
      return;
    }

    const repeat = isAdults
      ? "Reply *Yes* to save this meal, tell me what to correct, or reply *Skip* to discard 🙏"
      : "Reply *Yes* to log this meal, tell me what to change, or reply *Skip* to discard 😊";
    await sendTextMessage(msg.from, repeat);
    await setConvState("awaiting_confirmation", pendingMeal); // release lock, unchanged
    return;
  }
}
