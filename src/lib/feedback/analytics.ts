// Mirrors src/lib/invites/analytics.ts's stub pattern exactly — this repo
// has no analytics backend (PostHog/Segment/etc) wired up anywhere yet, so
// this is a console.debug placeholder that's trivial to swap for a real
// call later without touching any call site. Never pass the feedback
// message or email — only non-sensitive categorization properties.
export type FeedbackAnalyticsEvent = "feedback_form_opened" | "feedback_submitted" | "feedback_submission_failed";

export function trackFeedbackEvent(event: FeedbackAnalyticsEvent, properties?: Record<string, unknown>): void {
  console.debug("[feedback-analytics]", event, properties);
}
