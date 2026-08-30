import { sanitizeLine, escapeHtml } from "@/lib/email/text-helpers";

/** Tells us a coach asked for help building their profile.
 *
 * Raised when someone who arrived via "Help me set it up" finishes signing
 * up — not when they click the link. A click carries no contact details, so
 * a request raised then would be an alert nobody can act on. The click is
 * already measured separately as the onboarding_help_click event; this is
 * for the ones that produce an address to reply to.
 *
 * Sent through Resend's HTTP API with plain fetch, matching
 * lib/feedback/send-feedback-email.ts — no SDK, both to keep the Worker
 * bundle down and because one JSON POST is all Resend needs.
 *
 * Never throws. This runs immediately after a successful signup, and a
 * failed notification must not make a coach think their signup failed —
 * the request is also visible on /admin/coaches as a "wants setup help"
 * badge, so a lost email is recoverable.
 */
export interface OnboardingHelpPayload {
  /** The coach's own address, from the signup they just completed. */
  email: string;
  /** "sg" or "in" — which landing page they came from. */
  market: string;
  /** Landing page source param, e.g. coach_landing or coach_landing_in. */
  source?: string;
  requestedAt: Date;
}

export async function sendOnboardingHelpRequest(
  payload: OnboardingHelpPayload
): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const recipient = process.env.COACH_ONBOARDING_HELP_EMAIL || "manan@tistra.sg";
  const from = process.env.FEEDBACK_FROM_EMAIL || "Tistra Coach <feedback@tistrahealth.com>";

  if (!apiKey) {
    return { ok: false, error: "Onboarding-help email is not configured (missing RESEND_API_KEY)." };
  }

  const marketLabel = payload.market === "in" ? "India" : "Singapore";
  const subject = sanitizeLine(`[Tistra Coach] Setup help requested — ${marketLabel}`);

  const rows: Array<[string, string]> = [
    ["Coach email", sanitizeLine(payload.email)],
    ["Market", marketLabel],
  ];
  if (payload.source) rows.push(["Came from", sanitizeLine(payload.source)]);
  rows.push(["Requested", payload.requestedAt.toISOString()]);

  const action =
    "They picked \"Help me set it up\" on the coach landing page, so they are expecting us to " +
    "get in touch and build the profile with them. Reply to this email to reach them directly.";

  const textLines = [...rows.map(([k, v]) => `${k}: ${v}`), "", action];
  const htmlRows = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap">${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`
    )
    .join("");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject,
        text: textLines.join("\n"),
        html: `<table style="font-family:system-ui,sans-serif;font-size:14px;border-collapse:collapse">${htmlRows}</table><p style="font-family:system-ui,sans-serif;font-size:14px;color:#333;margin-top:16px">${escapeHtml(action)}</p>`,
        // So replying goes to the coach rather than to us.
        reply_to: payload.email,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[coach-onboarding-help] Resend send failed:", res.status, body.slice(0, 300));
      return { ok: false, error: "Failed to send the onboarding-help request." };
    }
    return { ok: true };
  } catch (err) {
    console.error("[coach-onboarding-help] Resend request threw:", err instanceof Error ? err.message : err);
    return { ok: false, error: "Failed to send the onboarding-help request." };
  }
}
