export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendTextMessage, sendTemplateMessage, normalizePhone } from "@/lib/whatsapp/client";
import { isReminderDue, getLocalDateAndTime } from "@/lib/reminders/schedule";
import { buildReminderMessage, reminderDisplayName } from "@/lib/reminders/messages";

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

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const db = createServiceClient();
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

  return NextResponse.json({ checked: targets.length, sent, skipped });
}
