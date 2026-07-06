// No analytics provider (PostHog/Segment/etc) is wired up anywhere in this
// codebase yet — mirrors the same console.debug stub pattern already used
// in src/lib/landing/routes.ts's `track()`, rather than introducing a new
// provider. Swap the body for a real call once one exists.
export type InviteAnalyticsEvent =
  | "invite_created"
  | "invite_link_opened"
  | "invite_copied"
  | "invite_claimed"
  | "invite_expired"
  | "invite_revoked"
  | "invite_regenerated";

export function trackInviteEvent(event: InviteAnalyticsEvent, properties?: Record<string, unknown>): void {
  console.debug("[invite-analytics]", event, properties);
}
