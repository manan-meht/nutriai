/** Cookie-consent state for the Google tag, scoped to the EEA/UK.
 *
 * Pure logic only — no next/headers — so it stays unit-testable and can be
 * imported from both the server component that emits the tag and the client
 * banner that updates it.
 *
 * Why this exists: the Google Ads tag writes advertising identifiers on page
 * load. Under the ePrivacy Directive that needs PRIOR opt-in in the EEA, so
 * disclosing it in the privacy policy after the fact is not enough. Google
 * additionally requires Consent Mode v2 signals for EEA traffic and discards
 * EEA conversion data without them — so the same gap loses the conversions
 * it creates the exposure for.
 */

/** EU 27 + the three EEA states + the UK.
 *
 * The UK is not in the EEA but PECR/UK GDPR impose the same prior-consent
 * rule, and Google's own Consent Mode requirement covers it, so treating it
 * separately would be a distinction without a difference. Switzerland is
 * deliberately NOT here: the FADP has no equivalent prior-consent rule for
 * cookies, so including it would suppress ads data for no legal gain. */
export const CONSENT_REQUIRED_COUNTRIES: ReadonlySet<string> = new Set([
  // EU 27
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
  // EEA non-EU
  "IS", "LI", "NO",
  // UK
  "GB",
]);

/** Name kept short and neutral; it is a strictly-necessary cookie recording
 * the visitor's own choice, which is itself exempt from consent. */
export const CONSENT_COOKIE = "tistra_consent";

/** One year, the common ceiling regulators expect before re-asking. */
export const CONSENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type ConsentChoice = "granted" | "denied";
/** `null` = no choice recorded yet, so the banner still has to be shown. */
export type ConsentState = ConsentChoice | null;

/**
 * Whether this visitor must be asked BEFORE advertising storage is written.
 *
 * `country` comes from Cloudflare's cf-ipcountry header. When it is unknown
 * (local dev, an unresolvable IP, Cloudflare's "XX"/"T1" placeholders) this
 * returns true: the safe direction is to ask someone who did not need asking,
 * never to skip asking someone who did.
 */
export function consentRequiredFor(country: string | null | undefined): boolean {
  if (!country) return true;
  return CONSENT_REQUIRED_COUNTRIES.has(country.toUpperCase());
}

export function parseConsent(raw: string | null | undefined): ConsentState {
  return raw === "granted" || raw === "denied" ? raw : null;
}

/** The four Consent Mode v2 signals that gate advertising and analytics.
 * security_storage is strictly necessary and never gated. */
const GATED_SIGNALS = [
  "ad_storage",
  "ad_user_data",
  "ad_personalization",
  "analytics_storage",
] as const;

/**
 * The `gtag('consent', 'default', …)` payload, as a JS object literal.
 *
 * Outside the EEA/UK this grants everything, leaving those markets exactly as
 * they were. Inside, everything gated starts denied — and stays denied until
 * the visitor chooses, which is the whole point.
 *
 * `wait_for_update` holds tag execution briefly so a returning visitor's
 * stored choice can be applied before anything fires, rather than the tag
 * racing ahead under the default and being corrected a moment too late.
 */
export function consentDefaultPayload(params: {
  required: boolean;
  stored: ConsentState;
}): string {
  const value: ConsentChoice = !params.required
    ? "granted"
    : params.stored === "granted"
      ? "granted"
      : "denied";
  const entries = GATED_SIGNALS.map((s) => `'${s}':'${value}'`);
  entries.push("'security_storage':'granted'");
  if (params.required) entries.push("'wait_for_update':500");
  return `{${entries.join(",")}}`;
}

/** The `gtag('consent', 'update', …)` payload sent when the visitor chooses. */
export function consentUpdatePayload(choice: ConsentChoice): Record<string, ConsentChoice> {
  return Object.fromEntries(GATED_SIGNALS.map((s) => [s, choice])) as Record<string, ConsentChoice>;
}

/** True when the banner still has to be rendered for this visitor. */
export function shouldShowBanner(params: { required: boolean; stored: ConsentState }): boolean {
  return params.required && params.stored === null;
}
