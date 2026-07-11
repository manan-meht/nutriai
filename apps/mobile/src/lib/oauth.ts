import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { supabase } from "./supabase";

export type OAuthProvider = "google" | "facebook";

// Redirects back into the app via the custom scheme set in app.json
// ("tistrahealth"). Must be registered as an authorized redirect URI in
// both the Supabase project's Auth settings AND the corresponding OAuth
// app configuration (Google Cloud Console / Facebook Developers) — see
// apps/mobile/README.md for the exact setup steps.
const redirectTo = Linking.createURL("auth-callback");

/**
 * Signs in with Google or Facebook via an in-app browser session, mirroring
 * the web app's OAuth flow (see src/components/auth/AuthForm.tsx) but
 * using expo-web-browser's auth session instead of a same-tab redirect,
 * since there's no browser navigation to redirect within on native.
 *
 * Supabase's own OAuth callback (https://<project>.supabase.co/auth/v1/callback)
 * handles the actual provider exchange server-side; this only needs to
 * catch the FINAL redirect back to our custom scheme, which arrives with
 * the session tokens in the URL fragment.
 */
export async function signInWithOAuthProvider(provider: OAuthProvider): Promise<void> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error("No OAuth URL returned.");

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success" || !result.url) {
    if (result.type === "cancel" || result.type === "dismiss") return; // user closed the browser
    throw new Error("Sign-in was not completed.");
  }

  const params = new URLSearchParams(result.url.split("#")[1] ?? result.url.split("?")[1] ?? "");
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) {
    throw new Error("Sign-in did not return a valid session.");
  }

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (sessionError) throw sessionError;
  // Navigation after a successful session is handled by the auth-state
  // listener in app/_layout.tsx, same as the email/password flow.
}
