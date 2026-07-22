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

  // /adults/login, /gym/login, /adults/signup, /gym/signup used to each be
  // their own full page (duplicating the shared /login and /signup pages'
  // entire AuthForm render) — that duplication alone cost ~1.3-1.5 MB per
  // route as a separate Cloudflare Pages Function, which helped push the
  // whole deployment's aggregate Functions size over the 25 MiB limit.
  // Handling the redirect here instead costs nothing extra (middleware is
  // already one shared Function on every request) and removes those 4
  // routes entirely.
  const productLoginSignupMatch = request.nextUrl.pathname.match(/^\/(adults|gym)\/(login|signup)\/?$/);
  if (productLoginSignupMatch) {
    const [, product, mode] = productLoginSignupMatch;
    const url = request.nextUrl.clone();
    url.pathname = `/${mode}`;
    url.searchParams.set("product", product);
    return NextResponse.redirect(url);
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

  // Remember which product's dashboard the visitor actually used most
  // recently — an account can legitimately own both a gym and an adults
  // workspace (Google/Facebook OAuth isn't scoped per-product the way
  // scopedEmail() scopes password sign-in), so getDashboardHrefForUser
  // can't tell which one "My Dashboard" should mean from the account
  // alone. This cookie gives it a real signal instead of guessing via
  // "oldest workspace". Scoped to the dashboard routes themselves (not
  // login/signup/marketing pages) so it only updates on an actual visit.
  if (request.nextUrl.pathname.startsWith("/adults/dashboard")) {
    response.cookies.set("tistra_last_product", "adults", {
      maxAge: 60 * 60 * 24 * 365,
      httpOnly: false,
      sameSite: "lax",
      path: "/",
    });
  } else if (request.nextUrl.pathname.startsWith("/gym/dashboard")) {
    response.cookies.set("tistra_last_product", "gym", {
      maxAge: 60 * 60 * 24 * 365,
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
