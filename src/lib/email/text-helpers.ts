// Shared by every hand-rolled transactional email in src/lib/**/*-email.ts
// (feedback, trial-reminder, welcome) — see any of those for the Resend
// HTTP-API send pattern these helpers support.

/** Strips characters that have no legitimate place in a plain-text value
 * used to build an email (line breaks, in particular) — defense in depth
 * against header/content injection even though we're going through
 * Resend's JSON API (not raw SMTP), where classic CRLF header injection
 * isn't directly exploitable the same way a raw sendmail() call would be. */
export function sanitizeLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
