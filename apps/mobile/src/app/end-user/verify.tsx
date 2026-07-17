import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import * as Device from 'expo-device';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { endUserApi, EndUserApiError } from '@/lib/end-user-api';
import { saveEndUserSession } from '@/lib/end-user-session';

export default function EndUserVerifyScreen() {
  const theme = useTheme();
  const { number } = useLocalSearchParams<{ number?: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!number) {
    return <Redirect href="/end-user/login" />;
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const result = await endUserApi.verifyOtp(number!, code, Device.modelName ?? undefined);
      await saveEndUserSession(result.sessionToken, {
        contactId: result.contactId,
        contactType: result.contactType,
        fullName: result.fullName,
      });
      router.replace('/end-user/dashboard');
    } catch (err) {
      setError(err instanceof EndUserApiError ? codeErrorMessage(err.message) : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Enter the code we sent you
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.subtitle}>
          Check your phone at {number} for a 6-digit code.
        </ThemedText>
        <TextInput
          style={[styles.input, { borderColor: theme.backgroundSelected, color: theme.text }]}
          placeholder="123456"
          placeholderTextColor={theme.textSecondary}
          keyboardType="number-pad"
          maxLength={6}
          value={code}
          onChangeText={setCode}
        />
        {error && (
          <ThemedText type="small" style={styles.error}>
            {error}
          </ThemedText>
        )}
        <Pressable
          style={[styles.button, { backgroundColor: '#5715CE', opacity: submitting || code.length !== 6 ? 0.5 : 1 }]}
          disabled={submitting || code.length !== 6}
          onPress={handleSubmit}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.buttonText}>Verify</ThemedText>}
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

// Maps the server's terse reason codes (see @nutriai/end-user-core's
// VerifyOtpResult) to the same human copy the web app's
// MyProgressVerifyForm shows, so the experience reads the same regardless
// of platform.
function codeErrorMessage(reason: string): string {
  switch (reason) {
    case 'incorrect_code':
      return "That code doesn't look right. Please try again.";
    case 'expired':
      return 'That code has expired. Go back and request a new one.';
    case 'already_used':
      return 'That code was already used. Go back and request a new one.';
    case 'too_many_attempts':
      return 'Too many incorrect attempts. Go back and request a new code.';
    case 'not_found':
      return "We couldn't find a code for that number. Go back and request one.";
    default:
      return 'Something went wrong. Please try again.';
  }
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
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 8,
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
});
