"use client";

import Link from "next/link";

/** One compact account-status pill, replacing the old dashboard's several
 * full-width banners (trial countdown, family-limit notice, pricing
 * explanation) — see the family-dashboard-redesign spec: billing shouldn't
 * dominate a health-overview page. Links through to /billing/manage for
 * anyone who wants the detail this pill deliberately omits. Whitelisted
 * test accounts get a plain confirmation pill with no link, since they
 * never see billing at all (see isBillingWhitelisted elsewhere). */
export function AccountStatusPill({
  isBillingWhitelisted,
  trialDaysRemaining,
  isReadOnly,
}: {
  isBillingWhitelisted?: boolean;
  trialDaysRemaining?: number | null;
  isReadOnly?: boolean;
}) {
  if (isBillingWhitelisted) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-dashboard-primary)] bg-[var(--color-dashboard-primary-light)] dark:bg-white/10 dark:text-purple-200 rounded-full pl-2.5 pr-3 py-1.5">
        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[var(--color-dashboard-primary)] text-white text-[10px]" aria-hidden="true">✓</span>
        Test account
      </span>
    );
  }

  if (isReadOnly) {
    return (
      <Link
        href="/billing/manage?module=adults"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 rounded-full px-3 py-1.5 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors"
      >
        Trial ended · Subscribe
      </Link>
    );
  }

  if (trialDaysRemaining != null) {
    return (
      <Link
        href="/billing/manage?module=adults"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-dashboard-primary)] bg-[var(--color-dashboard-primary-light)] dark:bg-white/10 dark:text-purple-200 rounded-full px-3 py-1.5 hover:opacity-80 transition-opacity"
      >
        Trial · {trialDaysRemaining} day{trialDaysRemaining === 1 ? "" : "s"} left
      </Link>
    );
  }

  return null;
}
