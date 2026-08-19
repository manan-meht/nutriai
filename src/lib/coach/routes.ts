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
  "sessions",
  "settings",
] as const;

const SEGMENTS = new Set<string>(COACH_APP_SEGMENTS);

/** True when this host serves the coach product. */
export function isCoachHost(hostname: string | null | undefined): boolean {
  return resolveProductFromHostnameOnly((hostname ?? "").split(":")[0].toLowerCase()) === "gym";
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
