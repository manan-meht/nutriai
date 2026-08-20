// Mirrors src/lib/feedback/analytics.ts's stub pattern exactly — this repo
// has no analytics backend (PostHog/Segment/etc) wired up anywhere yet, so
// this is a console.debug placeholder that's trivial to swap for a real
// call later without touching any call site. Only non-sensitive
// categorisation properties are ever passed: skill slugs and counts, never
// identity.
export type ClubAnalyticsEvent =
  | "homepage_viewed"
  | "skill_selected"
  | "first_coach_preview_seen"
  | "coach_feed_started"
  | "list_view_clicked";

export function trackClubEvent(event: ClubAnalyticsEvent, properties?: Record<string, unknown>): void {
  console.debug("[club-analytics]", event, properties);
}
