import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { resolveProductFromHostname } from "@/lib/product/resolve-product";
import {
  parseAssignmentCookie,
  createNewAssignment,
  serializeAssignment,
  getCookieName,
  getLandingSelectionMode,
  ASSIGNMENT_COOKIE_MAX_AGE,
} from "@/lib/experiments/landing-page-experiment";

export async function middleware(request: NextRequest) {
  // The PKCE code exchange in /auth/callback is the most fragile moment of
  // the auth flow — it depends on a code-verifier cookie that was just set
  // moments ago surviving untouched. updateSession() below calls
  // supabase.auth.getUser(), which (for a visitor with a stale/invalid
  // session cookie left over from a previous login — e.g. after switching
  // accounts) can trigger a token refresh/cookie rewrite of its own,
  // racing with the callback route's own cookie read for no benefit: there
  // is no existing session to refresh usefully on a route whose entire job
  // is exchanging a fresh code for a new one. Skip it here (and on
  // /auth/error, which has nothing session-dependent to refresh either).
  if (request.nextUrl.pathname.startsWith("/auth/callback") || request.nextUrl.pathname.startsWith("/auth/error")) {
    return NextResponse.next();
  }

  const response = await updateSession(request);

  // Set landing experiment cookie if not already present.
  // Middleware is the correct place to write cookies in the App Router.
  const hostname = request.headers.get("host") ?? "localhost:3000";
  const searchParams = new URLSearchParams(request.nextUrl.search);
  const product = resolveProductFromHostname(hostname, searchParams) ?? "gym";
  const cookieName = getCookieName(product);

  if (!request.cookies.get(cookieName)) {
    const mode = getLandingSelectionMode(product);
    const assignment = createNewAssignment(product, mode);
    response.cookies.set(cookieName, serializeAssignment(assignment), {
      maxAge: ASSIGNMENT_COOKIE_MAX_AGE,
      httpOnly: false,
      sameSite: "lax",
      path: "/",
    });
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
