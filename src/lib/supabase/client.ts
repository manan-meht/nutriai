import { createBrowserClient } from "@supabase/ssr";
import { getCookieDomain } from "./cookie-domain";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        domain: getCookieDomain(typeof window !== "undefined" ? window.location.hostname : undefined),
        // Explicit rather than relying on library defaults: the PKCE
        // code-verifier cookie set here must survive the top-level
        // redirect back from the OAuth provider (Google/Facebook), which
        // is a cross-site navigation from the browser's point of view.
        // SameSite=Strict would silently drop it on that return trip,
        // producing "PKCE code verifier not found in storage" even though
        // the flow started and ended in the same browser.
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    }
  );
}
