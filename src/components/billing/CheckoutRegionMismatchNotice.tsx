"use client";

import { useState } from "react";
import { retryCheckoutAsGlobalPricing } from "@/app/actions/checkout";
import { trackPricingEvent } from "@/lib/pricing/analytics";
import type { EntitlementModule } from "@/lib/entitlements/entitlements";
import type { BillingInterval } from "@/lib/billing/pricing";

interface CheckoutRegionMismatchNoticeProps {
  module: EntitlementModule;
  interval: BillingInterval;
  onDismiss?: () => void;
}

/**
 * Spec §7: shown when a customer selected India pricing but their payment
 * method wasn't India-eligible, so the India checkout didn't go through.
 * Never mentions VPN. "Continue" re-runs checkout at the equivalent global
 * price via retryCheckoutAsGlobalPricing — same module/interval, so
 * Self/Family/Coach, monthly/annual, and trial eligibility are all
 * preserved exactly.
 */
export function CheckoutRegionMismatchNotice({ module, interval, onDismiss }: CheckoutRegionMismatchNoticeProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    setLoading(true);
    setError(null);
    trackPricingEvent("checkout_region_mismatch", { plan: module, billingPeriod: interval, finalPricingRegion: "INTL" });
    try {
      const result = await retryCheckoutAsGlobalPricing(module, interval);
      window.location.assign(result.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start checkout. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p>
        India pricing is available for purchases using an India-based payment method. We&apos;ve updated your
        checkout to the standard international price.
      </p>
      <div className="mt-3 flex gap-3">
        <button
          type="button"
          onClick={handleContinue}
          disabled={loading}
          className="rounded-lg bg-amber-900 text-white font-semibold px-4 py-2 text-sm disabled:opacity-50"
        >
          {loading ? "Redirecting…" : "Continue at standard pricing"}
        </button>
        {onDismiss && (
          <button type="button" onClick={onDismiss} className="text-amber-800 underline text-sm">
            Dismiss
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-red-700">{error}</p>}
    </div>
  );
}
