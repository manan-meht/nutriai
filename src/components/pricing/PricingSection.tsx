"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  foundingMemberPricing,
  foundingMemberCopy,
  formatFoundingPrice,
  displayMonthlyPriceForInterval,
  displayAdditionalPersonMonthlyPriceForInterval,
  type FoundingMemberPlanId,
  type BillingInterval,
} from "@/lib/pricing/founding-member";
import { trackPricingEvent } from "@/lib/pricing/analytics";
import { setIntendedPlan } from "@/app/actions/pricing";
import { BetaPricingNotice } from "./BetaPricingNotice";

interface PricingSectionProps {
  /** Where this section is rendered — used only for analytics categorization. */
  sourcePage: string;
}

const PLAN_ORDER: FoundingMemberPlanId[] = ["self", "family", "gym"];

export function PricingSection({ sourcePage }: PricingSectionProps) {
  const [loggedInHref, setLoggedInHref] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<FoundingMemberPlanId | null>(null);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("annual");

  useEffect(() => {
    trackPricingEvent("pricing_viewed", { sourcePage });
    trackPricingEvent("beta_billing_notice_viewed", { sourcePage });

    let cancelled = false;
    fetch("/api/feedback?resource=dashboard-href")
      .then((res) => res.json())
      .then((data: { href: string | null }) => {
        if (!cancelled) setLoggedInHref(data.href);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sourcePage]);

  async function handleChoosePlan(planId: FoundingMemberPlanId) {
    trackPricingEvent("founding_plan_selected", { plan: planId, sourcePage });
    if (!loggedInHref) return; // logged-out visitors use the signup link instead
    setSelectedPlan(planId);
    await setIntendedPlan(planId).catch(() => {});
  }

  return (
    <div className="space-y-10">
      <div className="text-center max-w-2xl mx-auto">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">{foundingMemberCopy.sectionTitle}</h1>
        <p className="text-gray-600">{foundingMemberCopy.sectionIntro}</p>
      </div>

      <BetaPricingNotice />

      <div className="flex justify-center" role="group" aria-label="Billing interval">
        <div className="inline-flex rounded-full border border-gray-200 bg-gray-50 p-1">
          <button
            type="button"
            onClick={() => setBillingInterval("annual")}
            aria-pressed={billingInterval === "annual"}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              billingInterval === "annual" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
            }`}
          >
            {foundingMemberCopy.annualToggleLabel}{" "}
            <span className="text-xs text-[#6750A4] font-semibold">({foundingMemberCopy.annualSavingsLabel})</span>
          </button>
          <button
            type="button"
            onClick={() => setBillingInterval("monthly")}
            aria-pressed={billingInterval === "monthly"}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              billingInterval === "monthly" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
            }`}
          >
            {foundingMemberCopy.monthlyToggleLabel}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6" role="list">
        {PLAN_ORDER.map((planId) => {
          const plan = foundingMemberPricing[planId];
          const price = displayMonthlyPriceForInterval(plan, billingInterval);
          const additionalPersonPrice = displayAdditionalPersonMonthlyPriceForInterval(plan, billingInterval);
          const suffix = billingInterval === "monthly" ? foundingMemberCopy.monthlySuffix : foundingMemberCopy.annualSuffix;
          return (
            <div
              key={planId}
              role="listitem"
              className="rounded-2xl border border-gray-200 bg-white p-6 flex flex-col gap-4 shadow-sm"
            >
              <div>
                <span className="inline-block text-[11px] font-semibold uppercase tracking-wide text-[#6750A4] bg-[#6750A4]/10 rounded-full px-2.5 py-1 mb-3">
                  {foundingMemberCopy.badge}
                </span>
                <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                <p className="text-sm text-gray-500 mt-1">{plan.description}</p>
              </div>

              <div>
                <div>
                  <span className="text-3xl font-extrabold text-gray-900">{formatFoundingPrice(price)}</span>
                  <span className="text-sm text-gray-500">{suffix}</span>
                </div>
                {billingInterval === "annual" && (
                  <p className="text-xs text-gray-400 mt-1">{formatFoundingPrice(plan.annualPrice)} billed annually</p>
                )}
              </div>

              <ul className="text-sm text-gray-600 space-y-1.5">
                <li>
                  Includes {plan.includedPeople} {plan.includedPeople === 1 ? "person" : "people"}
                </li>
                {additionalPersonPrice !== null && (
                  <li>
                    Additional {planId === "gym" ? "client" : "person"}: {formatFoundingPrice(additionalPersonPrice)}/{planId === "gym" ? "client" : "person"}{suffix}
                  </li>
                )}
              </ul>

              {loggedInHref ? (
                <button
                  type="button"
                  onClick={() => handleChoosePlan(planId)}
                  className="mt-auto w-full rounded-xl bg-[#6750A4] hover:bg-[#4F378A] text-white font-semibold py-2.5 text-sm transition-colors"
                >
                  {selectedPlan === planId ? "Selected ✓" : "Choose this plan"}
                </button>
              ) : (
                <Link
                  href={`/${planId === "gym" ? "coach" : "family"}?plan=${planId}`}
                  onClick={() => trackPricingEvent("founding_plan_selected", { plan: planId, sourcePage })}
                  className="mt-auto w-full text-center rounded-xl bg-[#6750A4] hover:bg-[#4F378A] text-white font-semibold py-2.5 text-sm transition-colors"
                >
                  Get started
                </Link>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-gray-400 max-w-xl mx-auto">{foundingMemberCopy.noPaymentHelperText}</p>
    </div>
  );
}
