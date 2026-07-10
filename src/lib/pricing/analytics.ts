// Mirrors src/lib/feedback/analytics.ts's stub pattern exactly — this repo
// has no analytics backend (PostHog/Segment/etc) wired up anywhere yet, so
// this is a console.debug placeholder that's trivial to swap for a real
// call later without touching any call site. Never pass health data or
// other personally sensitive information — only plan/page categorization.
export type PricingAnalyticsEvent =
  | "pricing_viewed"
  | "founding_plan_selected"
  | "beta_billing_notice_viewed"
  | "view_plans_clicked";

export interface PricingAnalyticsProperties {
  plan?: string;
  sourcePage?: string;
}

export function trackPricingEvent(event: PricingAnalyticsEvent, properties?: PricingAnalyticsProperties): void {
  console.debug("[pricing-analytics]", event, properties);
}
