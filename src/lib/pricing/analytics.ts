// Mirrors src/lib/feedback/analytics.ts's stub pattern exactly — this repo
// has no analytics backend (PostHog/Segment/etc) wired up anywhere yet, so
// this is a console.debug placeholder that's trivial to swap for a real
// call later without touching any call site. Never pass health data,
// payment method details, or other personally sensitive information — only
// plan/page/region categorization and non-sensitive pricing facts.
export type PricingAnalyticsEvent =
  | "pricing_viewed"
  | "founding_plan_selected"
  | "beta_billing_notice_viewed"
  | "trial_pricing_notice_viewed"
  | "view_plans_clicked"
  // India regional pricing — see src/components/pricing/IndiaPricingSection.tsx
  // and the checkout-region-mismatch flow in src/app/actions/checkout.ts.
  | "pricing_region_shown"
  | "checkout_region_mismatch";

/** Non-sensitive facts about a regional pricing decision — never card
 * details, payment method identifiers, or anything beyond a country/market
 * code and the price actually displayed/charged. */
export interface PricingAnalyticsProperties {
  plan?: string;
  sourcePage?: string;
  /** ISO 4217 currency code shown (e.g. "INR", "USD"). */
  pricingCurrency?: string;
  selectedPlan?: string;
  billingPeriod?: "monthly" | "annual";
  /** Displayed price in minor units — the number actually shown/charged. */
  displayedPriceMinorUnits?: number;
  launchOfferUsed?: boolean;
  ipCountry?: string | null;
  billingCountry?: string | null;
  /** Payment method/card issuing country, only when the provider reports it
   * (e.g. Razorpay's post-payment card details) — never captured pre-payment. */
  paymentCountry?: string | null;
  finalPricingRegion?: string;
}

export function trackPricingEvent(event: PricingAnalyticsEvent, properties?: PricingAnalyticsProperties): void {
  console.debug("[pricing-analytics]", event, properties);
}
