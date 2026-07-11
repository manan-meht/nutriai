import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

// This app is deployed as its own Cloudflare Pages project, separate from
// the main nutriai-fresh web app, specifically so its Worker bundle has its
// own independent size budget — see apps/mobile-api/README.md. It never
// runs in a browser/cookie context, so unlike the main app's
// src/lib/supabase/server.ts, there is no cookie-based client here at all
// — every request is bearer-token authenticated.

/** Service-role client — bypasses RLS. Used only for the workspace
 * lookup/creation, which (same as the main app) has no RLS policy for the
 * owner to read their own workspace row. */
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Validates the mobile app's `Authorization: Bearer <access_token>` against
 * Supabase Auth via a getUser() round-trip (never trusts the JWT locally),
 * returning a request-scoped, RLS-respecting client alongside the user.
 * Returns null if there's no token or it doesn't validate.
 */
export async function getUserFromBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;

  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  return { user, supabase };
}
