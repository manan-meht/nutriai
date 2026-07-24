import { FEEDBACK_TYPE_LABELS, type FeedbackType, type FeedbackAccountType, type FeedbackSource } from "./types";
import { sanitizeLine, escapeHtml } from "@/lib/email/text-helpers";

export interface FeedbackEmailPayload {
  feedbackType: FeedbackType;
  message: string;
  email?: string;
  fullName?: string;
  userId?: string;
  accountType?: FeedbackAccountType;
  source: FeedbackSource;
  pageUrl?: string;
  userAgent?: string;
  submittedAt: Date;
}

const ACCOUNT_TYPE_LABELS: Record<FeedbackAccountType, string> = {
  family: "Family",
  coach: "Coach",
  self: "Self",
};

/** Sends the feedback notification email via Resend's HTTP API (plain
 * fetch — no SDK dependency, both to avoid growing the Cloudflare Worker
 * bundle further after already once hitting the 25MB platform limit, and
 * because a single JSON POST is all Resend's API actually requires). */
export async function sendFeedbackEmail(payload: FeedbackEmailPayload): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const recipient = process.env.FEEDBACK_RECIPIENT_EMAIL;
  const from = process.env.FEEDBACK_FROM_EMAIL || "Tistra Health Feedback <feedback@tistrahealth.com>";

  if (!apiKey || !recipient) {
    return { ok: false, error: "Feedback email is not configured (missing RESEND_API_KEY or FEEDBACK_RECIPIENT_EMAIL)." };
  }

  const typeLabel = FEEDBACK_TYPE_LABELS[payload.feedbackType];
  const subject = sanitizeLine(`[Tistra Health Feedback] ${typeLabel}`);

  const rows: Array<[string, string]> = [
    ["Category", typeLabel],
    ["Source", payload.source === "dashboard" ? "Dashboard" : "Website"],
  ];
  if (payload.accountType) rows.push(["Account type", ACCOUNT_TYPE_LABELS[payload.accountType]]);
  if (payload.fullName) rows.push(["Name", sanitizeLine(payload.fullName)]);
  if (payload.email) rows.push(["Email", sanitizeLine(payload.email)]);
  // Only logged-in submissions carry a userId — never shown to/collected
  // from public website visitors, and never a value the browser can spoof
  // (derived server-side from the session, see /api/feedback/route.ts).
  if (payload.userId) rows.push(["User ID", payload.userId]);
  if (payload.pageUrl) rows.push(["Page", sanitizeLine(payload.pageUrl)]);
  rows.push(["Submitted", payload.submittedAt.toISOString()]);
  if (payload.userAgent) rows.push(["User agent", sanitizeLine(payload.userAgent)]);

  const textLines = [
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    "Message:",
    payload.message,
  ];

  const htmlRows = rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap">${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`).join("");
  const html = `
    <table style="font-family:system-ui,sans-serif;font-size:14px;border-collapse:collapse">${htmlRows}</table>
    <p style="font-family:system-ui,sans-serif;font-size:14px;color:#666;margin-top:16px">Message:</p>
    <p style="font-family:system-ui,sans-serif;font-size:14px;white-space:pre-wrap">${escapeHtml(payload.message)}</p>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [recipient],
      subject,
      text: textLines.join("\n"),
      html,
      ...(payload.email ? { reply_to: payload.email } : {}),
    }),
  });

  if (!res.ok) {
    // Never log the feedback message/email itself — just enough to debug
    // a delivery failure (status + provider error body).
    const body = await res.text().catch(() => "");
    console.error("[feedback] Resend send failed:", res.status, body.slice(0, 300));
    return { ok: false, error: "Failed to send feedback email." };
  }

  return { ok: true };
}
