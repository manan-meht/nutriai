export type FeedbackType =
  | "general"
  | "feature_request"
  | "bug"
  | "ai_inaccurate"
  | "billing"
  | "other";

export const FEEDBACK_TYPE_OPTIONS: Array<{ value: FeedbackType; label: string }> = [
  { value: "general", label: "General feedback" },
  { value: "feature_request", label: "Feature request" },
  { value: "bug", label: "Something is not working" },
  { value: "ai_inaccurate", label: "AI or meal analysis was inaccurate" },
  { value: "billing", label: "Billing or account issue" },
  { value: "other", label: "Other" },
];

export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = Object.fromEntries(
  FEEDBACK_TYPE_OPTIONS.map((o) => [o.value, o.label])
) as Record<FeedbackType, string>;

export const FEEDBACK_MESSAGE_MIN_LENGTH = 10;
export const FEEDBACK_MESSAGE_MAX_LENGTH = 2000;

export type FeedbackSource = "dashboard" | "website";
export type FeedbackAccountType = "family" | "coach" | "self";

export interface FeedbackSubmitRequest {
  feedbackType: FeedbackType;
  message: string;
  /** Only used for unauthenticated (website) submissions — logged-in users'
   * email is always derived server-side from their session, never trusted
   * from the client. */
  email?: string;
  source: FeedbackSource;
  pageUrl?: string;
  /** Honeypot field — real users never see or fill this (hidden via CSS,
   * not `type="hidden"`, so form-filling bots that only skip hidden inputs
   * still get caught). Any non-empty value here means the submission is
   * silently dropped. */
  website?: string;
  /** Client-side timestamp (ms epoch) of when the form first rendered —
   * combined with the honeypot, a submission arriving implausibly fast
   * after render is a soft signal of automated submission. */
  renderedAt?: number;
}

export interface FeedbackSubmitResponse {
  ok: true;
}

export interface FeedbackSubmitError {
  error: string;
}
