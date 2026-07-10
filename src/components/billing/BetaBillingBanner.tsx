"use client";

import Link from "next/link";
import { foundingMemberCopy } from "@/lib/pricing/founding-member";
import { trackPricingEvent } from "@/lib/pricing/analytics";

interface BetaBillingBannerProps {
  /** Used only for analytics categorization (e.g. "adults_dashboard", "gym_dashboard", "billing_page"). */
  sourcePage: string;
  /** Defaults to the short "View plans" label; pass the longer label on /billing. */
  linkLabel?: string;
  className?: string;
}

// Compact, reassuring Beta notice — replaces the Subscribe/Upgrade/trial-
// countdown banners while BILLING_AVAILABLE is off. No Subscribe/Pay/Start
// billing CTA here by design.
export function BetaBillingBanner({ sourcePage, linkLabel, className }: BetaBillingBannerProps) {
  return (
    <div
      className={`rounded-xl border border-[#6750A4]/15 bg-[#6750A4]/5 px-4 py-3 text-sm text-gray-700 flex flex-wrap items-center justify-between gap-3 ${className ?? ""}`}
    >
      <div>
        <p className="font-semibold text-gray-900">{foundingMemberCopy.dashboardBannerTitle}</p>
        <p className="text-gray-600 mt-0.5">{foundingMemberCopy.dashboardBanner}</p>
      </div>
      <Link
        href="/pricing"
        onClick={() => trackPricingEvent("view_plans_clicked", { sourcePage })}
        className="shrink-0 rounded-full bg-[#6750A4] hover:bg-[#4F378A] text-white text-xs font-semibold px-4 py-2 transition-colors"
      >
        {linkLabel ?? foundingMemberCopy.viewPlansShortLabel}
      </Link>
    </div>
  );
}
