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
  // Page and section visibility. Section events fire once, when the section
  // is actually seen — a coach who never scrolls to the pricing section did
  // not "bounce off the pricing", and the two need telling apart.
  | "coach_landing_view"
  | "founding_offer_view"
  | "marketplace_preview_view"
  | "pricing_section_view"
  | "faq_view"
  // Intent.
  // One CTA event with a placement, not five near-identical names. The
  // question is never "did the sticky bar fire" — it is "which placement
  // converts", and that is a breakdown, not five separate reports.
  | "founding_cta_click"
  | "navbar_signup_click"
  | "onboarding_help_click"
  // Conversion.
  | "signup_started"
  | "signup_completed";

/** Properties worth attaching to every landing event.
 *
 * `foundingSpotsRemaining` is the interesting one: if conversion moves as
 * the number falls, the scarcity is doing work; if it does not, the page is
 * being read for other reasons and the offer card can be simplified. */
export interface LandingEventProps {
  source?: string;
  campaign?: string;
  device?: "mobile" | "desktop";
  landingVariant?: string;
  foundingSpotsRemaining?: number;
  /** Where on the page a CTA was pressed. */
  placement?: "hero" | "offer_card" | "sticky" | "final" | "navbar" | "onboarding";
  [key: string]: string | number | undefined;
}

/** Best-effort device class from the viewport, matching the CSS breakpoint
 * the page itself switches on (md = 768px) so "mobile" in analytics means
 * the same thing as "mobile" in the layout. */
export function deviceClass(): "mobile" | "desktop" {
  if (typeof window === "undefined") return "desktop";
  return window.innerWidth < 768 ? "mobile" : "desktop";
}

/** UTM and click-id params, read from the current URL.
 *
 * Ads attribution is already handled by the gclid cookie the Google tag
 * writes; this is for our own funnel reporting, so a campaign can be
 * matched to the section people actually reached. */
export function campaignParams(): Pick<LandingEventProps, "source" | "campaign"> {
  if (typeof window === "undefined") return {};
  const q = new URLSearchParams(window.location.search);
  const source = q.get("utm_source") ?? q.get("source") ?? undefined;
  const campaign = q.get("utm_campaign") ?? undefined;
  return { ...(source ? { source } : {}), ...(campaign ? { campaign } : {}) };
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function track(event: LandingEvent, params?: LandingEventProps): void {
  if (typeof window === "undefined") return;
  // Optional call, not a guard-and-throw: the tag is absent in local dev and
  // blocked by plenty of real browsers. A missing analytics call must never
  // be the reason a CTA does not navigate.
  // Campaign and device are attached here rather than at every call site,
  // so a new event cannot ship without them.
  window.gtag?.("event", event, {
    ...campaignParams(),
    device: deviceClass(),
    ...(params ?? {}),
  });
}
