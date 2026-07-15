import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { supabase } from "./supabase";

// Lets the in-app browser session close itself and hand control back to
// the app once Supabase redirects to our deep link — without this, the
// browser tab/sheet can be left open after a successful sign-in.
WebBrowser.maybeCompleteAuthSession();

export type OAuthProvider = "google" | "facebook";

/**
 * Native OAuth flow: the web app's src/components/auth/AuthForm.tsx uses
 * supabase.auth.signInWithOAuth() with a plain redirectTo and lets the
 * browser navigate there directly, because a browser has somewhere to
 * navigate back TO. There's no such page here — instead this gets the
 * provider's authorize URL with skipBrowserRedirect, opens it in an
 * in-app browser session via expo-web-browser (which knows how to catch
 * the redirect back to our own tistramobile:// deep link), then manually
 * finishes the session from whatever Supabase put in that redirect URL —
 * mirroring what the web app's src/app/auth/callback/route.ts does
 * server-side, just done client-side here since there's no server leg.
 */
export async function signInWithProvider(provider: OAuthProvider): Promise<void> {
  const redirectTo = Linking.createURL("auth/callback");

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error("No OAuth URL returned by Supabase.");

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") {
    // "cancel"/"dismiss" — the user closed the browser sheet themselves;
    // not an error worth surfacing as one.
    return;
  }

  await createSessionFromUrl(result.url);
}

/** Exported for src/app/auth/callback.tsx — see that file for why. */
export async function createSessionFromUrl(url: string) {
  const parsed = Linking.parse(url);

  // PKCE flow: redirect carries ?code=... — matches how the web app's own
  // callback route calls exchangeCodeForSession (see
  // src/app/auth/callback/route.ts in the main repo). The code verifier is
  // tracked internally by the supabase-js client instance that started the
  // flow, same client this runs against, so no separate storage handoff is
  // needed the way the web app's cookie-based PKCE verifier is.
  const code = parsed.queryParams?.code;
  if (typeof code === "string") {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return;
  }

  // Implicit flow fallback: tokens arrive in the URL fragment instead.
  const hashParams = new URLSearchParams(url.split("#")[1] ?? "");
  const access_token = hashParams.get("access_token");
  const refresh_token = hashParams.get("refresh_token");
  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) throw error;
    return;
  }

  throw new Error("OAuth redirect did not include a session code or tokens.");
}
