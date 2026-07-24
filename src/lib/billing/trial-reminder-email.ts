// Mirrors src/lib/feedback/send-feedback-email.ts's Resend HTTP API pattern
// (plain fetch, no SDK) — see that file's own comment for why.

import { sanitizeLine, escapeHtml } from "@/lib/email/text-helpers";

export interface TrialReminderEmailPayload {
  to: string;
  ownerName?: string;
  module: "adults" | "gym";
  trialEndAt: Date;
  billingPortalUrl: string;
}

const MODULE_LABEL: Record<TrialReminderEmailPayload["module"], string> = {
  adults: "Family",
  gym: "Coaching",
};

/** Sent a few days before a card-backed trial ends (see the cron at
 * src/app/api/cron/send-trial-reminders/route.ts) — gives the owner a
 * chance to cancel before their card is automatically charged. Never sent
 * for the legacy card-free trial path (no card on file, nothing would be
 * charged), only for entitlements created via the "add card before first
 * trial" checkout flow. */
export async function sendTrialReminderEmail(payload: TrialReminderEmailPayload): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FEEDBACK_FROM_EMAIL || "Tistra Health <billing@tistrahealth.com>";

  if (!apiKey) {
    return { ok: false, error: "Trial reminder email is not configured (missing RESEND_API_KEY)." };
  }

  const moduleLabel = MODULE_LABEL[payload.module];
  const dateLabel = payload.trialEndAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const greeting = payload.ownerName ? sanitizeLine(payload.ownerName.split(" ")[0]) : "there";
  const subject = sanitizeLine(`Your Tistra Health ${moduleLabel} trial ends ${dateLabel}`);

  const text = [
    `Hi ${greeting},`,
    "",
    `Your free 14-day Tistra Health ${moduleLabel} trial ends on ${dateLabel}. After that, the card on file will be charged automatically to continue your subscription.`,
    "",
    `If you'd like to cancel before then, you can do so anytime from your billing settings:`,
    payload.billingPortalUrl,
    "",
    "If you're happy to continue, there's nothing you need to do.",
  ].join("\n");

  const html = `
    <p style="font-family:system-ui,sans-serif;font-size:14px">Hi ${escapeHtml(greeting)},</p>
    <p style="font-family:system-ui,sans-serif;font-size:14px">
      Your free 14-day Tistra Health ${escapeHtml(moduleLabel)} trial ends on <strong>${escapeHtml(dateLabel)}</strong>.
      After that, the card on file will be charged automatically to continue your subscription.
    </p>
    <p style="font-family:system-ui,sans-serif;font-size:14px">
      If you'd like to cancel before then, you can do so anytime from your
      <a href="${payload.billingPortalUrl}">billing settings</a>.
    </p>
    <p style="font-family:system-ui,sans-serif;font-size:14px;color:#666">If you're happy to continue, there's nothing you need to do.</p>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [payload.to],
      subject,
      text,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[trial-reminder] Resend send failed:", res.status, body.slice(0, 300));
    return { ok: false, error: "Failed to send trial reminder email." };
  }

  return { ok: true };
}
