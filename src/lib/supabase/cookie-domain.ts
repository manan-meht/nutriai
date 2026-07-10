const APEX_DOMAIN = "tistrahealth.com";

/** Scopes the Supabase auth cookie to the shared parent domain when the
 * request is actually on a *.tistrahealth.com host, so a session started
 * on one subdomain (e.g. coach.tistrahealth.com) is visible on another
 * (family.tistrahealth.com) or the apex (tistrahealth.com) — this is what
 * lets the existing "detect a logged-in user" logic in
 * src/app/(public)/page.tsx actually fire for real users, instead of only
 * ever seeing a session when everything happens to run on one host.
 *
 * Returns undefined (host-only cookie, the browser default) for anything
 * else — localhost in dev, *.pages.dev preview deployments, and any
 * custom domain. A custom domain is a different eTLD and can never share
 * a tistrahealth.com cookie regardless; explicitly setting Domain there
 * would make browsers reject the cookie outright instead of merely
 * scoping it, so it must be avoided rather than just "harmlessly ignored".
 */
export function getCookieDomain(hostname: string | null | undefined): string | undefined {
  if (!hostname) return undefined;
  const host = hostname.split(":")[0].toLowerCase();
  if (host === APEX_DOMAIN || host.endsWith(`.${APEX_DOMAIN}`)) {
    return `.${APEX_DOMAIN}`;
  }
  return undefined;
}
