import { type NextRequest } from "next/server";
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
