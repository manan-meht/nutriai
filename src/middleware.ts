import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { resolveProductFromHostname } from "@/lib/product/resolve-product";
import { isClubHost, isClubWwwHost, isLegacyCoachHost, isLocalDevHost, isClubAppPath, CLUB_CANONICAL_ORIGIN, COACH_CANONICAL_ORIGIN } from "@/lib/club/host";
import { servesCoachApp, isCoachAppPath, isPrefixedCoachAppPath } from "@/lib/coach/routes";
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
  // Tistra Club is served from the ROOT of its own hosts (tistra.club and
  // club.tistrahealth.com): a visitor sees tistra.club/coaches/<id>, never
  // the internal /club prefix the App Router actually routes on.
  //
  // Three cases, in order:
  //   1. www          -> 308 to the apex (cookies are per registrable
  //                      domain, so www and apex are separate logins)
  //   2. club host    -> a bare /club/... link is canonicalised away, and
  //                      everything else is rewritten INTO /club/...
  //   3. other hosts  -> /club/... leaves for the club's own origin, so
  //                      Tistra Health stops serving the marketplace
  //
  // Auth, API, static assets and legal pages are shared across products and
  // must resolve to their real paths on every host.
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();

  // Coaching moved off the Health domain entirely. Send the whole old host
  // across, preserving path and query so a deep link (or an in-flight OAuth
  // callback) lands where it was going.
  if (isLegacyCoachHost(host)) {
    return NextResponse.redirect(
      `${COACH_CANONICAL_ORIGIN}${request.nextUrl.pathname}${request.nextUrl.search}`,
      308
    );
  }

  if (isClubWwwHost(host)) {
    const url = request.nextUrl.clone();
    url.host = "tistra.club";
    return NextResponse.redirect(url, 308);
  }

  const { pathname } = request.nextUrl;
  const isSharedPath =
    pathname.startsWith("/api") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/terms") ||
    /\.[a-z0-9]+$/i.test(pathname); // files (favicon, images, …)

  // Coach OS from the root of the coach host, same shape as the club but
  // limited to the app's own segments — /coach also has real marketing
  // pages (/coach/india, /coach/add-users) that must keep working.
  if (servesCoachApp(host) && !isSharedPath) {
    if (isPrefixedCoachAppPath(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = pathname.slice("/coach".length);
      return NextResponse.redirect(url, 308);
    }
    if (isCoachAppPath(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = `/coach${pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  if (isClubHost(host)) {
    if (!isSharedPath) {
      // An old /club/... link (or anything that leaked the prefix) is a
      // redirect, not a rewrite — the canonical URL has to end up in the
      // address bar, or the prefix propagates through every link the page
      // then renders.
      if (pathname === "/club" || pathname.startsWith("/club/")) {
        const url = request.nextUrl.clone();
        url.pathname = pathname.slice("/club".length) || "/";
        return NextResponse.redirect(url, 308);
      }

      // The deck IS the homepage. /browse stays alive as its old address
      // so bookmarks and stale sign-in defaults land on the same place.
      if (pathname === "/browse") {
        const url = request.nextUrl.clone();
        url.pathname = "/";
        return NextResponse.redirect(url, 308);
      }

      const url = request.nextUrl.clone();
      url.pathname = pathname === "/" ? "/club/browse" : `/club${pathname}`;
      return NextResponse.rewrite(url);
    }
  } else if (isLocalDevHost(host) && !isSharedPath && isClubAppPath(pathname)) {
    // Local development: the club's clean URLs resolve here too, so a link
    // like /coaches/<id>/book works after signing in. Only the app's own
    // segments — "/" has to stay Tistra Health, since one dev server
    // cannot give the root to two products.
    const url = request.nextUrl.clone();
    url.pathname = `/club${pathname}`;
    return NextResponse.rewrite(url);
  } else if (!isLocalDevHost(host) && (pathname === "/club" || pathname.startsWith("/club/"))) {
    // The marketplace has its own home. Anyone reaching it through
    // tistrahealth.com is sent there rather than being served a second copy
    // under a different brand.
    //
    // Never in local development: one dev server answers for every product,
    // and sending /club to the production domain would make the club
    // unreachable on a laptop — the same trap the coach routes hit.
    return NextResponse.redirect(`${CLUB_CANONICAL_ORIGIN}${pathname.slice("/club".length) || "/"}${request.nextUrl.search}`, 308);
  }

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
