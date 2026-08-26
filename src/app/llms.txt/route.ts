import { headers } from "next/headers";
import { llmsTxtForHost } from "@/lib/seo/llms-txt";

/** /llms.txt, resolved per host.
 *
 * This replaced a static public/llms.txt. Files in public/ are served for
 * every host this Worker answers on, so a single file would have told
 * visitors to tistra.club and coach.tistra.club about Tistra Health — a
 * different product, audience and signup.
 *
 * Middleware already treats /llms.txt as a shared path: its file rule
 * (/\.[a-z0-9]+$/) matches any path with an extension, so the club host
 * does not rewrite this into /club/llms.txt.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const host = (await headers()).get("host");

  return new Response(llmsTxtForHost(host), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      // Cached at the edge but revalidated often — this is documentation
      // about a live marketplace, and a day-stale roster description is
      // the kind of small wrongness that costs citations.
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
