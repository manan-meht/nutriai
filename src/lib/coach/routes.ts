import { resolveProductFromHostnameOnly } from "@/lib/product/resolve-product";

// Coach OS is served from the ROOT of the coach host: a coach sees
// coach.tistra.club/dashboard, not /coach/dashboard.
//
// Unlike the club, the coach host cannot simply rewrite everything. Two
// different things live under /coach:
//
//   Coach OS      /coach/dashboard, /coach/clients/<id>, …  (the app)
//   Marketing     /coach, /coach/india, /coach/add-users     (public pages)
//
// So only the app's own segments are mapped. Sweeping the whole prefix
// would send /coach/india to /india, which does not exist.

/** Top-level segments owned by Coach OS. Keep in sync with the directories
 * under src/app/(coach)/coach/ — a test asserts they match. */
export const COACH_APP_SEGMENTS = [
  "calendar",
  "clients",
  "dashboard",
  "nutrition",
  "payments",
  "payouts",
  "sessions",
  "settings",
] as const;

const SEGMENTS = new Set<string>(COACH_APP_SEGMENTS);

/** True when this host serves the coach product. */
export function isCoachHost(hostname: string | null | undefined): boolean {
  return resolveProductFromHostnameOnly((hostname ?? "").split(":")[0].toLowerCase()) === "gym";
}

/** Local development, where one server answers for every product and there
 * is no coach hostname unless you go out of your way to use one. */
export function isLocalDevHost(hostname: string | null | undefined): boolean {
  const host = (hostname ?? "").split(":")[0].toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost");
}

/** Whether Coach OS's clean URLs should resolve on this host.
 *
 * In production that means the coach host only — /dashboard on
 * tistrahealth.com must not silently open the coach product. Locally it
 * also means plain localhost, because the alternative is that every
 * un-prefixed link in Coach OS 404s in development while working in
 * production, which is a trap rather than a safeguard. */
export function servesCoachApp(hostname: string | null | undefined): boolean {
  return isCoachHost(hostname) || isLocalDevHost(hostname);
}

/** "/dashboard" or "/clients/abc" -> true; "/india" or "/" -> false. */
export function isCoachAppPath(pathname: string): boolean {
  return SEGMENTS.has(pathname.split("/")[1] ?? "");
}

/** "/coach/dashboard" -> true, but "/coach/india" (marketing) -> false. */
export function isPrefixedCoachAppPath(pathname: string): boolean {
  if (!pathname.startsWith("/coach/")) return false;
  return SEGMENTS.has(pathname.split("/")[2] ?? "");
}
