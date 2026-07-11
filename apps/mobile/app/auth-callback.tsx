import { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import * as Linking from "expo-linking";
import { supabase } from "../src/lib/supabase";

function extractTokens(url: string): { accessToken: string | null; refreshToken: string | null } {
  const fragment = url.split("#")[1] ?? "";
  const query = url.split("?")[1]?.split("#")[0] ?? "";
  const params = new URLSearchParams(fragment || query);
  return { accessToken: params.get("access_token"), refreshToken: params.get("refresh_token") };
}

/**
 * Real screen at the OAuth redirect path (tistrahealth://auth-callback),
 * rather than relying solely on WebBrowser.openAuthSessionAsync's return
 * value in src/lib/oauth.ts — Android has been observed delivering this
 * deep link straight to the app's router instead of letting the in-app
 * browser session intercept it, which previously 404'd since no screen
 * was registered here at all. Calling setSession() again if oauth.ts
 * already did is harmless (same valid tokens), so this is safe as a
 * fallback/primary handler regardless of which path actually catches the
 * redirect.
 */
export default function AuthCallbackScreen() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function handle(url: string | null) {
      if (!url) return;
      const { accessToken, refreshToken } = extractTokens(url);
      if (!accessToken || !refreshToken) {
        setError("Sign-in did not return a valid session.");
        return;
      }
      const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (error) setError(error.message);
      // Successful navigation from here is handled by the auth-state
      // listener in app/_layout.tsx, not this screen.
    }

    Linking.getInitialURL().then(handle);
    const subscription = Linking.addEventListener("url", ({ url }) => handle(url));
    return () => subscription.remove();
  }, []);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#6750A4" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" },
  error: { color: "#c00", padding: 20, textAlign: "center" },
});
