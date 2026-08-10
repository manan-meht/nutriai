// Mirrors the main web app's src/lib/feedback/{types,validate,
// send-feedback-email}.ts — duplicated here rather than shared, matching
// this app's existing pattern (see lib/food-balance-feedback.ts's own
// comment on why). Keep the pieces below in sync with their web
// counterparts; the feedback_submissions rows and notification emails they
// produce are read side by side.

export type FeedbackType =
  | "general"
  | "feature_request"
  | "bug"
  | "ai_inaccurate"
  | "billing"
  | "other";

export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  general: "General feedback",
  feature_request: "Feature request",
  bug: "Something is not working",
  ai_inaccurate: "AI or meal analysis was inaccurate",
  billing: "Billing or account issue",
  other: "Other",
};

export const FEEDBACK_MESSAGE_MIN_LENGTH = 10;
export const FEEDBACK_MESSAGE_MAX_LENGTH = 2000;

export type FeedbackAccountType = "family" | "coach" | "self";

const ACCOUNT_TYPE_LABELS: Record<FeedbackAccountType, string> = {
  family: "Family",
  coach: "Coach",
  self: "Self",
};

export type FeedbackValidationResult = { ok: true } | { ok: false; error: string };

/** Pure, network-free validation — the mobile equivalent of the web app's
 * validateFeedbackSubmission, minus the `email` field (a mobile submission
 * is always authenticated, so the address comes from the session and is
 * never accepted from the client) and minus `source` (always "mobile"
 * here, set server-side rather than trusted from the app). */
export function validateMobileFeedback(input: { feedbackType: unknown; message: unknown }): FeedbackValidationResult {
  if (typeof input.feedbackType !== "string" || !(input.feedbackType in FEEDBACK_TYPE_LABELS)) {
    return { ok: false, error: "Please choose a valid feedback type." };
  }
  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (message.length < FEEDBACK_MESSAGE_MIN_LENGTH || message.length > FEEDBACK_MESSAGE_MAX_LENGTH) {
    return {
      ok: false,
      error: `Message must be between ${FEEDBACK_MESSAGE_MIN_LENGTH} and ${FEEDBACK_MESSAGE_MAX_LENGTH} characters.`,
    };
  }
  return { ok: true };
}

function sanitizeLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface FeedbackEmailPayload {
  feedbackType: FeedbackType;
  message: string;
  email?: string;
  fullName?: string;
  userId?: string;
  accountType?: FeedbackAccountType;
  /** Free-form platform/version string from the app (e.g. "android 1.0.0
   * (34)"), shown in place of the web's user-agent row. */
  client?: string;
  submittedAt: Date;
}

/** Sends the feedback notification email via Resend's HTTP API (plain
 * fetch — no SDK dependency, to avoid growing this Worker's bundle). */
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
    ["Source", "Mobile app"],
  ];
  if (payload.accountType) rows.push(["Account type", ACCOUNT_TYPE_LABELS[payload.accountType]]);
  if (payload.fullName) rows.push(["Name", sanitizeLine(payload.fullName)]);
  if (payload.email) rows.push(["Email", sanitizeLine(payload.email)]);
  if (payload.userId) rows.push(["User ID", payload.userId]);
  if (payload.client) rows.push(["Client", sanitizeLine(payload.client)]);
  rows.push(["Submitted", payload.submittedAt.toISOString()]);

  const textLines = [...rows.map(([k, v]) => `${k}: ${v}`), "", "Message:", payload.message];

  const htmlRows = rows
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap">${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`)
    .join("");
  const html = `
    <table style="font-family:system-ui,sans-serif;font-size:14px;border-collapse:collapse">${htmlRows}</table>
    <p style="font-family:system-ui,sans-serif;font-size:14px;color:#666;margin-top:16px">Message:</p>
    <p style="font-family:system-ui,sans-serif;font-size:14px;white-space:pre-wrap">${escapeHtml(payload.message)}</p>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
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
    // Never log the feedback message/email itself — just enough to debug a
    // delivery failure (status + provider error body).
    const body = await res.text().catch(() => "");
    console.error("[feedback] Resend send failed:", res.status, body.slice(0, 300));
    return { ok: false, error: "Failed to send feedback email." };
  }

  return { ok: true };
}
