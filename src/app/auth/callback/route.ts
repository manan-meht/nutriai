export const runtime = "edge";

import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { getCookieDomain } from "@/lib/supabase/cookie-domain";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  // The provider (Google/Facebook) itself can redirect here with an error
  // instead of a code — e.g. the user denied access, or the provider is
  // misconfigured on Supabase's side. Previously silently fell through to
  // the generic "almost there, sign in with email/password" page with no
  // logging at all, which is actively wrong advice for an OAuth-only
  // account and gave no way to diagnose a real provider-side failure.
  const providerError = searchParams.get("error_description") ?? searchParams.get("error");
  if (providerError) {
    console.error("[auth/callback] provider returned an error:", providerError);
    return NextResponse.redirect(`${origin}/auth/error?reason=provider&detail=${encodeURIComponent(providerError)}`);
  }

  if (code) {
    // Deliberately not using src/lib/supabase/server.ts's shared
    // createClient() here — that one reads/writes cookies via
    // next/headers's cookies(), whose `set()` silently no-ops outside a
    // Server Action/Route Handler context (see its own try/catch, added
    // for Server Component reads). In principle a Route Handler *can*
    // write cookies through that API, but under this app's edge runtime
    // (@cloudflare/next-on-pages) that write wasn't reliably landing on
    // the NextResponse.redirect() actually returned below — Google OAuth
    // sign-in would succeed (exchangeCodeForSession returned no error) but
    // the session cookie never made it to the browser, so the very next
    // request back to the dashboard saw no session and bounced to login.
    // Binding the Supabase client directly to this response's own
    // `.cookies.set(...)` guarantees the Set-Cookie headers are attached
    // to the exact response object being returned, independent of any
    // request-scoped cookie-store plumbing.
    const response = NextResponse.redirect(`${origin}${next}`);
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookieOptions: {
          domain: getCookieDomain(request.headers.get("host")),
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
        },
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return response;
    }
    console.error("[auth/callback] exchangeCodeForSession failed:", error.message);
    return NextResponse.redirect(`${origin}/auth/error?reason=exchange&detail=${encodeURIComponent(error.message)}`);
  }

  console.error("[auth/callback] no code and no provider error in callback URL:", request.url);
  return NextResponse.redirect(`${origin}/auth/error?reason=missing_code`);
}
