"use client";

import { useState } from "react";
import Link from "next/link";
import type { EntitlementModule, EntitlementSnapshot } from "@/lib/entitlements/entitlements";
import type { BillingMarket, BillingInterval } from "@/lib/billing/pricing";
import { CountrySelector } from "./CountrySelector";
import { createCheckoutSession } from "@/app/actions/checkout";
import { cancelSubscription, reactivateSubscription, refreshPaymentStatus, openBillingPortal } from "@/app/actions/subscription-management";
import { STRIPE_CHECKOUT_ENABLED, RAZORPAY_CHECKOUT_ENABLED } from "@/lib/billing/feature-flags";

interface PriceInfo {
  amountMinorUnits: number;
  currency: string;
  label: string;
}

interface BillingPageClientProps {
  module: EntitlementModule;
  entitlement: EntitlementSnapshot;
  market: BillingMarket;
  detectedCountry: string | null;
  confirmedCountry: string | null;
  limit: number;
  pricing: { monthly: PriceInfo; annual: PriceInfo; savingsPct: number };
  intlDisclosure: string | null;
}

const MODULE_LABEL: Record<EntitlementModule, string> = {
  adults: "Tistra Health Family",
  gym: "Tistra Health Coaching",
};

// Tailwind's JIT scanner only picks up class names it can see written out
// in full in source — `bg-${accent}-50` template interpolation would be
// silently purged from the production build. Every class combination used
// below must appear here as a complete, static string.
interface AccentClasses {
  banner: string;
  border: string;
  button: string;
  tabActive: string;
}

const MODULE_ACCENT: Record<EntitlementModule, AccentClasses> = {
  adults: {
    banner: "bg-rose-50 border border-rose-100 text-rose-800",
    border: "border-rose-500",
    button: "bg-rose-600 hover:bg-rose-700",
    tabActive: "border-rose-500 bg-rose-50 text-rose-700",
  },
  gym: {
    banner: "bg-purple-50 border border-purple-100 text-purple-800",
    border: "border-purple-500",
    button: "bg-purple-600 hover:bg-purple-700",
    tabActive: "border-purple-500 bg-purple-50 text-purple-700",
  },
};

export function BillingPageClient({
  module, entitlement, market, detectedCountry, confirmedCountry, limit, pricing, intlDisclosure,
}: BillingPageClientProps) {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmPreview, setConfirmPreview] = useState<Awaited<ReturnType<typeof createCheckoutSession>> | null>(null);

  const accent = MODULE_ACCENT[module];
  const price = pricing[interval];
  const providerAvailable = market === "IN" ? RAZORPAY_CHECKOUT_ENABLED : STRIPE_CHECKOUT_ENABLED;

  async function handleStartCheckout() {
    setError(null);
    setLoading(true);
    try {
      const preview = await createCheckoutSession(module, interval);
      setConfirmPreview(preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout.");
    } finally {
      setLoading(false);
    }
  }

  function handleConfirmAndPay(url: string) {
    window.location.href = url;
  }

  async function handleRefresh() {
    setLoading(true);
    setMessage(null);
    try {
      await refreshPaymentStatus(module);
      setMessage("Payment status refreshed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    if (!window.confirm("Cancel at the end of the current billing period? You'll keep access until then.")) return;
    setLoading(true);
    try {
      await cancelSubscription(module, true);
      setMessage("Your subscription will end at the end of the current billing period.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReactivate() {
    setLoading(true);
    try {
      const ok = await reactivateSubscription(module);
      setMessage(ok ? "Subscription reactivated." : "This provider doesn't support reactivation — please subscribe again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleManage() {
    setLoading(true);
    try {
      const url = await openBillingPortal(module);
      if (url) window.location.href = url;
      else setMessage("Billing-portal management isn't available for this payment method yet.");
    } finally {
      setLoading(false);
    }
  }

  const dashboardHref = module === "adults" ? "/adults/dashboard" : "/gym/dashboard";

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-6">
      <div className="max-w-2xl mx-auto">
        <Link href={dashboardHref} className="text-sm text-gray-400 hover:text-gray-600 mb-6 block">← Back to dashboard</Link>

        <div className="bg-white rounded-2xl border border-gray-100 p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Tistra Health</p>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{MODULE_LABEL[module]}</h1>
          <p className="text-gray-500 text-sm mb-6">
            {module === "adults"
              ? `Up to ${limit} family members, tracked nutrition, and weekly summaries.`
              : `Up to ${limit} clients, WhatsApp meal logging, and AI-assisted coaching insights.`}
          </p>

          {/* Trial / status */}
          {entitlement.status === "trialing" && (
            <div className={`mb-6 rounded-xl px-4 py-3 text-sm ${accent.banner}`}>
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
              Access is currently read-only. Subscribe below to restore full access.
            </div>
          )}

          {/* Country selector */}
          <div className="mb-6">
            <CountrySelector detectedCountry={detectedCountry} confirmedCountry={confirmedCountry} />
          </div>

          {/* Billing interval */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setInterval("monthly")}
              className={`flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${interval === "monthly" ? accent.tabActive : "border-gray-200 text-gray-600"}`}
            >
              Monthly — {pricing.monthly.label}
            </button>
            <button
              onClick={() => setInterval("annual")}
              className={`flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${interval === "annual" ? accent.tabActive : "border-gray-200 text-gray-600"}`}
            >
              Annual — {pricing.annual.label} <span className="text-xs opacity-70">(~{pricing.savingsPct}% off)</span>
            </button>
          </div>

          {intlDisclosure && (
            <p className="text-xs text-gray-400 mb-4">{intlDisclosure}</p>
          )}
          <p className="text-xs text-gray-400 mb-6">Applicable taxes may be calculated at checkout.</p>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 mb-4">{error}</p>}
          {message && <p className="text-sm text-green-700 bg-green-50 rounded-xl px-4 py-3 mb-4">{message}</p>}

          {!providerAvailable && (
            <p className="text-sm text-amber-700 bg-amber-50 rounded-xl px-4 py-3 mb-4">
              Payments for this market aren&apos;t enabled in this environment yet.
            </p>
          )}

          {confirmPreview ? (
            <div className="rounded-xl border border-gray-200 p-4 mb-4">
              <p className="text-sm text-gray-700 mb-1">
                {confirmPreview.chargesImmediately
                  ? `You'll be charged ${price.label} today.`
                  : `You won't be charged today. Your first charge of ${price.label} will be on ${new Date(confirmPreview.firstChargeDateIso).toLocaleDateString()}.`}
              </p>
              <p className="text-xs text-gray-400 mb-3">Renews at {price.label} every {interval === "monthly" ? "month" : "year"} after that.</p>
              <button
                onClick={() => handleConfirmAndPay(confirmPreview.url)}
                className={`w-full ${accent.button} text-white font-semibold rounded-xl py-3 text-sm transition-colors`}
              >
                Continue to payment
              </button>
            </div>
          ) : (
            <button
              onClick={handleStartCheckout}
              disabled={loading || !providerAvailable}
              className={`w-full ${accent.button} disabled:opacity-50 text-white font-semibold rounded-xl py-3 text-sm transition-colors mb-3`}
            >
              Subscribe
            </button>
          )}

          <div className="flex flex-wrap gap-3 text-sm">
            <button onClick={handleManage} disabled={loading} className="text-gray-500 hover:text-gray-800">Manage subscription</button>
            <button onClick={handleRefresh} disabled={loading} className="text-gray-500 hover:text-gray-800">Refresh payment status</button>
            {(entitlement.status === "active") && (
              <button onClick={handleCancel} disabled={loading} className="text-gray-500 hover:text-gray-800">Cancel at period end</button>
            )}
            {entitlement.status === "cancel_at_period_end" && (
              <button onClick={handleReactivate} disabled={loading} className="text-gray-500 hover:text-gray-800">Reactivate</button>
            )}
          </div>

          <p className="text-xs text-gray-400 mt-6">
            Tistra Health is provided by Tistra Pte. Ltd. Cancellation takes effect at the end of your current billing
            period; no refunds are issued for partial periods.
          </p>
          <p className="text-xs text-gray-400 mt-3">
            Tistra Health is a tracking and awareness tool only. It does not provide medical advice, diagnosis,
            treatment, or personalized nutrition therapy. AI-generated summaries may be inaccurate or incomplete. For
            any health, diet, medical condition, medication, or nutrition concern, please consult a qualified
            healthcare professional, doctor, or registered dietitian.
          </p>
        </div>
      </div>
    </div>
  );
}
