"use client";

import { useState } from "react";
import { CONSENT_COOKIE, consentUpdatePayload } from "@/lib/privacy/consent";

/** Lets someone change or withdraw an advertising-cookie choice.
 *
 * Required, not a nicety: consent has to be as easy to withdraw as it was to
 * give. Without this the banner records a decision once and no route back
 * exists, which makes the original consent invalid however well the prompt
 * itself was built.
 *
 * Clearing the cookie is what brings the banner back — GoogleAdsTag renders
 * it whenever an EEA/UK visitor has no recorded choice — so this needs no
 * separate state to coordinate with.
 */
export function ConsentPreferencesButton() {
  const [done, setDone] = useState(false);

  function reset() {
    // Expire the cookie on the same path it was written to.
    document.cookie = `${CONSENT_COOKIE}=; path=/; max-age=0; SameSite=Lax; Secure`;
    // Revoke immediately rather than waiting for the reload, so nothing more
    // is collected in the gap.
    window.gtag?.("consent", "update", consentUpdatePayload("denied"));
    setDone(true);
    // Full reload so the server re-renders with no stored choice and the
    // prompt reappears.
    window.location.reload();
  }

  return (
    <button
      type="button"
      onClick={reset}
      disabled={done}
      className="rounded-full border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
    >
      {done ? "Reopening…" : "Change my cookie choice"}
    </button>
  );
}
