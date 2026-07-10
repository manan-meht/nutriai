import { FEEDBACK_MESSAGE_MAX_LENGTH, FEEDBACK_MESSAGE_MIN_LENGTH, FEEDBACK_TYPE_OPTIONS, type FeedbackType } from "./types";

const VALID_FEEDBACK_TYPES = new Set(FEEDBACK_TYPE_OPTIONS.map((o) => o.value));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type FeedbackValidationResult = { ok: true } | { ok: false; error: string };

/** Pure, network-free validation shared by the API route (and unit tests
 * below) — deliberately has no Supabase/session dependency so it can be
 * tested directly without mocking the database. */
export function validateFeedbackSubmission(input: {
  feedbackType: unknown;
  message: unknown;
  email?: unknown;
  source: unknown;
}): FeedbackValidationResult {
  if (typeof input.feedbackType !== "string" || !VALID_FEEDBACK_TYPES.has(input.feedbackType as FeedbackType)) {
    return { ok: false, error: "Please choose a valid feedback type." };
  }

  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (message.length < FEEDBACK_MESSAGE_MIN_LENGTH || message.length > FEEDBACK_MESSAGE_MAX_LENGTH) {
    return { ok: false, error: `Message must be between ${FEEDBACK_MESSAGE_MIN_LENGTH} and ${FEEDBACK_MESSAGE_MAX_LENGTH} characters.` };
  }

  if (input.source !== "dashboard" && input.source !== "website") {
    return { ok: false, error: "Invalid request." };
  }

  if (typeof input.email === "string" && input.email.trim() && !EMAIL_RE.test(input.email.trim())) {
    return { ok: false, error: "Please enter a valid email address." };
  }

  return { ok: true };
}

/** A submission arriving implausibly fast after the form rendered is a
 * soft bot signal — real humans take at least a couple seconds to read
 * the form and type a message meeting the minimum length. */
export const MIN_FILL_TIME_MS = 1500;

export function isSuspiciouslyFast(renderedAt: unknown, now: number = Date.now()): boolean {
  return typeof renderedAt === "number" && now - renderedAt < MIN_FILL_TIME_MS;
}
