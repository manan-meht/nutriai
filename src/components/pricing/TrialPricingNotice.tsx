import { foundingMemberCopy } from "@/lib/pricing/founding-member";

// Same treatment as BetaPricingNotice (soft brand-tinted background, not a
// warning) — shown once BILLING_AVAILABLE is on, replacing the Beta-only
// "free, no charge" notice with an accurate "card required, trial then
// auto-charge" one.
export function TrialPricingNotice() {
  return (
    <section
      aria-labelledby="trial-pricing-notice-heading"
      className="rounded-2xl border border-[#6750A4]/15 bg-[#6750A4]/5 px-6 py-6 sm:px-8 sm:py-7"
    >
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="text-2xl">🎉</span>
        <div>
          <h2 id="trial-pricing-notice-heading" className="text-lg font-bold text-gray-900 mb-2">
            {foundingMemberCopy.trialNoticeTitle}
          </h2>
          <p className="text-sm text-gray-600 leading-relaxed max-w-2xl">{foundingMemberCopy.trialNotice}</p>
        </div>
      </div>
    </section>
  );
}
