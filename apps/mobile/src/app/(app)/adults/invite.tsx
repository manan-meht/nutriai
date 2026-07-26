import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, ApiError, type InviteSummary } from '@/lib/api';

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; invite: InviteSummary };

/** Shown right after "Add family member" succeeds (see adults/add.tsx) —
 * the contact now exists, but nothing connects them to Tistra Health on
 * WhatsApp yet. Fetches (get-or-creates) the invite and offers to send it,
 * mirroring the web dashboard's "Send invite via WhatsApp" action
 * (AddContactModal/InviteCard) instead of silently leaving the caregiver
 * with no way to actually invite the person they just added. */
export default function AdultsInviteScreen() {
  const theme = useTheme();
  const { contactId, name } = useLocalSearchParams<{ contactId: string; name?: string }>();
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    api
      .getFamilyInvite(contactId)
      .then((invite) => {
        if (!cancelled) setState({ status: 'ready', invite });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          status: 'error',
          message: err instanceof ApiError ? err.message : 'Could not create an invite right now.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  async function handleSend(invite: InviteSummary) {
    if (!invite.shareLink) return;
    // wa.me with no recipient opens WhatsApp's own contact picker with the
    // message prefilled — matches the web app's buildShareLink usage
    // exactly (see src/lib/invites/messages.ts). The native share sheet
    // (rather than Linking.openURL straight to wa.me) also lets the
    // caregiver send it over SMS/email/etc. if WhatsApp isn't installed.
    await Share.share({ message: invite.shareMessage ?? invite.shareLink });
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {state.status === 'loading' && (
          <View style={styles.centered}>
            <ActivityIndicator />
          </View>
        )}

        {state.status === 'error' && (
          <View style={styles.centered}>
            <ThemedText type="default" style={styles.errorText}>
              {state.message}
            </ThemedText>
            <Pressable style={[styles.secondaryButton, { borderColor: theme.textSecondary }]} onPress={() => router.replace('/adults')}>
              <ThemedText type="default">Done</ThemedText>
            </Pressable>
          </View>
        )}

        {state.status === 'ready' && (
          <>
            <ThemedText style={styles.emoji}>🎉</ThemedText>
            <ThemedText type="title" style={styles.title}>
              {name ? `${name} added!` : 'Added!'}
            </ThemedText>
            <ThemedText type="default" themeColor="textSecondary" style={styles.subtitle}>
              Send them this WhatsApp invite so they can start sharing meal photos with you.
            </ThemedText>

            <Pressable
              style={[styles.primaryButton, { backgroundColor: theme.primary }]}
              onPress={() => handleSend(state.invite)}
            >
              <ThemedText style={styles.primaryButtonText}>Send invite via WhatsApp</ThemedText>
            </Pressable>

            <Pressable style={styles.skipLink} onPress={() => router.replace('/adults')}>
              <ThemedText type="default" themeColor="textSecondary" style={styles.skipLinkText}>
                Skip for now
              </ThemedText>
            </Pressable>
          </>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  centered: { alignItems: 'center', gap: Spacing.three },
  emoji: { fontSize: 40, textAlign: 'center' },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', marginBottom: Spacing.two },
  primaryButton: { borderRadius: Spacing.two, paddingVertical: Spacing.three, alignItems: 'center' },
  primaryButtonText: { color: '#ffffff', fontWeight: '600' },
  secondaryButton: { borderWidth: 1, borderRadius: Spacing.two, paddingVertical: Spacing.two, paddingHorizontal: Spacing.four, alignItems: 'center' },
  skipLink: { alignItems: 'center', paddingVertical: Spacing.two },
  skipLinkText: { textDecorationLine: 'underline' },
  errorText: { textAlign: 'center', color: '#D92D20' },
});
