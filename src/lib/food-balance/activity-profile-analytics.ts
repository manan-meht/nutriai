// No analytics provider (PostHog/Segment/etc) is wired up anywhere in this
// codebase yet — mirrors the same console.debug stub pattern already used
// by src/lib/invites/analytics.ts's trackInviteEvent. Swap the body for a
// real call once a provider exists; call sites shouldn't need to change.
//
// Event names and enum values only — never a person's name or any other
// free-text/health information (see the "Do not include a person's name
// or unnecessary health information" requirement this was built for).
export type ActivityProfileAnalyticsEvent =
  | "activity_profile_daily_movement_answered"
  | "activity_profile_weekly_activity_answered"
  | "activity_profile_strength_frequency_answered"
  | "activity_profile_question_abandoned"
  | "activity_profile_saved";

export interface ActivityProfileAnalyticsProperties {
  /** Which product/surface this happened on — never which specific person. */
  module: "adults" | "gym";
  dailyMovementLevel?: DailyMovementLevelValue;
  weeklyModerateActivity?: WeeklyModerateActivityValue;
  strengthExerciseFrequency?: StrengthExerciseFrequencyValue;
  derivedActivityLevel?: DerivedActivityLevelValue;
  /** Which question was on-screen when a form was abandoned (for
   * activity_profile_question_abandoned only). */
  question?: "daily_movement" | "weekly_activity" | "strength_frequency";
}

// Loosely-typed string unions rather than importing @nutriai/health-scoring's
// literal types here — this module is imported from both server actions and
// (indirectly, via re-export) client components, and keeping it dependency-free
// avoids any risk of pulling the scoring package's other exports into a
// client bundle for what's only ever a few analytics strings.
type DailyMovementLevelValue = string;
type WeeklyModerateActivityValue = string;
type StrengthExerciseFrequencyValue = string;
type DerivedActivityLevelValue = string;

export function trackActivityProfileEvent(event: ActivityProfileAnalyticsEvent, properties?: ActivityProfileAnalyticsProperties): void {
  console.debug("[activity-profile-analytics]", event, properties);
}
