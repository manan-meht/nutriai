import { headers } from "next/headers";

/** The visitor's city, from Cloudflare's edge geolocation.
 *
 * cf.city comes from the Worker's request.cf object, which is populated on
 * every Workers plan — unlike the CF-IPCity HTTP header, which is
 * Enterprise-only and is why this is usually assumed to be unavailable.
 *
 * Order matters. The explicit header is checked FIRST: it is how the page
 * is tested locally and how a city can be forced in production, and an
 * override that loses to inference is not an override. It is trusted for
 * nothing beyond which city name is printed in a headline.
 *
 * Never throws and never blocks a render. City-level IP geolocation is
 * roughly 60-80% accurate, and Indian mobile networks frequently resolve to
 * a circle's gateway city rather than the subscriber's own — so this is a
 * hint for copy, never a fact to route payments or tax on. No city simply
 * means the page names the country instead.
 */
export async function visitorCity(): Promise<string | null> {
  const override = (await headers()).get("x-tistra-city");
  if (override) return override;

  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const cf = (await getCloudflareContext({ async: true })).cf as { city?: unknown } | undefined;
    const city = cf?.city;
    // Guard the type as well as the presence: outside a real Worker request
    // this can be absent or a placeholder rather than a string.
    if (typeof city === "string" && city.trim()) return city;
  } catch {
    // Not running on Workers (local dev, tests).
  }
  return null;
}
