export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendTextMessage, sendTemplateMessage, normalizePhone } from "@/lib/whatsapp/client";
import { isReminderDue, getLocalDateAndTime } from "@/lib/reminders/schedule";
import { buildReminderMessage, reminderDisplayName } from "@/lib/reminders/messages";
import { pickWeeklyWhatsAppWin, buildWeeklyWinsWhatsAppLine } from "@/lib/share-cards/weekly-summary";
import { getProductDomain } from "@/lib/product/resolve-product";
import type { ShareCardMealInput } from "@/lib/share-cards/triggers";

// Deliberately not imported from @/lib/ai/food-analyzer — that module pulls
// in the whole @google/generative-ai SDK at module scope (needed for real
// photo analysis), which would meaningfully bloat this route's Worker
// bundle for two trivial helpers this route doesn't otherwise need. See
// food-analyzer.ts's own resolveMealLabel/formatMealLabel for the
// canonical versions this mirrors.
type MealTypeLabel = "breakfast" | "lunch" | "dinner" | "snack" | "drink" | "tea" | "coffee" | "wine" | "juice" | "other";
const DRINK_TYPES = new Set<MealTypeLabel>(["drink", "tea", "coffee", "wine", "juice"]);

function defaultMealTypeByTime(date: Date, timezone?: string): MealTypeLabel {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: timezone || "Asia/Kolkata" }).format(date)
  );
  if (hour >= 5 && hour < 10.5) return "breakfast";
  if (hour >= 10.5 && hour < 15.5) return "lunch";
  if (hour >= 15.5 && hour < 18.5) return "snack";
  if (hour >= 18.5 && hour < 22.5) return "dinner";
  return "snack";
}

function resolveStaleMealLabel(mealType: MealTypeLabel, now: Date, timezone?: string): MealTypeLabel {
  if (DRINK_TYPES.has(mealType)) return mealType;
  return defaultMealTypeByTime(now, timezone);
}

function formatStaleMealLabel(mealType: MealTypeLabel): string {
  if (mealType === "other") return "meal";
  return mealType.charAt(0).toUpperCase() + mealType.slice(1);
}

// A reminder is, by definition, a business-initiated message to someone who
// likely HASN'T messaged recently — so it will usually fall outside
// WhatsApp's 24-hour free-form-reply window and get silently rejected by
// the Graph API (same constraint documented at length in src/lib/invites).
// Mirrors the WHATSAPP_INVITE_TEMPLATE_NAME fallback pattern in
// sendContactInvite (adults dashboard actions.ts): prefer an approved
// template once one exists, fall back to free-form (works only within the
// 24h window) until then.
async function sendReminder(to: string, displayName: string, reminderTime: string): Promise<void> {
  const templateName = process.env.WHATSAPP_REMINDER_TEMPLATE_NAME;
  if (templateName) {
    await sendTemplateMessage(to, templateName, process.env.WHATSAPP_REMINDER_TEMPLATE_LANGUAGE ?? "en", [displayName]);
  } else {
    await sendTextMessage(to, buildReminderMessage(displayName, reminderTime));
  }
}

// Cloudflare Pages has no built-in Cron Triggers (those are Workers-only) —
// this endpoint is meant to be pinged periodically (every ~15 min
// recommended) by an external scheduler or a small companion Worker, and is
// protected by a shared secret since it triggers real WhatsApp sends.
// Idempotency is enforced at the DB level (meal_reminder_sends' unique
// index), not just by the isReminderDue time-window check, so being pinged
// more often than necessary is safe — it just does less work, never sends
// duplicates.
interface ReminderTarget {
  id: string;
  contactType: "adults" | "gym";
  fullName: string;
  whatsappNumber: string | null;
  timezone: string;
  remindersEnabled: boolean;
  reminderTimes: string[];
  /** adults-only — gym_clients has no relationship/age/gender fields, so
   * these stay undefined there and reminderDisplayName() falls back to
   * first name (the Uncle/Aunty convention doesn't apply to gym clients). */
  relationship?: string | null;
  age?: number | null;
  gender?: string | null;
}

async function fetchTargets(db: ReturnType<typeof createServiceClient>): Promise<ReminderTarget[]> {
  const [{ data: adults }, { data: gym }] = await Promise.all([
    db
      .from("adults_contacts")
      .select("id, full_name, whatsapp_number, timezone, reminders_enabled, reminder_times, relationship, age, gender")
      .eq("reminders_enabled", true)
      .is("deleted_at", null),
    db
      .from("gym_clients")
      .select("id, full_name, whatsapp_number, timezone, reminders_enabled, reminder_times")
      .eq("reminders_enabled", true)
      .is("deleted_at", null),
  ]);

  const map = (rows: any[] | null, contactType: "adults" | "gym"): ReminderTarget[] =>
    (rows ?? []).map((r) => ({
      id: r.id,
      contactType,
      fullName: r.full_name,
      whatsappNumber: r.whatsapp_number,
      timezone: r.timezone ?? "Asia/Kolkata",
      remindersEnabled: r.reminders_enabled,
      reminderTimes: Array.isArray(r.reminder_times) ? r.reminder_times : [],
      relationship: r.relationship,
      age: r.age,
      gender: r.gender,
    }));

  return [...map(adults, "adults"), ...map(gym, "gym")];
}

async function runMealReminders(db: ReturnType<typeof createServiceClient>) {
  const now = new Date();
  const targets = await fetchTargets(db);

  let sent = 0;
  let skipped = 0;

  for (const target of targets) {
    if (!target.whatsappNumber) continue;

    for (const reminderTime of target.reminderTimes) {
      if (!isReminderDue(now, target.timezone, reminderTime)) continue;

      const { date: localDate } = getLocalDateAndTime(now, target.timezone);

      // Insert-then-send: if this fails (already logged, by another
      // overlapping run or a prior tick), skip sending entirely — this
      // ordering is what actually prevents a duplicate WhatsApp message,
      // not the isReminderDue time-window check above.
      const { error: logError } = await db.from("meal_reminder_sends").insert({
        contact_id: target.id,
        contact_type: target.contactType,
        local_date: localDate,
        reminder_time: reminderTime,
      });

      if (logError) {
        skipped++;
        continue;
      }

      try {
        const displayName = reminderDisplayName({
          fullName: target.fullName,
          relationship: target.relationship,
          age: target.age,
          gender: target.gender,
          normalizedWhatsappNumber: normalizePhone(target.whatsappNumber),
        });
        await sendReminder(target.whatsappNumber, displayName, reminderTime);
        sent++;
      } catch (err) {
        console.error("[reminders] send failed:", target.contactType, target.id, err instanceof Error ? err.message : err);
      }
    }
  }

  return { checked: targets.length, sent, skipped };
}

// If a clarification question (e.g. "is this an omelette, a dosa, or a
// pancake?") goes unanswered for 10+ minutes, the meal previously just sat
// in whatsapp_conversations.pending_meal forever, never logged — and the
// conversation lock could get stuck at state: "processing" if a later
// message hit it (see conversation-handler.ts's saveBestGuessForClarification
// for the "a new photo arrives before the old question is answered" case,
// handled inline there since it has the full message-handling closures
// available). This handles the other case: nobody replied at all.
//
// Folded into this same route (rather than its own
// /api/cron/resolve-stale-clarifications file) purely for Worker bundle
// size — see this file's git history: a standalone route here previously
// pushed the Worker over Cloudflare Pages' 25 MiB bundle limit and failed
// a deploy. Both tasks are cron-triggered, share the same CRON_SECRET
// check, and are idempotent, so sharing one route/one ping is safe.
const STALE_CLARIFICATION_MS = 10 * 60 * 1000;

async function runResolveStaleClarifications(db: ReturnType<typeof createServiceClient>) {
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

    let timezone: string | undefined;
    if (isAdults) {
      const { data: contact } = await db.from("adults_contacts").select("timezone").eq("id", entityId).maybeSingle();
      timezone = contact?.timezone;
    }

    const resolvedLabel = resolveStaleMealLabel(pending.meal_type, new Date(), timezone);

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
          `Since I didn't hear back, I've saved your ${formatStaleMealLabel(resolvedLabel).toLowerCase()} using my best guess: ${pending.summary}.`
        );
      }
    } catch (err) {
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

  return { checked: (stale ?? []).length, resolved, skipped };
}

// Weekly WhatsApp share-card mention (see this feature's spec: "You
// earned a share card this week: ..."). Folded into this same cron route
// rather than a new one — same Worker bundle-size reasoning as
// runResolveStaleClarifications above, and this route is already pinged
// periodically and already loops every contact/client. Gated to at most
// once every 6 days per contact via last_weekly_wins_sent_at (migration
// 0033) so a route pinged every ~15 min doesn't resend constantly.
//
// Deliberately does NOT compute the full Food Balance Score here (that
// would require importing @nutriai/health-scoring's calculateFoodBalanceScore,
// meaningfully growing this route's bundle) — only picks from the
// meal-count-based concepts (streaks, comeback, etc.), same trade-off as
// src/lib/share-cards/weekly-summary.ts documents. TODO: once this cron
// (or a real weekly-digest job) already computes the Food Balance Score
// for another reason, wire componentScores through so balanced/protein/
// fiber-all-week and the improvement cards can be featured here too.
const WEEKLY_WINS_MIN_GAP_MS = 6 * 24 * 60 * 60 * 1000;

interface WeeklyWinsTarget {
  id: string;
  contactType: "adults" | "gym";
  whatsappNumber: string | null;
  lastWeeklyWinsSentAt: string | null;
}

async function fetchWeeklyWinsTargets(db: ReturnType<typeof createServiceClient>): Promise<WeeklyWinsTarget[]> {
  const [{ data: adults }, { data: gym }] = await Promise.all([
    db.from("adults_contacts").select("id, whatsapp_number, last_weekly_wins_sent_at").is("deleted_at", null),
    db.from("gym_clients").select("id, whatsapp_number, last_weekly_wins_sent_at").is("deleted_at", null),
  ]);

  const map = (rows: any[] | null, contactType: "adults" | "gym"): WeeklyWinsTarget[] =>
    (rows ?? []).map((r) => ({
      id: r.id,
      contactType,
      whatsappNumber: r.whatsapp_number,
      lastWeeklyWinsSentAt: r.last_weekly_wins_sent_at,
    }));

  return [...map(adults, "adults"), ...map(gym, "gym")];
}

async function runWeeklyWinsShareCards(db: ReturnType<typeof createServiceClient>) {
  const now = new Date();
  const targets = await fetchWeeklyWinsTargets(db);

  let sent = 0;
  let skipped = 0;

  for (const target of targets) {
    if (!target.whatsappNumber) continue;
    if (target.lastWeeklyWinsSentAt && now.getTime() - new Date(target.lastWeeklyWinsSentAt).getTime() < WEEKLY_WINS_MIN_GAP_MS) {
      continue;
    }

    try {
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const { data: meals } = await db
        .from("meal_logs")
        .select("logged_at, meal_type, total_protein_min, total_protein_max, total_fiber_min, total_fiber_max")
        .eq(target.contactType === "adults" ? "adults_contact_id" : "client_id", target.id)
        .gte("logged_at", fourteenDaysAgo.toISOString());

      const mealInputs: ShareCardMealInput[] = (meals ?? []).map((m: any) => ({
        loggedAt: m.logged_at,
        mealType: m.meal_type,
        totalProteinMin: m.total_protein_min ?? 0,
        totalProteinMax: m.total_protein_max ?? 0,
        totalFiberMin: m.total_fiber_min ?? 0,
        totalFiberMax: m.total_fiber_max ?? 0,
      }));
      const distinctLoggingDaysThisWeek = new Set(
        mealInputs
          .filter((m) => (now.getTime() - new Date(m.loggedAt).getTime()) / 86400000 <= 7)
          .map((m) => m.loggedAt.slice(0, 10))
      ).size;

      const card = pickWeeklyWhatsAppWin(mealInputs, distinctLoggingDaysThisWeek, now);
      if (!card) {
        skipped++;
        continue;
      }

      const domain = getProductDomain(target.contactType === "adults" ? "adults" : "gym");
      await sendTextMessage(target.whatsappNumber, buildWeeklyWinsWhatsAppLine(card, `https://${domain}/my-progress`));

      await db
        .from(target.contactType === "adults" ? "adults_contacts" : "gym_clients")
        .update({ last_weekly_wins_sent_at: now.toISOString() })
        .eq("id", target.id);
      sent++;
    } catch (err) {
      console.error("[weekly-wins] send failed:", target.contactType, target.id, err instanceof Error ? err.message : err);
      skipped++;
    }
  }

  return { checked: targets.length, sent, skipped };
}

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const db = createServiceClient();
  const [reminders, staleClarifications, weeklyWins] = await Promise.all([
    runMealReminders(db),
    runResolveStaleClarifications(db),
    runWeeklyWinsShareCards(db),
  ]);

  return NextResponse.json({ reminders, staleClarifications, weeklyWins });
}
