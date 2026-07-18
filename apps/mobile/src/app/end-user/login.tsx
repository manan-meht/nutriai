import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Device from 'expo-device';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { endUserApi, EndUserApiError } from '@/lib/end-user-api';
import { saveEndUserSession } from '@/lib/end-user-session';

// Entry point for a participant/tracked contact — not a caregiver/coach
// Supabase Auth login (see login.tsx for that). Mirrors the web app's
// collapsed /my-progress entry form: WhatsApp number + access code in one
// step, no separate "send me a code" request first — a family owner or
// coach already generated and shared a Temporary Access Code manually
// before the participant ever reaches this screen (see
// AccessCodeCard/generateAdultsAccessCode on the family/coach side), so
// there's nothing to send here. endUserApi.verifyOtp works unchanged for
// both a manually-generated access code and a system-issued OTP — same
// underlying row, see @nutriai/end-user-core's verifyOtp.
export default function EndUserLoginScreen() {
  const theme = useTheme();
  const [number, setNumber] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const result = await endUserApi.verifyOtp(number, code, Device.modelName ?? undefined);
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
          I was invited
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.subtitle}>
          Enter the access code shared by your family member or coach.
        </ThemedText>
        <TextInput
          style={[styles.input, { borderColor: theme.backgroundSelected, color: theme.text }]}
          placeholder="Invited WhatsApp number, e.g. +65 9123 4567"
          placeholderTextColor={theme.textSecondary}
          keyboardType="phone-pad"
          autoComplete="tel"
          value={number}
          onChangeText={setNumber}
        />
        <TextInput
          style={[styles.input, styles.codeInput, { borderColor: theme.backgroundSelected, color: theme.text }]}
          placeholder="Access code, e.g. 482913"
          placeholderTextColor={theme.textSecondary}
          keyboardType="number-pad"
          maxLength={8}
          value={code}
          onChangeText={(text) => setCode(text.replace(/\D/g, ''))}
        />
        {error && (
          <ThemedText type="small" style={styles.error}>
            {error}
          </ThemedText>
        )}
        <Pressable
          style={[styles.button, { backgroundColor: '#5715CE', opacity: submitting || !number || code.length < 6 ? 0.5 : 1 }]}
          disabled={submitting || !number || code.length < 6}
          onPress={handleSubmit}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.buttonText}>Continue</ThemedText>}
        </Pressable>
        <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
          Ask the family member or coach who added you for your access code.
        </ThemedText>
      </SafeAreaView>
    </ThemedView>
  );
}

// Maps the server's terse reason codes (see @nutriai/end-user-core's
// VerifyOtpResult) to the same human copy the web app's
// MyProgressEntryForm shows, so the experience reads the same regardless
// of platform.
function codeErrorMessage(reason: string): string {
  switch (reason) {
    case 'incorrect_code':
    case 'not_found':
      return "That code didn't work. Please check the number and code, or ask for a new access code.";
    case 'expired':
      return 'This access code has expired. Please ask for a new one.';
    case 'already_used':
      return 'That code was already used — please ask for a new access code.';
    case 'revoked':
      return 'That code is no longer valid — please ask for a new access code.';
    case 'too_many_attempts':
      return 'Too many incorrect attempts — please ask for a new access code.';
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
    fontSize: 16,
    marginBottom: Spacing.three,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  codeInput: { textAlign: 'center', letterSpacing: 4, fontSize: 20 },
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
