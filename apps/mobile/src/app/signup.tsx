import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { Redirect, router, useLocalSearchParams } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { scopedEmail } from '@/lib/auth';
import { signInWithProvider, type OAuthProvider } from '@/lib/oauth';
import { GoogleIcon, FacebookIcon } from '@/components/brand-icons';

type Product = 'self' | 'family' | 'coach';

// Same product -> scoped-account mapping as login.tsx.
const PRODUCT_CONFIG: Record<Product, { scopeAs: 'adults' | 'gym'; subtitle: string }> = {
  self: { scopeAs: 'adults', subtitle: 'Create an account to track your own meals' },
  family: { scopeAs: 'adults', subtitle: 'Create a family account' },
  coach: { scopeAs: 'gym', subtitle: 'Create a coaching account' },
};

export default function SignupScreen() {
  const theme = useTheme();
  const { product } = useLocalSearchParams<{ product?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  // Reachable directly (deep link, back navigation) without having gone
  // through /select-product first — send back there rather than guessing
  // which scoped account to create.
  if (!product || !(product in PRODUCT_CONFIG)) {
    return <Redirect href="/select-product" />;
  }
  const { scopeAs, subtitle } = PRODUCT_CONFIG[product as Product];

  async function handleSignUp() {
    setError(null);
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: scopedEmail(email, scopeAs),
        password,
        options: { emailRedirectTo: Linking.createURL('auth/callback') },
      });
      if (error) throw error;
      // Supabase doesn't error on a duplicate email sign-up (avoids leaking
      // which emails have accounts) — it silently "succeeds" without
      // sending anything. The tell is an empty identities array on the
      // returned user, since no new identity was actually created. Mirrors
      // the same check in the web app's src/components/auth/AuthForm.tsx.
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        setError('An account with this email already exists. Please sign in instead.');
        return;
      }
      setEmailSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-up failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: OAuthProvider) {
    setError(null);
    setOauthLoading(provider);
    try {
      await signInWithProvider(provider);
      // Session change is picked up by AuthProvider's onAuthStateChange
      // listener — the root layout handles redirecting once it does.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-up failed.');
    } finally {
      setOauthLoading(null);
    }
  }

  const anyLoading = loading || oauthLoading !== null;

  if (emailSent) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText style={styles.emailSentEmoji}>📬</ThemedText>
          <ThemedText type="title" style={styles.title}>
            Check your email
          </ThemedText>
          <ThemedText type="default" themeColor="textSecondary" style={styles.subtitle}>
            We sent a confirmation link to {email}. Tap it on this device to activate your account.
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

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
          placeholder="Password (at least 8 characters)"
          placeholderTextColor={theme.textSecondary}
          secureTextEntry
          autoComplete="new-password"
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
          style={[styles.button, styles.primaryButton, (anyLoading || password.length < 8 || !email) && styles.disabled]}
          onPress={handleSignUp}
          disabled={anyLoading || password.length < 8 || !email}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.primaryButtonText}>Create account</ThemedText>}
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

        <Pressable
          style={styles.switchLink}
          onPress={() => router.replace({ pathname: '/login', params: { product } })}
          disabled={anyLoading}
        >
          <ThemedText type="default" themeColor="textSecondary" style={styles.switchLinkText}>
            Already have an account? <ThemedText style={styles.switchLinkAccent}>Sign in</ThemedText>
          </ThemedText>
        </Pressable>

        <ThemedText type="small" themeColor="textSecondary" style={styles.disclaimer}>
          Tistra Health is a tracking and awareness tool only. It does not provide medical advice, diagnosis,
          treatment, or personalized nutrition therapy. For any health, diet, medical condition, medication, or
          nutrition concern, please consult a qualified healthcare professional.
        </ThemedText>
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
  disclaimer: {
    textAlign: 'center',
    lineHeight: 16,
  },
  emailSentEmoji: {
    fontSize: 40,
    textAlign: 'center',
  },
});
