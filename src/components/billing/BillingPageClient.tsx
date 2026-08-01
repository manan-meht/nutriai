"use client";

import { useState } from "react";
import Link from "next/link";
import type { EntitlementModule, EntitlementSnapshot } from "@/lib/entitlements/entitlements";
import { cancelSubscription, reactivateSubscription, refreshPaymentStatus, openBillingPortal } from "@/app/actions/subscription-management";

interface BillingPageClientProps {
  module: EntitlementModule;
  entitlement: EntitlementSnapshot;
}

const MODULE_LABEL: Record<EntitlementModule, string> = {
  adults: "Tistra Health Family",
  gym: "Tistra Health Coaching",
};

// Tailwind's JIT scanner only picks up class names it can see written out
// in full in source — `bg-${accent}-50` template interpolation would be
// silently purged from the production build. Every class combination used
// below must appear here as a complete, static string.
const MODULE_ACCENT: Record<EntitlementModule, string> = {
  adults: "bg-rose-50 border border-rose-100 text-rose-800",
  gym: "bg-purple-50 border border-purple-100 text-purple-800",
};

// Deliberately scoped to managing an EXISTING subscription only — no
// checkout/country-picker/interval-selector here. Starting a brand-new
// subscription still goes through /pricing. Combining both in one route
// previously imported createCheckoutSession + CountrySelector on top of
// the cancel/reactivate/portal actions already needed here, and the
// resulting Cloudflare Pages Function pushed the deployment's aggregate
// Functions bundle ~614 KiB over the 25 MiB limit — see git history.
export function BillingPageClient({ module, entitlement }: BillingPageClientProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const accent = MODULE_ACCENT[module];

  async function handleRefresh() {
    setError(null);
    setLoading(true);
    setMessage(null);
    try {
      await refreshPaymentStatus(module);
      setMessage("Payment status refreshed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not refresh payment status.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    if (!window.confirm("Cancel at the end of the current billing period? You'll keep access until then.")) return;
    setError(null);
    setLoading(true);
    try {
      await cancelSubscription(module, true);
      setMessage("Your subscription will end at the end of the current billing period.");
    } catch (err) {
      // A card-free legacy trial (no provider_subscription_id yet) throws
      // here — surface it instead of an uncaught rejection.
      setError(err instanceof Error ? err.message : "Could not cancel your subscription.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReactivate() {
    setError(null);
    setLoading(true);
    try {
      const ok = await reactivateSubscription(module);
      setMessage(ok ? "Subscription reactivated." : "This provider doesn't support reactivation — please subscribe again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reactivate your subscription.");
    } finally {
      setLoading(false);
    }
  }

  async function handleManage() {
    setError(null);
    setLoading(true);
    try {
      const url = await openBillingPortal(module);
      if (url) window.location.href = url;
      else setMessage("Billing-portal management isn't available for this payment method yet.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the billing portal.");
    } finally {
      setLoading(false);
    }
  }

  const dashboardHref = module === "adults" ? "/adults/dashboard" : "/gym/dashboard";
  const hasSubscription = entitlement.status !== "not_started";

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-6">
      <div className="max-w-2xl mx-auto">
        <Link href={dashboardHref} className="text-sm text-gray-400 hover:text-gray-600 mb-6 block">← Back to dashboard</Link>

        <div className="bg-white rounded-2xl border border-gray-100 p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Tistra Health</p>
          <h1 className="text-2xl font-bold text-gray-900 mb-6">{MODULE_LABEL[module]}</h1>

          {/* Status */}
          {entitlement.status === "trialing" && (
            <div className={`mb-6 rounded-xl px-4 py-3 text-sm ${accent}`}>
              Free trial — {entitlement.trialDaysRemaining} day{entitlement.trialDaysRemaining === 1 ? "" : "s"} remaining
              {entitlement.trialEndAt && ` (ends ${new Date(entitlement.trialEndAt).toLocaleDateString()})`}.
            </div>
          )}
          {entitlement.status === "active" && (
            <div className="mb-6 rounded-xl bg-green-50 border border-green-100 px-4 py-3 text-sm text-green-800">
              Subscription active.
            </div>
          )}
          {entitlement.status === "past_due" && (
            <div className="mb-6 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-800">
              Your last payment failed. Please update your payment method to keep access.
            </div>
          )}
          {entitlement.status === "cancel_at_period_end" && (
            <div className="mb-6 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-800">
              Your subscription is set to cancel at the end of the current billing period.
            </div>
          )}
          {entitlement.isReadOnly && (
            <div className="mb-6 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-800">
              Access is currently read-only. <Link href="/pricing" className="underline font-medium">Subscribe</Link> to restore full access.
            </div>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 mb-4">{error}</p>}
          {message && <p className="text-sm text-green-700 bg-green-50 rounded-xl px-4 py-3 mb-4">{message}</p>}

          {hasSubscription ? (
            <div className="flex flex-wrap gap-2 text-sm">
              <button
                onClick={handleManage}
                disabled={loading}
                className="rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-4 py-2 transition-colors disabled:opacity-50"
              >
                Manage payment method
              </button>
              <button
                onClick={handleRefresh}
                disabled={loading}
                className="rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-4 py-2 transition-colors disabled:opacity-50"
              >
                Refresh payment status
              </button>
              {(entitlement.status === "active" || entitlement.status === "trialing") && (
                <button
                  onClick={handleCancel}
                  disabled={loading}
                  className="rounded-full bg-red-50 hover:bg-red-100 text-red-700 font-medium px-4 py-2 transition-colors disabled:opacity-50"
                >
                  Cancel at period end
                </button>
              )}
              {entitlement.status === "cancel_at_period_end" && (
                <button
                  onClick={handleReactivate}
                  disabled={loading}
                  className="rounded-full bg-green-50 hover:bg-green-100 text-green-700 font-medium px-4 py-2 transition-colors disabled:opacity-50"
                >
                  Reactivate
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-600">
              You don&apos;t have an active subscription yet. <Link href="/pricing" className="underline font-medium text-gray-800">View plans</Link> to get started.
            </p>
          )}

          <p className="text-xs text-gray-400 mt-6">
            Tistra Health is provided by Tistra Pte. Ltd. Cancellation takes effect at the end of your current billing
            period; no refunds are issued for partial periods.
          </p>
        </div>
      </div>
    </div>
  );
}
