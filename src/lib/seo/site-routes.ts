import { createServiceClient } from "@/lib/supabase/server";
import { CLUB_URL } from "./club-structured-data";
import { SITE_URL as HEALTH_URL } from "./structured-data";

/** Which site a request host belongs to, and what belongs in its sitemap.
 *
 * One Worker answers for three products on three domains. The previous
 * robots.ts/sitemap.ts were Next metadata conventions, which cannot read
 * the request host — so every host served Tistra Health's route list, and
 * tistra.club/robots.txt pointed crawlers at tistrahealth.com/sitemap.xml.
 * Not one club URL appeared in any sitemap, including the coach profile
 * pages, which are the only pages here worth ranking.
 */

export type SiteKind = "health" | "club" | "coach";

export const COACH_URL = "https://coach.tistra.club";

export function siteForHost(hostname: string | null | undefined): SiteKind {
  const host = (hostname ?? "").split(":")[0].toLowerCase();
  if (host === "coach.tistra.club" || host === "coach.tistrahealth.com" || host.startsWith("coach.")) {
    return "coach";
  }
  if (host === "tistra.club" || host === "www.tistra.club" || host.endsWith(".tistra.club")) {
    return "club";
  }
  return "health";
}

export function originFor(site: SiteKind): string {
  return site === "club" ? CLUB_URL : site === "coach" ? COACH_URL : HEALTH_URL;
}

const HEALTH_ROUTES = [
  "/",
  "/family",
  "/family/india",
  "/family/add-users",
  "/coach",
  "/coach/india",
  "/coach/add-users",
  "/me",
  "/me/india",
  "/me/add-users",
  "/pricing",
  "/privacy",
  "/terms",
];

const CLUB_STATIC_ROUTES = ["/", "/coaches", "/privacy", "/terms"];
const COACH_ROUTES = ["/", "/privacy", "/terms"];

export interface SitemapEntry {
  url: string;
  lastModified?: string;
}

/** Published, non-demo coach profiles.
 *
 * Never throws: a sitemap that 500s is worse than one missing the dynamic
 * half, and this runs on a public unauthenticated route. Demo profiles are
 * excluded — they are labelled examples, and submitting invented people to
 * a search engine as canonical pages is not something to do by accident.
 */
async function clubCoachEntries(): Promise<SitemapEntry[]> {
  try {
    const admin = createServiceClient();
    const { data } = await admin
      .from("coach_profiles")
      .select("id, updated_at")
      .eq("status", "published")
      .eq("is_demo", false);

    return ((data ?? []) as { id: string; updated_at: string | null }[]).map((c) => ({
      url: `${CLUB_URL}/coaches/${c.id}`,
      lastModified: c.updated_at ?? undefined,
    }));
  } catch {
    return [];
  }
}

export async function sitemapEntriesFor(site: SiteKind): Promise<SitemapEntry[]> {
  const now = new Date().toISOString();
  const origin = originFor(site);

  if (site === "club") {
    const statics = CLUB_STATIC_ROUTES.map((r) => ({ url: `${origin}${r}`, lastModified: now }));
    return [...statics, ...(await clubCoachEntries())];
  }

  const routes = site === "coach" ? COACH_ROUTES : HEALTH_ROUTES;
  return routes.map((r) => ({ url: `${origin}${r}`, lastModified: now }));
}
