import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useLocalSearchParams } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { scopedEmail } from '@/lib/auth';
import { signInWithProvider, type OAuthProvider } from '@/lib/oauth';
import { GoogleIcon, FacebookIcon } from '@/components/brand-icons';

type Product = 'self' | 'family' | 'coach';

// Which scoped Supabase account (see lib/auth.ts#scopedEmail) each product
// choice signs into, and the subtitle copy for it — mirrors
// nutriai-fresh's apps/mobile/app/login/{self,family,coach}.tsx, which are
// three thin per-product wrappers around one shared form there; kept as
// one parameterized screen here instead since expo-router's params already
// give us the same effect without three near-identical route files.
const PRODUCT_CONFIG: Record<Product, { scopeAs: 'adults' | 'gym'; subtitle: string }> = {
  self: { scopeAs: 'adults', subtitle: 'Sign in to track your own meals' },
  family: { scopeAs: 'adults', subtitle: 'Sign in to your family account' },
  coach: { scopeAs: 'gym', subtitle: 'Sign in to your coaching account' },
};

export default function LoginScreen() {
  const theme = useTheme();
  const { product } = useLocalSearchParams<{ product?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
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

  async function handleOAuth(provider: OAuthProvider) {
    setError(null);
    setOauthLoading(provider);
    try {
      await signInWithProvider(provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setOauthLoading(null);
    }
  }

  const anyLoading = loading || oauthLoading !== null;

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
});
