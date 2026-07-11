export const runtime = "edge";

import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

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
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("[auth/callback] exchangeCodeForSession failed:", error.message);
    return NextResponse.redirect(`${origin}/auth/error?reason=exchange&detail=${encodeURIComponent(error.message)}`);
  }

  console.error("[auth/callback] no code and no provider error in callback URL:", request.url);
  return NextResponse.redirect(`${origin}/auth/error?reason=missing_code`);
}
