import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getCookieDomain } from "./cookie-domain";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // See src/lib/supabase/client.ts for why sameSite/secure are set
      // explicitly rather than left to library defaults.
      cookieOptions: {
        domain: getCookieDomain(request.nextUrl.hostname),
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session without blocking navigation
  const { error } = await supabase.auth.getUser();

  // Stale/invalid refresh token cookie (e.g. after a DB reset or manual
  // session revocation): clear it so the client re-auths instead of
  // erroring on every subsequent request.
  if (error?.code === "refresh_token_not_found") {
    await supabase.auth.signOut();
  }

  return supabaseResponse;
}
