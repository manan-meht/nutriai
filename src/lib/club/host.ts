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

/** The club's canonical origin — where /club/... on a non-club host is
 * sent. Defaults to the subdomain that is live today; set
 * NEXT_PUBLIC_CLUB_ORIGIN to https://tistra.club once that domain resolves,
 * so this never points at a domain that isn't answering yet. */
export const CLUB_CANONICAL_ORIGIN =
  process.env.NEXT_PUBLIC_CLUB_ORIGIN ?? "https://club.tistrahealth.com";

/** Tistra Coach's own home. Coaching is a separate product from Tistra
 * Health and is no longer served from that domain. */
export const COACH_CANONICAL_ORIGIN =
  process.env.NEXT_PUBLIC_COACH_ORIGIN ?? "https://coach.tistra.club";

/** The old coach subdomain on the Health domain, kept alive as a redirect
 * so existing links, bookmarks and any Supabase entry still land somewhere
 * correct rather than 404ing. */
export function isLegacyCoachHost(hostname: string | null | undefined): boolean {
  return normalizeHost(hostname) === "coach.tistrahealth.com";
}

/** Local development, where one server answers for every product and there
 * are no product hostnames unless you go out of your way to use one. */
export function isLocalDevHost(hostname: string | null | undefined): boolean {
  const host = normalizeHost(hostname);
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost")) {
    return true;
  }
  // Phone-on-the-same-wifi testing: the dev server is reached by the
  // machine's private LAN address (192.168.x.x etc), which no production
  // request ever carries — Workers always see a real hostname. Without
  // this, opening a club path from a phone 308s to the production domain
  // mid-test.
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(host);
}

/** Top-level segments owned by the club app. Keep in sync with the
 * directories under src/app/(club)/club/ — a test asserts they match. */
export const CLUB_APP_SEGMENTS = ["bookings", "browse", "checkout", "coaches", "demo", "packs", "profile"] as const;

const CLUB_SEGMENTS = new Set<string>(CLUB_APP_SEGMENTS);

/** "/coaches/abc" -> true; "/" and "/pricing" -> false.
 *
 * Used only in local development. On a real club host everything is
 * rewritten, including the root; on localhost the root has to stay Tistra
 * Health, because one dev server cannot give "/" to two products. */
export function isClubAppPath(pathname: string): boolean {
  return CLUB_SEGMENTS.has(pathname.split("/")[1] ?? "");
}
