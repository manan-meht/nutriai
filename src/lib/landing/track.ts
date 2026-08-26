/** Landing-page analytics events.
 *
 * Deliberately thin, and deliberately NOT a second analytics system: it
 * pushes through the gtag instance the Google tag already puts on the page
 * (see components/marketing/GoogleAdsTag.tsx). That means consent is handled
 * for free — under Consent Mode a denied EEA visitor queues nothing, which
 * is the behaviour we want and would have to rebuild otherwise.
 *
 * These land in both Google Ads and GA4 (G-HWYL5L7KL2), which share the one
 * tag — see components/marketing/GoogleAdsTag.tsx. Worth firing in Ads
 * regardless of GA4: any of them can be promoted to a conversion action,
 * and the coach funnel otherwise has exactly one conversion event, fired at
 * the very bottom (profile published), which is far too deep for the
 * algorithm to learn from.
 *
 * KNOWN GAP: signup_completed means the confirmation email was sent, not
 * that the account is usable. The visitor still has to open that email and
 * click the link, which returns through /auth/callback — a server redirect
 * with no tag on it. Nothing measures that round trip, and for cold ad
 * traffic it is the likeliest place the funnel dies. Closing it means
 * firing an event on the first authenticated page a new coach lands on.
 */

/** The events this page fires. A union rather than a string so a typo
 * becomes a build error instead of a silently missing funnel step. */
export type LandingEvent =
  | "hero_get_listed_click"
  | "nav_get_listed_click"
  | "sticky_mobile_get_listed_click"
  | "final_get_listed_click"
  | "see_how_it_works_click"
  | "founding_offer_details_click"
  | "signup_started"
  | "signup_completed";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function track(event: LandingEvent, params?: Record<string, string | number>): void {
  if (typeof window === "undefined") return;
  // Optional call, not a guard-and-throw: the tag is absent in local dev and
  // blocked by plenty of real browsers. A missing analytics call must never
  // be the reason a CTA does not navigate.
  window.gtag?.("event", event, params ?? {});
}
