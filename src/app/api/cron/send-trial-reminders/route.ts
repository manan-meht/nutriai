export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendTrialReminderEmail } from "@/lib/billing/trial-reminder-email";
import { stripeProvider } from "@/lib/billing/providers/stripe-provider";

// Cloudflare Pages has no built-in Cron Triggers — same as
// send-meal-reminders/route.ts, this endpoint is meant to be pinged
// periodically (once a day is enough; trial_reminder_sent_at makes repeat
// pings safe) by an external scheduler, and shares that route's
// CRON_SECRET.
//
// Only ever emails entitlements that went through the "add card before
// first trial" checkout flow (payment_provider "stripe" + a real
// provider_subscription_id on file) — the legacy card-free trial
// (startTrialIfNeeded with no checkout) also sets trial_end_at, but
// nothing would actually be charged there, so "your card will be charged
// automatically" would be actively wrong to send those users.
const REMINDER_WINDOW_DAYS = 3;

interface ReminderCandidate {
  workspaceId: string;
  module: "adults" | "gym";
  ownerId: string;
  providerCustomerId: string | null;
  trialEndAt: string;
}

async function fetchCandidates(db: ReturnType<typeof createServiceClient>): Promise<ReminderCandidate[]> {
  const now = new Date();
  const windowStart = now.toISOString();
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await db
    .from("entitlements")
    .select("workspace_id, module, owner_id, provider_customer_id, trial_end_at")
    .eq("status", "trialing")
    .eq("payment_provider", "stripe")
    .not("provider_subscription_id", "is", null)
    .is("trial_reminder_sent_at", null)
    .gte("trial_end_at", windowStart)
    .lte("trial_end_at", windowEnd);

  return (data ?? []).map((row: any) => ({
    workspaceId: row.workspace_id,
    module: row.module,
    ownerId: row.owner_id,
    providerCustomerId: row.provider_customer_id,
    trialEndAt: row.trial_end_at,
  }));
}

async function runTrialReminders(db: ReturnType<typeof createServiceClient>) {
  const candidates = await fetchCandidates(db);
  let sent = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    const { data: profile } = await db
      .from("profiles")
      .select("full_name, email")
      .eq("id", candidate.ownerId)
      .maybeSingle();

    if (!profile?.email) {
      skipped++;
      continue;
    }

    try {
      const billingPortalUrl = candidate.providerCustomerId
        ? (await stripeProvider.openBillingPortal({
            customerId: candidate.providerCustomerId,
            returnUrl: `https://${candidate.module === "adults" ? "tistrahealth.com/adults" : "tistrahealth.com/gym"}/dashboard`,
          })) ?? "https://tistrahealth.com/billing"
        : "https://tistrahealth.com/billing";

      const result = await sendTrialReminderEmail({
        to: profile.email,
        ownerName: profile.full_name ?? undefined,
        module: candidate.module,
        trialEndAt: new Date(candidate.trialEndAt),
        billingPortalUrl,
      });

      if (!result.ok) {
        skipped++;
        continue;
      }

      await db
        .from("entitlements")
        .update({ trial_reminder_sent_at: new Date().toISOString() })
        .eq("workspace_id", candidate.workspaceId)
        .eq("module", candidate.module);
      sent++;
    } catch (err) {
      console.error("[trial-reminders] send failed:", candidate.workspaceId, candidate.module, err instanceof Error ? err.message : err);
      skipped++;
    }
  }

  return { checked: candidates.length, sent, skipped };
}

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const db = createServiceClient();
  const result = await runTrialReminders(db);
  return NextResponse.json(result);
}
