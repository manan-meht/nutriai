import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router, useLocalSearchParams } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import { useColorScheme } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { scopedEmail } from '@/lib/auth';
import { signInWithProvider, type OAuthProvider } from '@/lib/oauth';
import { signInWithApple, AppleSignInCancelled } from '@/lib/apple-auth';
import { AppleSignInButton } from '@/components/apple-sign-in-button';
import { clearPendingProductSelection, setPendingProductSelection } from '@/lib/product-intent';
import { clearLastDashboardChoice, saveLastDashboardChoice } from '@/lib/product-choice';
import { GoogleIcon, FacebookIcon } from '@/components/brand-icons';

type Product = 'self' | 'family' | 'coach';

// Which scoped Supabase account (see lib/auth.ts#scopedEmail) each product
// choice signs into, and the subtitle copy for it. One parameterized
// screen rather than a route file per product, since expo-router's params
// already give the same effect.
//
// 'coach' is sign-in only, reached from select-product.tsx's "Coach? Sign
// in here" card: it signs into the same unscoped account coach.tistra.club
// uses, whose gym workspace opens the app's coach view. It was removed in
// Aug 2026 when the app had no coach view, and came back with it. There is
// still no coach sign-up here (see signup.tsx) — coach accounts are created
// on the web.
const PRODUCT_CONFIG: Record<Product, { scopeAs: 'adults' | 'gym'; subtitle: string }> = {
  self: { scopeAs: 'adults', subtitle: 'Sign in to track your own meals' },
  family: { scopeAs: 'adults', subtitle: 'Sign in to your family account' },
  coach: { scopeAs: 'gym', subtitle: 'Sign in to your coaching account' },
};

/** What (app)/index.tsx should act on once signed in, written right before
 * every sign-in method. A self/family pick is the usual hand-off (see
 * lib/product-intent.ts). The coach entry instead records no pick — so
 * signing in can never create a workspace — and remembers the coach view,
 * which only opens if the account owns a gym workspace. */
async function rememberEntry(product: Product): Promise<void> {
  if (product === 'coach') {
    await clearPendingProductSelection();
    await saveLastDashboardChoice('gym');
  } else {
    await setPendingProductSelection(product);
    await clearLastDashboardChoice();
  }
}

export default function LoginScreen() {
  const theme = useTheme();
  // Apple's button must contrast with the background it sits on, so it
  // needs the scheme itself, which useTheme resolves away.
  const scheme = useColorScheme();
  const colorScheme = scheme === 'dark' ? 'dark' : 'light';
  const { product } = useLocalSearchParams<{ product?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const [appleLoading, setAppleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reachable directly (deep link, back navigation) without having gone
  // through /select-product first — send back there rather than guessing
  // which scoped account to sign in to.
  if (!product || !(product in PRODUCT_CONFIG)) {
    return <Redirect href="/select-product" />;
  }
  const { scopeAs, subtitle } = PRODUCT_CONFIG[product as Product];

  async function handlePasswordSignIn() {
    setError(null);
    setLoading(true);
    try {
      await rememberEntry(product as Product);
      const { error } = await supabase.auth.signInWithPassword({
        email: scopedEmail(email, scopeAs),
        password,
      });
      if (error) throw error;
      // Session change is picked up by AuthProvider's onAuthStateChange
      // listener — the root layout handles redirecting once it does.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleApple() {
    setError(null);
    setAppleLoading(true);
    try {
      // Same product-intent write the other providers do before handing
      // off — see lib/product-intent.ts.
      await rememberEntry(product as Product);
      await signInWithApple();
    } catch (err) {
      // Dismissing Apple's sheet is not an error worth showing.
      if (err instanceof AppleSignInCancelled) return;
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setAppleLoading(false);
    }
  }

  async function handleOAuth(provider: OAuthProvider) {
    setError(null);
    setOauthLoading(provider);
    try {
      // Re-persist the product choice right before handing off to the
      // external OAuth browser (see lib/product-intent.ts) — reachable here
      // reliably via the route param regardless of whether
      // select-product.tsx's own write already landed.
      await rememberEntry(product as Product);
      await signInWithProvider(provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setOauthLoading(null);
    }
  }

  const anyLoading = loading || oauthLoading !== null || appleLoading;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Tistra Health
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.subtitle}>
          {subtitle}
        </ThemedText>

        <TextInput
          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          placeholder="Email"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          editable={!anyLoading}
        />
        <TextInput
          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          placeholder="Password"
          placeholderTextColor={theme.textSecondary}
          secureTextEntry
          autoComplete="password"
          value={password}
          onChangeText={setPassword}
          editable={!anyLoading}
        />

        {error && (
          <ThemedText type="small" style={styles.error}>
            {error}
          </ThemedText>
        )}

        <Pressable
          style={[styles.button, styles.primaryButton, anyLoading && styles.disabled]}
          onPress={handlePasswordSignIn}
          disabled={anyLoading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.primaryButtonText}>Sign in</ThemedText>}
        </Pressable>

        <ThemedView type="backgroundElement" style={styles.divider} />

        <AppleSignInButton
          mode="signIn"
          onPress={handleApple}
          loading={appleLoading}
          disabled={anyLoading}
          colorScheme={colorScheme}
        />

        <Pressable
          style={[styles.button, styles.oauthButton, { borderColor: theme.backgroundSelected }, anyLoading && styles.disabled]}
          onPress={() => handleOAuth('google')}
          disabled={anyLoading}
        >
          {oauthLoading === 'google' ? (
            <ActivityIndicator color={theme.text} />
          ) : (
            <>
              <GoogleIcon />
              <ThemedText style={styles.oauthButtonText}>Continue with Google</ThemedText>
            </>
          )}
        </Pressable>

        <Pressable
          style={[styles.button, styles.oauthButton, { borderColor: theme.backgroundSelected }, anyLoading && styles.disabled]}
          onPress={() => handleOAuth('facebook')}
          disabled={anyLoading}
        >
          {oauthLoading === 'facebook' ? (
            <ActivityIndicator color={theme.text} />
          ) : (
            <>
              <FacebookIcon />
              <ThemedText style={styles.oauthButtonText}>Continue with Facebook</ThemedText>
            </>
          )}
        </Pressable>

        {product === 'coach' ? (
          // No coach sign-up in this app; no link either — creating the
          // account on the web leads into Coach plan checkout.
          <ThemedText type="small" themeColor="textSecondary" style={styles.switchLinkText}>
            New to coaching? Coach accounts are set up in Coach OS on the web.
          </ThemedText>
        ) : (
          <Pressable
            style={styles.switchLink}
            onPress={() => router.replace({ pathname: '/signup', params: { product } })}
            disabled={anyLoading}
          >
            <ThemedText type="default" themeColor="textSecondary" style={styles.switchLinkText}>
              Don&apos;t have an account? <ThemedText style={styles.switchLinkAccent}>Create one</ThemedText>
            </ThemedText>
          </Pressable>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: Spacing.three,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  button: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#5715CE',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  oauthButton: {
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.two,
  },
  oauthButtonText: {
    fontWeight: '600',
  },
  divider: {
    height: 1,
    marginVertical: Spacing.two,
  },
  disabled: {
    opacity: 0.6,
  },
  error: {
    color: '#D92D20',
    textAlign: 'center',
  },
  switchLink: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  switchLinkText: {
    textAlign: 'center',
  },
  switchLinkAccent: {
    color: '#5715CE',
    fontWeight: '600',
  },
});
