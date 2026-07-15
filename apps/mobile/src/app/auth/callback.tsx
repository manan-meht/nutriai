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
 */
export default function AuthCallbackScreen() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // expo-router's own NavigationContainer already listens for incoming
    // URLs to route here in the first place — a second
    // Linking.addEventListener subscription on top of that trips React
    // Navigation's "linking configured in multiple places" warning/error.
    // getInitialURL() alone is a one-time getter, not a subscription, so
    // it's safe to call here, and gives back the full URL (fragment
    // included) that createSessionFromUrl needs, unlike route params.
    Linking.getInitialURL().then((url) => {
      if (!url) return;
      createSessionFromUrl(url).catch((err) =>
        setError(err instanceof Error ? err.message : 'Sign-in did not return a valid session.')
      );
      // Successful navigation from here is handled by the auth-state
      // listener in src/lib/auth-context.tsx, not this screen.
    });
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
