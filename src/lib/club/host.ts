// Which hostnames serve Tistra Club.
//
// The club is reachable on more than one name: club.tistrahealth.com (the
// original subdomain, kept working so existing links and any Supabase
// redirect entries don't break) and tistra.club (the product's own domain).
//
// One helper rather than a startsWith("club.") check copied into the
// middleware and both auth pages — adding tistra.club meant touching all
// three, which is exactly when a check gets missed and one surface starts
// disagreeing with the others about what it is serving.
//
// Two things to know when adding another club hostname:
//
//  1. Supabase's redirect allow-list must gain `https://<host>/**`, or
//     OAuth silently returns to the Site URL instead — the failure looks
//     like "signed in and landed on the wrong site", with no error.
//  2. Cookies are scoped per registrable domain (see cookie-domain.ts), so
//     a session on tistra.club is genuinely separate from one on
//     tistrahealth.com. That's correct — different eTLD+1, and the browser
//     would reject a shared Domain attribute — but it does mean signing in
//     on one does not sign you in on the other.

const CLUB_HOSTS = new Set(["tistra.club", "www.tistra.club"]);

/** Bare hostname, lowercased, port stripped. */
export function normalizeHost(hostname: string | null | undefined): string {
  return (hostname ?? "").split(":")[0].toLowerCase();
}

/** True when this request should be served the consumer marketplace. */
export function isClubHost(hostname: string | null | undefined): boolean {
  const host = normalizeHost(hostname);
  // Any club.* subdomain (club.tistrahealth.com, club.localhost in dev).
  if (host.startsWith("club.")) return true;
  return CLUB_HOSTS.has(host);
}

/** True for the www form, which redirects to the apex so a session started
 * on one isn't invisible on the other — host-only cookies make www and the
 * apex separate origins for auth. */
export function isClubWwwHost(hostname: string | null | undefined): boolean {
  return normalizeHost(hostname) === "www.tistra.club";
}

/** The club's canonical origin, used for absolute links and metadata. */
export const CLUB_CANONICAL_ORIGIN =
  process.env.NEXT_PUBLIC_CLUB_ORIGIN ?? "https://tistra.club";
