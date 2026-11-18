import { NextResponse, type NextRequest } from "next/server";

// Nutrition Guidance for the app, forwarded to the web app.
//
// Guidance's logic (screening, targets, the release gate, the one
// aggregation service, suggestions, habits, vitamins and minerals) lives in
// the main web app and isn't duplicated here: this app's copies of web code
// drift (see food-library.ts). Instead these routes forward to the web
// app's JSON API (src/app/api/mobile/guidance) with the caller's own
// bearer token, which the web app validates again and authorizes exactly
// as it does for its own pages.
//
//   GET  /adults/contacts/:id/guidance          -> GET  /api/mobile/guidance/state
//   POST /adults/contacts/:id/guidance/:op      -> POST /api/mobile/guidance/:op
//   (and the same under /gym/clients/:id/guidance)
//
// Folded into the existing catch-all routes rather than new route files:
// each route file costs fixed Worker bundle size in this app.

const WEB_ORIGIN = () => (process.env.GUIDANCE_API_ORIGIN || "https://tistrahealth.com").replace(/\/$/, "");

/** ["contacts", id, "guidance", ...op] (adults) or ["clients", id, "guidance", ...op] (gym). */
export function guidancePath(path: string[], collection: "contacts" | "clients"): { contactId: string; op: string[] } | null {
  if (path.length < 3 || path[0] !== collection || path[2] !== "guidance") return null;
  return { contactId: path[1], op: path.slice(3) };
}

export async function forwardGuidance(
  request: NextRequest,
  target: { contactType: "adults" | "gym"; contactId: string; op: string[] }
): Promise<Response> {
  const authorization = request.headers.get("authorization");
  if (!authorization) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const headers = { authorization, "content-type": "application/json", accept: "application/json" };

  let upstream: Response;
  try {
    if (request.method === "GET") {
      if (target.op.length !== 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const qs = new URLSearchParams({ type: target.contactType, id: target.contactId });
      upstream = await fetch(`${WEB_ORIGIN()}/api/mobile/guidance/state?${qs}`, { headers });
    } else {
      if (target.op.length !== 1) return NextResponse.json({ error: "Not found" }, { status: 404 });
      let body: Record<string, unknown> = {};
      try {
        const parsed = await request.json();
        if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
      } catch {
        // An empty body is fine for ops that take no input ("off").
      }
      upstream = await fetch(`${WEB_ORIGIN()}/api/mobile/guidance/${encodeURIComponent(target.op[0])}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...body, type: target.contactType, id: target.contactId }),
      });
    }
  } catch {
    return NextResponse.json({ error: "Guidance is unavailable right now." }, { status: 502 });
  }
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json", "cache-control": "no-store" },
  });
}
