import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  api,
  ApiError,
  FEEDBACK_MESSAGE_MAX_LENGTH,
  FEEDBACK_MESSAGE_MIN_LENGTH,
  FEEDBACK_TYPE_OPTIONS,
  type FeedbackType,
} from '@/lib/api';

/** Mirrors the web app's FeedbackModal/FeedbackForm (see the main app's
 * src/components/feedback/), minus the email and honeypot fields: every
 * mobile submission is authenticated, so mobile-api derives the address
 * from the session rather than accepting one, and a bearer-token JSON
 * endpoint has none of the scrapeable-public-form exposure the honeypot
 * exists to catch.
 *
 * The app previously had no in-app feedback path at all — the only way to
 * reach the team was the web dashboard.
 */
export function FeedbackModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const [feedbackType, setFeedbackType] = useState<FeedbackType | ''>('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const trimmed = message.trim();
  const canSubmit = !!feedbackType && trimmed.length >= FEEDBACK_MESSAGE_MIN_LENGTH && !submitting;

  function reset() {
    setFeedbackType('');
    setMessage('');
    setError(null);
    setSuccess(false);
    setSubmitting(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      // Platform + version, so a bug report doesn't start with "which build
      // are you on?". Matches the shape mobile-api logs into user_agent.
      const version = Constants.expoConfig?.version ?? 'unknown';
      const build =
        Platform.OS === 'android'
          ? Constants.expoConfig?.android?.versionCode
          : Constants.expoConfig?.ios?.buildNumber;
      const client = `${Platform.OS} ${version}${build ? ` (${build})` : ''}`;

      await api.submitFeedback(feedbackType as FeedbackType, trimmed, client);
      setSuccess(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't send your feedback. Please check your connection and try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <ThemedView type="background" style={styles.sheet}>
          <View style={styles.header}>
            <ThemedText type="subtitle">{success ? 'Thank you' : 'Send feedback'}</ThemedText>
            <Pressable onPress={handleClose} accessibilityRole="button">
              <ThemedText type="small" style={{ color: theme.primary }}>
                Close
              </ThemedText>
            </Pressable>
          </View>

          {success ? (
            <ThemedText type="small" themeColor="textSecondary">
              Your feedback is with the team — thank you for taking the time. We read every message.
            </ThemedText>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled">
              <ThemedText type="small" themeColor="textSecondary" style={styles.intro}>
                Found a bug, or something that could be better? Tell us — it goes straight to the team.
              </ThemedText>

              <ThemedText type="small" style={styles.label}>
                What is this about?
              </ThemedText>
              <View style={styles.pillRow}>
                {FEEDBACK_TYPE_OPTIONS.map((opt) => {
                  const selected = feedbackType === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => setFeedbackType(opt.value)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={[
                        styles.pill,
                        {
                          borderColor: selected ? theme.primary : theme.backgroundSelected,
                          backgroundColor: selected ? theme.backgroundSelected : 'transparent',
                        },
                      ]}
                    >
                      <ThemedText type="small" style={selected ? { color: theme.primary, fontWeight: '700' } : undefined}>
                        {opt.label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>

              <ThemedText type="small" style={styles.label}>
                Your message
              </ThemedText>
              <TextInput
                value={message}
                onChangeText={setMessage}
                multiline
                maxLength={FEEDBACK_MESSAGE_MAX_LENGTH}
                placeholder="Tell us what's on your mind..."
                placeholderTextColor={theme.placeholder}
                style={[
                  styles.input,
                  { color: theme.text, borderColor: theme.backgroundSelected, backgroundColor: theme.backgroundElement },
                ]}
              />
              <ThemedText type="small" themeColor="textSecondary" style={styles.counter}>
                {trimmed.length < FEEDBACK_MESSAGE_MIN_LENGTH
                  ? `${FEEDBACK_MESSAGE_MIN_LENGTH - trimmed.length} more characters needed`
                  : `${trimmed.length} / ${FEEDBACK_MESSAGE_MAX_LENGTH}`}
              </ThemedText>

              {error && (
                <ThemedText type="small" style={[styles.error, { color: '#D3302F' }]}>
                  {error}
                </ThemedText>
              )}

              <Pressable
                onPress={handleSubmit}
                disabled={!canSubmit}
                accessibilityRole="button"
                style={[styles.submit, { backgroundColor: theme.primary, opacity: canSubmit ? 1 : 0.4 }]}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText type="small" style={styles.submitLabel}>
                    Send feedback
                  </ThemedText>
                )}
              </Pressable>
            </ScrollView>
          )}
        </ThemedView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.three, maxHeight: '85%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.two },
  intro: { marginBottom: Spacing.three },
  label: { fontWeight: '700', marginBottom: Spacing.one },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, marginBottom: Spacing.three },
  pill: { paddingHorizontal: Spacing.two, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  input: { minHeight: 110, borderWidth: 1, borderRadius: Spacing.two, padding: Spacing.two, textAlignVertical: 'top' },
  counter: { marginTop: Spacing.one, textAlign: 'right' },
  error: { marginTop: Spacing.two },
  submit: { marginTop: Spacing.three, borderRadius: Spacing.two, padding: Spacing.two, alignItems: 'center' },
  submitLabel: { color: '#ffffff', fontWeight: '700' },
});
