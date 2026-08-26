import { headers } from "next/headers";
import { siteForHost, originFor } from "@/lib/seo/site-routes";

/** robots.txt, resolved per host.
 *
 * Replaces app/robots.ts, which was a Next metadata route and so could not
 * read the request host — every domain served the same file, pointing at
 * tistrahealth.com/sitemap.xml even on tistra.club.
 *
 * NOTE: on the tistra.club zone, Cloudflare's managed robots.txt feature
 * prepends its own block to this output, and that block currently sends
 * Disallow: / to GPTBot, ClaudeBot, Google-Extended, CCBot and others.
 * Nothing here can override it — it is a zone setting, not app output.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const site = siteForHost((await headers()).get("host"));
  const origin = originFor(site);

  const body = [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
