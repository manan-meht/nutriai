import { createBrowserClient } from "@supabase/ssr";
import { getCookieDomain } from "./cookie-domain";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        domain: getCookieDomain(typeof window !== "undefined" ? window.location.hostname : undefined),
      },
    }
  );
}
