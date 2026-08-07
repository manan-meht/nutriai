"use client";

import { useEffect } from "react";
import Link from "next/link";
import {
  SELF_PRICING,
  PRICING,
  PEOPLE_INCLUDED,
  formatPriceForDisplay,
  INDIA_TAX_INCLUSIVE_NOTE,
  INDIA_LAUNCH_PRICE_LABEL,
  TRIAL_LENGTH_DAYS_BY_MODULE,
  type BillingPlan,
} from "@/lib/billing/pricing";
import { trackPricingEvent } from "@/lib/pricing/analytics";
import { BILLING_AVAILABLE, RAZORPAY_CHECKOUT_ENABLED } from "@/lib/billing/feature-flags";

interface IndiaPricingSectionProps {
  plan: BillingPlan;
  /** Where this section is rendered — used only for analytics categorization. */
  sourcePage: string;
  /** Real signup/checkout link — used once billing is actually live for India. */
  signupUrl: string;
  onSignupClick?: () => void;
  /** Pre-launch fallback CTA, shown instead of the signup link while
   * BILLING_AVAILABLE/RAZORPAY_CHECKOUT_ENABLED are off (matches this
   * landing page's existing waitlist pattern). */
  waitlistHref: string;
  waitlistLabel: string;
}

const PLAN_COPY: Record<BillingPlan, { name: string; peopleNoun: string }> = {
  self: { name: "Self", peopleNoun: "person" },
  family: { name: "Family", peopleNoun: "people" },
  coach: { name: "Coach", peopleNoun: "clients" },
};

function pricePointsForPlan(plan: BillingPlan) {
  if (plan === "self") return SELF_PRICING.IN;
  return plan === "family" ? PRICING.IN.adults : PRICING.IN.gym;
}

/** India pricing card for the /me/india, /family/india, /coach/india
 * landing pages — reads directly from the server-authoritative pricing
 * table (src/lib/billing/pricing.ts), the same one checkout validates
 * against, so this display can never drift from what's actually charged.
 * Shows the same plan structure/features as the global cards — only the
 * numbers and currency differ.
 *
 * Renders nothing at all — not even the price, just the pre-existing
 * waitlist-only page — until BOTH BILLING_AVAILABLE and
 * RAZORPAY_CHECKOUT_ENABLED are on (i.e. Razorpay merchant approval/KYC is
 * actually done). Deliberately an all-or-nothing gate on the whole section,
 * not just the checkout button, so no India price is ever visible before
 * India billing can actually take payment for it. */
export function IndiaPricingSection({ plan, sourcePage, signupUrl, onSignupClick, waitlistHref, waitlistLabel }: IndiaPricingSectionProps) {
  const trialDays = TRIAL_LENGTH_DAYS_BY_MODULE[plan === "coach" ? "gym" : "adults"];
  const included = PEOPLE_INCLUDED[plan];
  const copy = PLAN_COPY[plan];
  const { monthly, annual } = pricePointsForPlan(plan);
  const billingIsLive = BILLING_AVAILABLE && RAZORPAY_CHECKOUT_ENABLED;

  useEffect(() => {
    // Nothing to report while the section itself isn't rendering anything
    // (see the early return below) — billingIsLive comes from module-scope
    // flags, so this is always the same decision on every render of a given
    // mount, not conditional hook usage.
    if (!billingIsLive) return;
    trackPricingEvent("pricing_region_shown", {
      plan,
      sourcePage,
      pricingCurrency: "INR",
      finalPricingRegion: "IN",
      launchOfferUsed: annual.standardAmountMinorUnits !== undefined,
    });
    // Only re-fire if the plan/page identity actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, sourcePage]);

  if (!billingIsLive) return null;

  return (
    <section className="py-20 px-6 bg-[#F3EEFB]">
      <div className="max-w-md mx-auto">
        <div className="rounded-2xl border border-[#E9DDFF] bg-white p-8 flex flex-col gap-5 shadow-sm">
          <div>
            <span className="inline-block text-[11px] font-semibold uppercase tracking-wide text-[#6750A4] bg-[#6750A4]/10 rounded-full px-2.5 py-1 mb-3">
              India pricing
            </span>
            <h3 className="text-2xl font-bold text-gray-900">{copy.name}</h3>
          </div>

          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-extrabold text-gray-900">{formatPriceForDisplay(annual.amountMinorUnits, "INR")}</span>
              <span className="text-sm text-gray-500">/year</span>
            </div>
            {annual.standardAmountMinorUnits !== undefined && (
              <p className="mt-1 text-sm">
                <span className="line-through text-gray-400">{formatPriceForDisplay(annual.standardAmountMinorUnits, "INR")}</span>{" "}
                <span className="text-[#6750A4] font-semibold">{INDIA_LAUNCH_PRICE_LABEL}</span>
              </p>
            )}
            <p className="text-sm text-gray-500 mt-1">
              or {formatPriceForDisplay(monthly.amountMinorUnits, "INR")}/month
            </p>
            <p className="text-xs text-gray-400 mt-2">{INDIA_TAX_INCLUSIVE_NOTE}</p>
          </div>

          <ul className="text-sm text-gray-700 space-y-1.5">
            <li>Includes {included} {included === 1 ? copy.peopleNoun : copy.peopleNoun}</li>
            <li>{trialDays} days free trial</li>
          </ul>

          {/* No pre-launch fallback branch here — billingIsLive is always
             true by the time this JSX renders (see the early return above),
             so this is always the real checkout link. */}
          <Link
            href={signupUrl}
            onClick={onSignupClick}
            className="mt-auto w-full text-center rounded-xl bg-[#6750A4] hover:bg-[#4F378A] text-white font-semibold py-3 text-sm transition-colors"
          >
            Start your {trialDays}-day free trial →
          </Link>
        </div>
      </div>
    </section>
  );
}
