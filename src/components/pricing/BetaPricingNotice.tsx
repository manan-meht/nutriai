import { foundingMemberCopy } from "@/lib/pricing/founding-member";

// Visually reassuring, not a warning — soft brand-tinted background rather
// than amber/red, so it doesn't read as an error state.
export function BetaPricingNotice() {
  return (
    <section
      aria-labelledby="beta-pricing-notice-heading"
      className="rounded-2xl border border-[#6750A4]/15 bg-[#6750A4]/5 px-6 py-6 sm:px-8 sm:py-7"
    >
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="text-2xl">🎉</span>
        <div>
          <h2 id="beta-pricing-notice-heading" className="text-lg font-bold text-gray-900 mb-2">
            {foundingMemberCopy.betaNoticeTitle}
          </h2>
          <div className="space-y-2 text-sm text-gray-600 leading-relaxed max-w-2xl">
            {foundingMemberCopy.betaNotice.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
