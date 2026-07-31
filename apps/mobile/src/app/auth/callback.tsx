import { useEffect, useState } from 'react';
import * as Linking from 'expo-linking';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { createSessionFromUrl } from '@/lib/oauth';

/**
 * Real screen at the OAuth redirect path (tistramobile://auth/callback),
 * rather than relying solely on WebBrowser.openAuthSessionAsync's return
 * value in src/lib/oauth.ts — Android has been observed delivering this
 * deep link straight to the app's router instead of letting the in-app
 * browser session intercept it, which previously 404'd since no screen was
 * registered here at all (matches the same fix already shipped in
 * nutriai-fresh's apps/mobile/app/auth-callback.tsx). Calling
 * createSessionFromUrl() again if oauth.ts's own flow already did is
 * harmless (same valid tokens/code), so this is safe as a fallback/primary
 * handler regardless of which path actually catches the redirect.
 *
 * Also the ONLY handler for email/password signup confirmation links
 * (signup.tsx's emailRedirectTo points here too, with no WebBrowser auth
 * session involved at all) — tapping the confirmation email link while the
 * app is already running (the common case: sign up, background the app to
 * check email, tap the link) is a warm resume, not a cold launch, so
 * getInitialURL() alone returns null and the tokens were silently dropped,
 * leaving this screen blank forever with no error. Discovered via a real
 * signup where exactly that happened. addEventListener('url', ...) below
 * covers that case; getInitialURL() stays for the genuine cold-start case
 * (app not running at all when the link is tapped).
 */
export default function AuthCallbackScreen() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleUrl(url: string) {
      createSessionFromUrl(url).catch((err) =>
        setError(err instanceof Error ? err.message : 'Sign-in did not return a valid session.')
      );
      // Successful navigation from here is handled by the auth-state
      // listener in src/lib/auth-context.tsx, not this screen.
    }

    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });

    // Covers the app-already-running case (see doc comment above) — this
    // is a plain event subscription on the incoming-URL event, distinct
    // from expo-router's own linking config (which only decides which
    // *screen* to navigate to for a deep link, not what this screen then
    // does with the URL's tokens), so it doesn't conflict with it.
    const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => subscription.remove();
  }, []);

  return (
    <ThemedView style={styles.center}>
      {error && (
        <ThemedText type="small" style={styles.error}>
          {error}
        </ThemedText>
      )}
    </ThemedView>
  );
}

const styles = {
  center: { flex: 1, justifyContent: 'center' as const, alignItems: 'center' as const },
  error: { color: '#D92D20', textAlign: 'center' as const, paddingHorizontal: Spacing.four },
};
