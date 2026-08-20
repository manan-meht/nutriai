/**
 * Shared landing-page CTA route helpers.
 *
 * All CTAs on both landing variants must use these helpers.
 * The variant is included as a query param for attribution only —
 * it does not create a different signup flow.
 */

import type {
  ProductType,
  LandingVariant,
  GetSignupUrlParams,
  GetLoginUrlParams,
  LandingAnalyticsProperties,
  LandingAnalyticsEvent,
} from "@/types";

export function getSignupUrl(params: GetSignupUrlParams): string {
  // One signup route for every product: "/signup", told which product to
  // show by ?product=. The old /gym/signup path still redirects here (308,
  // see middleware) for links already circulating, but nothing generates it
  // any more — the coach product is not gym-specific, and its public URL
  // shouldn't say it is.
  //
  // The param is always explicit, so this can never silently fall back to
  // NEXT_PUBLIC_PRODUCT and sign someone up for the wrong thing.
  const qs = new URLSearchParams({
    source: params.source,
    variant: params.variant,
    product: params.productParam ?? (params.product === "gym" ? "coach" : params.product),
    ...(params.experimentId ? { exp: params.experimentId } : {}),
  });
  return `/signup?${qs.toString()}`;
}

export function getLoginUrl(params: GetLoginUrlParams): string {
  // Same reasoning as getSignupUrl — "/login" is shared and must be told
  // explicitly which product it's for.
  const qsParams: Record<string, string> = {};
  if (params.source) qsParams.source = params.source;
  qsParams.product = params.product === "gym" ? "coach" : params.product;
  return `/login?${new URLSearchParams(qsParams).toString()}`;
}

export function getDemoUrl(product: ProductType): string {
  return product === "gym" ? "/gym/demo" : "/adults/demo";
}

export function getOnboardingUrl(product: ProductType): string {
  return product === "gym" ? "/gym/onboarding" : "/adults/onboarding";
}

// ---- Analytics ----

export type TrackFn = (
  event: LandingAnalyticsEvent,
  properties: Partial<LandingAnalyticsProperties> & Record<string, unknown>
) => void;

let _trackFn: TrackFn | null = null;

/**
 * Register the analytics provider.
 * Call once in your root layout client component (e.g. with PostHog or Segment).
 */
export function registerLandingTracker(fn: TrackFn): void {
  _trackFn = fn;
}

export function trackLandingEvent(
  event: LandingAnalyticsEvent,
  properties: Partial<LandingAnalyticsProperties> & Record<string, unknown>
): void {
  if (typeof window === "undefined") return;
  if (!_trackFn) {
    // Fallback: log in dev, silent in production
    if (process.env.NODE_ENV === "development") {
      console.debug("[landing-analytics]", event, properties);
    }
    return;
  }
  _trackFn(event, properties);
}

// ---- Attribution storage ----

const ATTRIBUTION_KEY = "landing_attribution";

export interface LandingAttribution {
  product: ProductType;
  variant: LandingVariant;
  experimentId?: string;
  clickedAt: number;
}

export function storeLandingAttribution(attribution: LandingAttribution): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution));
}

export function readLandingAttribution(): LandingAttribution | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ATTRIBUTION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearLandingAttribution(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(ATTRIBUTION_KEY);
}
