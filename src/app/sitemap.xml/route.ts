import { headers } from "next/headers";
import { siteForHost, sitemapEntriesFor } from "@/lib/seo/site-routes";

/** sitemap.xml, resolved per host.
 *
 * Replaces app/sitemap.ts for the same reason as robots: a metadata route
 * cannot see the host, so tistra.club/sitemap.xml listed tistrahealth.com
 * URLs and no club page appeared in any sitemap at all.
 *
 * The club sitemap includes every published, non-demo coach profile — the
 * pages that answer "who teaches this in Singapore and what does it cost".
 */
export const dynamic = "force-dynamic";

/** XML text escaping. URLs here are our own and contain UUIDs, but a
 * sitemap that can be broken by one stray ampersand is not worth the
 * saved three lines. */
function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const site = siteForHost((await headers()).get("host"));
  const entries = await sitemapEntriesFor(site);

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map((e) =>
      [
        "  <url>",
        `    <loc>${xml(e.url)}</loc>`,
        ...(e.lastModified ? [`    <lastmod>${xml(e.lastModified)}</lastmod>`] : []),
        "  </url>",
      ].join("\n")
    ),
    "</urlset>",
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
