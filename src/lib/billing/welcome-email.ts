// Mirrors src/lib/feedback/send-feedback-email.ts's Resend HTTP API pattern
// (plain fetch, no SDK) — see that file's own comment for why.

import { sanitizeLine, escapeHtml } from "@/lib/email/text-helpers";

const SUPPORT_EMAIL = "tistrahealth@gmail.com";

export interface WelcomeEmailPayload {
  to: string;
  ownerName?: string;
  /** "self" and "family" both live under the "adults" entitlement module
   * (see workspaces.plan, migration 0010_self_plan_pricing.sql) — passed
   * separately from the entitlement module itself so a one-person self-plan
   * signup doesn't get told "Your Family trial has started". */
  plan: "self" | "family" | "coach";
  trialEndAt: Date;
  billingPortalUrl: string;
}

const TRIAL_STARTED_LINE: Record<WelcomeEmailPayload["plan"], string> = {
  self: "Your free 14-day trial to track your own meals has started.",
  family: "Your free 14-day Family trial has started.",
  coach: "Your free 14-day Coaching trial has started.",
};

/** Sent once, right after a card-backed trial actually starts (see
 * applyProviderSubscriptionSnapshot in src/lib/entitlements/entitlements.ts,
 * the single choke point both the Stripe webhook and syncCheckoutCompletion
 * funnel through) — never for the legacy card-free trial path, since that
 * flow has no card on file and nothing will ever be charged. Idempotency is
 * the caller's job (entitlements.welcome_email_sent_at), not this
 * function's — see that call site's own comment. */
export async function sendWelcomeEmail(payload: WelcomeEmailPayload): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FEEDBACK_FROM_EMAIL || "Tistra Health <billing@tistrahealth.com>";

  if (!apiKey) {
    return { ok: false, error: "Welcome email is not configured (missing RESEND_API_KEY)." };
  }

  const greeting = payload.ownerName ? sanitizeLine(payload.ownerName.split(" ")[0]) : "there";
  const dateLabel = payload.trialEndAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const trialStartedLine = TRIAL_STARTED_LINE[payload.plan];
  const subject = "Welcome to Tistra Health — your free trial has started";

  const text = [
    `Hi ${greeting},`,
    "",
    `Welcome to Tistra Health! ${trialStartedLine}`,
    "",
    `You won't be charged until your trial ends on ${dateLabel}. We'll email you a reminder 3 days before then, so if you decide not to continue, you'll have time to cancel before anything is charged.`,
    "",
    `You can view or cancel your subscription anytime from your billing settings:`,
    payload.billingPortalUrl,
    "",
    `Questions or need a hand getting started? Just reply to this email or reach us at ${SUPPORT_EMAIL} — we're happy to help.`,
  ].join("\n");

  const html = `
    <p style="font-family:system-ui,sans-serif;font-size:14px">Hi ${escapeHtml(greeting)},</p>
    <p style="font-family:system-ui,sans-serif;font-size:14px">
      Welcome to Tistra Health! ${escapeHtml(trialStartedLine)}
    </p>
    <p style="font-family:system-ui,sans-serif;font-size:14px">
      You won't be charged until your trial ends on <strong>${escapeHtml(dateLabel)}</strong>. We'll email you a
      reminder 3 days before then, so if you decide not to continue, you'll have time to cancel before anything
      is charged.
    </p>
    <p style="font-family:system-ui,sans-serif;font-size:14px">
      You can view or cancel your subscription anytime from your
      <a href="${payload.billingPortalUrl}">billing settings</a>.
    </p>
    <p style="font-family:system-ui,sans-serif;font-size:14px;color:#666">
      Questions or need a hand getting started? Just reply to this email or reach us at
      <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> — we're happy to help.
    </p>
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
      reply_to: SUPPORT_EMAIL,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[welcome-email] Resend send failed:", res.status, body.slice(0, 300));
    return { ok: false, error: "Failed to send welcome email." };
  }

  return { ok: true };
}
