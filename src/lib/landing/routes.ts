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
  // The adults product has no dedicated /signup route group — it shares the
  // "/signup" route with gym and resolves which product to show from the
  // ?product= query param (falling back to NEXT_PUBLIC_PRODUCT otherwise).
  // Always include it explicitly so this never silently defaults to gym.
  const base = params.product === "gym" ? "/gym/signup" : "/signup";
  const qs = new URLSearchParams({
    source: params.source,
    variant: params.variant,
    ...(params.product !== "gym" ? { product: params.product } : {}),
    ...(params.experimentId ? { exp: params.experimentId } : {}),
  });
  return `${base}?${qs.toString()}`;
}

export function getLoginUrl(params: GetLoginUrlParams): string {
  // Same reasoning as getSignupUrl — "/login" is shared and must be told
  // explicitly which product it's for.
  const base = params.product === "gym" ? "/gym/login" : "/login";
  const qsParams: Record<string, string> = {};
  if (params.source) qsParams.source = params.source;
  if (params.product !== "gym") qsParams.product = params.product;
  const qs = Object.keys(qsParams).length ? new URLSearchParams(qsParams) : null;
  return qs ? `${base}?${qs.toString()}` : base;
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
