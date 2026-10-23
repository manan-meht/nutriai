"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  foundingMemberPricing,
  foundingMemberCopy,
  type FoundingMemberPlanId,
  type BillingInterval,
} from "@/lib/pricing/founding-member";
import {
  formatPriceForDisplay,
  INDIA_TAX_INCLUSIVE_NOTE,
  INDIA_LAUNCH_PRICE_LABEL,
  INTL_USD_DISCLOSURE,
  type BillingMarket,
  type PricePoint,
} from "@/lib/billing/pricing";
import { perMonth, bestAnnualSavingsPercent, type PublicPlanPrices } from "@/lib/pricing/plan-prices";
import { trackPricingEvent } from "@/lib/pricing/analytics";
import { choosePlanAndCheckout } from "@/app/actions/pricing";
import { BetaPricingNotice } from "./BetaPricingNotice";
import { TrialPricingNotice } from "./TrialPricingNotice";
import { BILLING_AVAILABLE } from "@/lib/billing/feature-flags";

interface PricingSectionProps {
  /** Where this section is rendered — used only for analytics categorization. */
  sourcePage: string;
  /** Resolved server-side by LocalPricingSection from the visitor's IP,
   * exactly as checkout resolves it — so the prices below are the ones
   * checkout charges. There is deliberately no country picker. */
  market: BillingMarket;
  prices: Record<FoundingMemberPlanId, PublicPlanPrices>;
  /** False when checkout is switched off for this market; prices are then
   * not shown at all, since checkout would refuse them. */
  checkoutAvailable: boolean;
  ipCountry: string | null;
}

const PLAN_ORDER: FoundingMemberPlanId[] = ["self", "family", "gym"];

function format(point: PricePoint): string {
  return formatPriceForDisplay(point.amountMinorUnits, point.currency);
}

/** "Prices for India", or international USD prices for anywhere outside
 * the launch markets. Tells the visitor why they see this currency, since
 * they can't change it. */
function regionLine(market: BillingMarket, ipCountry: string | null): string {
  if (market === "INTL") return "International prices, in US dollars";
  let name: string = market;
  try {
    name = new Intl.DisplayNames(["en"], { type: "region" }).of(ipCountry ?? market) ?? market;
  } catch {
    // Older runtimes without Intl.DisplayNames keep the market code.
  }
  return `Prices for ${name}, based on your location`;
}

export function PricingSection({ sourcePage, market, prices, checkoutAvailable, ipCountry }: PricingSectionProps) {
  const [loggedInHref, setLoggedInHref] = useState<string | null>(null);
  const [startingPlan, setStartingPlan] = useState<FoundingMemberPlanId | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("annual");
  const currency = prices.self.monthly.currency;

  useEffect(() => {
    trackPricingEvent("pricing_viewed", { sourcePage });
    trackPricingEvent(BILLING_AVAILABLE ? "trial_pricing_notice_viewed" : "beta_billing_notice_viewed", { sourcePage });

    let cancelled = false;
    fetch("/api/feedback?resource=dashboard-href")
      .then((res) => res.json())
      .then((data: { href: string | null }) => {
        if (!cancelled) setLoggedInHref(data.href);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sourcePage]);

  useEffect(() => {
    trackPricingEvent("pricing_region_shown", {
      sourcePage,
      pricingCurrency: currency,
      finalPricingRegion: market,
      ipCountry,
    });
  }, [sourcePage, market, currency, ipCountry]);

  async function handleChoosePlan(planId: FoundingMemberPlanId) {
    trackPricingEvent("founding_plan_selected", { plan: planId, sourcePage });
    if (!loggedInHref) return; // logged-out visitors use the signup link instead
    setCheckoutError(null);
    setStartingPlan(planId);
    try {
      const result = await choosePlanAndCheckout(planId, billingInterval);
      if (!result.ok) throw new Error(result.reason);
      window.location.assign(result.url);
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "Couldn't start checkout. Please try again.");
      setStartingPlan(null);
    }
  }

  return (
    <div className="space-y-10">
      <div className="text-center max-w-2xl mx-auto">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">{foundingMemberCopy.sectionTitle}</h1>
        <p className="text-gray-600">{foundingMemberCopy.sectionIntro}</p>
      </div>

      {BILLING_AVAILABLE ? <TrialPricingNotice /> : <BetaPricingNotice />}

      {!checkoutAvailable ? (
        <p className="text-center text-sm text-gray-600 max-w-xl mx-auto">
          Subscriptions aren&apos;t available in your country yet.
        </p>
      ) : (
        <>
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
                <span className="text-xs text-[#6750A4] font-semibold">(Save up to {bestAnnualSavingsPercent(prices)}%)</span>
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

          <p className="text-center text-xs text-gray-500 -mt-6">{regionLine(market, ipCountry)}</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6" role="list">
            {PLAN_ORDER.map((planId) => {
              const plan = foundingMemberPricing[planId];
              const planPrices = prices[planId];
              const charged = planPrices[billingInterval];
              const shown = perMonth(charged, billingInterval);
              const additionalPerson = planPrices.additionalPerson
                ? perMonth(planPrices.additionalPerson[billingInterval], billingInterval)
                : null;
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
                      <span className="text-3xl font-extrabold text-gray-900">{format(shown)}</span>
                      <span className="text-sm text-gray-500">{suffix}</span>
                    </div>
                    {billingInterval === "annual" && (
                      // Framed as "billed as" rather than a second, independent
                      // price — the big number above is a rounded monthly
                      // equivalent of this exact annual charge, so stating
                      // them as two separate facts read as if they disagreed by
                      // a cent or two instead of one being derived from the other.
                      <p className="text-xs text-gray-400 mt-1">
                        Billed as one payment of {format(charged)}/year
                        {charged.standardAmountMinorUnits !== undefined && (
                          <>
                            {" "}(<s>{format({ amountMinorUnits: charged.standardAmountMinorUnits, currency: charged.currency })}</s>{" "}
                            {INDIA_LAUNCH_PRICE_LABEL})
                          </>
                        )}
                      </p>
                    )}
                  </div>

                  <ul className="text-sm text-gray-600 space-y-1.5">
                    <li>
                      Includes {planPrices.includedPeople} {planPrices.includedPeople === 1 ? "person" : "people"}
                    </li>
                    {additionalPerson !== null && (
                      <li>
                        Additional {planId === "gym" ? "client" : "person"}: {format(additionalPerson)}/{planId === "gym" ? "client" : "person"}{suffix}
                      </li>
                    )}
                  </ul>

                  {loggedInHref ? (
                    <button
                      type="button"
                      onClick={() => handleChoosePlan(planId)}
                      disabled={startingPlan !== null}
                      className="mt-auto w-full rounded-xl bg-[#6750A4] hover:bg-[#4F378A] text-white font-semibold py-2.5 text-sm transition-colors disabled:opacity-50"
                    >
                      {startingPlan === planId ? "Redirecting…" : "Choose this plan"}
                    </button>
                  ) : (
                    <Link
                      href={`/${planId === "gym" ? "gym" : "adults"}/signup?plan=${planId}&interval=${billingInterval}`}
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

          {checkoutError && (
            <p className="text-center text-sm text-red-600">{checkoutError}</p>
          )}

          {market === "IN" && (
            <p className="text-center text-xs text-gray-500">{INDIA_TAX_INCLUSIVE_NOTE}</p>
          )}
          {market === "INTL" && (
            <p className="text-center text-xs text-gray-500 max-w-xl mx-auto">{INTL_USD_DISCLOSURE}</p>
          )}
        </>
      )}

      <p className="text-center text-xs text-gray-400 max-w-xl mx-auto">{foundingMemberCopy.noPaymentHelperText}</p>
    </div>
  );
}
