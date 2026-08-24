"use client";

import { useEffect, useRef, useState } from "react";
import {
  CONSENT_COOKIE,
  CONSENT_COOKIE_MAX_AGE,
  consentUpdatePayload,
  type ConsentChoice,
} from "@/lib/privacy/consent";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** Prior-consent prompt for EEA/UK visitors.
 *
 * Rendered by GoogleAdsTag only when the visitor is in a country that
 * requires consent AND has not already chosen — so it never appears in
 * Singapore, India, the US or Australia, and never twice.
 *
 * The two buttons are deliberately identical in weight. Regulators treat a
 * prominent "Accept" beside a muted "Reject" as invalid consent, because
 * refusing has to be as easy as agreeing. Resisting the urge to style the
 * accept button as the primary CTA is the whole point.
 *
 * There is no third "manage preferences" layer: the only non-essential
 * storage here is the Google tag, so a granular screen would offer a choice
 * that does not exist.
 */
export function ConsentBanner() {
  const [visible, setVisible] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  // Move focus to the prompt so keyboard and screen-reader users meet it
  // rather than tabbing past an unexplained overlay.
  useEffect(() => {
    ref.current?.focus();
  }, []);

  function choose(choice: ConsentChoice) {
    // Written client-side rather than through a server action: the choice has
    // to take effect on THIS page load, before a round trip could return.
    document.cookie =
      `${CONSENT_COOKIE}=${choice}; path=/; max-age=${CONSENT_COOKIE_MAX_AGE}; SameSite=Lax; Secure`;

    // Tell the already-loaded tag, so the decision applies immediately
    // instead of only from the next navigation.
    window.gtag?.("consent", "update", consentUpdatePayload(choice));

    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-labelledby="consent-title"
      tabIndex={-1}
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-gray-200 bg-white/95 p-4 shadow-[0_-4px_24px_-12px_rgba(0,0,0,0.25)] backdrop-blur supports-[backdrop-filter]:bg-white/85 sm:p-5"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm leading-6 text-gray-700">
          <p id="consent-title" className="font-semibold text-gray-900">
            Cookies for advertising
          </p>
          <p className="mt-1">
            We&rsquo;d like to use cookies to measure how well our ads work. They aren&rsquo;t needed
            to use Tistra, and we won&rsquo;t set them unless you agree.{" "}
            <a href="/privacy" className="underline underline-offset-2 hover:text-gray-900">
              Read our privacy policy
            </a>
            .
          </p>
        </div>
        {/* Equal visual weight — see the note above. */}
        <div className="flex shrink-0 gap-3">
          <button
            type="button"
            onClick={() => choose("denied")}
            className="flex-1 rounded-full border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 sm:flex-none"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => choose("granted")}
            className="flex-1 rounded-full border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 sm:flex-none"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
