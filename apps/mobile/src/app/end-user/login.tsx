import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { endUserApi, EndUserApiError } from '@/lib/end-user-api';

// Entry point for a participant/tracked contact — not a caregiver/coach
// Supabase Auth login (see login.tsx for that). Mirrors the web app's
// /my-progress entry form (MyProgressEntryForm.tsx): enter a WhatsApp
// number, get a 6-digit code via WhatsApp, verify it on the next screen.
export default function EndUserLoginScreen() {
  const theme = useTheme();
  const [number, setNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await endUserApi.requestOtp(number);
      router.push({ pathname: '/end-user/verify', params: { number } });
    } catch (err) {
      setError(err instanceof EndUserApiError ? err.message : "Couldn't send a code right now. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          I was invited
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.subtitle}>
          Sign in with WhatsApp to view your private Tistra Health dashboard.
        </ThemedText>
        <TextInput
          style={[styles.input, { borderColor: theme.backgroundSelected, color: theme.text }]}
          placeholder="Your WhatsApp number, e.g. +65 9123 4567"
          placeholderTextColor={theme.textSecondary}
          keyboardType="phone-pad"
          autoComplete="tel"
          value={number}
          onChangeText={setNumber}
        />
        {error && (
          <ThemedText type="small" style={styles.error}>
            {error}
          </ThemedText>
        )}
        <Pressable
          style={[styles.button, { backgroundColor: '#5715CE', opacity: submitting || !number ? 0.5 : 1 }]}
          disabled={submitting || !number}
          onPress={handleSubmit}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.buttonText}>Send me a code</ThemedText>}
        </Pressable>
        <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
          No app account needed — just your WhatsApp number.
        </ThemedText>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.four },
  title: { textAlign: 'center', marginBottom: Spacing.two, alignSelf: 'center', width: '100%', maxWidth: MaxContentWidth },
  subtitle: { textAlign: 'center', marginBottom: Spacing.four, alignSelf: 'center', width: '100%', maxWidth: MaxContentWidth },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
    marginBottom: Spacing.three,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  error: { color: '#DC2626', textAlign: 'center', marginBottom: Spacing.two, alignSelf: 'center', width: '100%', maxWidth: MaxContentWidth },
  button: {
    borderRadius: 999,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  footnote: { textAlign: 'center', marginTop: Spacing.three, alignSelf: 'center', width: '100%', maxWidth: MaxContentWidth },
});
