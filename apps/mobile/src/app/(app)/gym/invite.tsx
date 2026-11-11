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

/** Done/Skip: back to whatever opened this (the list, after add.tsx
 * replaced itself with this screen), or the list itself on a cold link. */
function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/gym');
}

/** The coaching-client counterpart of adults/invite.tsx — shown right after
 * "Add client" and from a client's long-press menu. Gets (or creates) the
 * client's invite and hands it to the share sheet, like the web Coach OS
 * Nutrition page's "Send invite via WhatsApp". The client taps the link,
 * sends the prefilled JOIN message, and from then on just sends meal
 * photos — no app on their side. */
export default function GymInviteScreen() {
  const theme = useTheme();
  const { clientId, name } = useLocalSearchParams<{ clientId: string; name?: string }>();
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    api
      .getCoachClientInvite(clientId)
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
  }, [clientId]);

  async function handleSend(invite: InviteSummary) {
    if (!invite.shareLink) return;
    // The share sheet rather than opening wa.me directly — see
    // adults/invite.tsx: it also lets the coach send it by SMS or email.
    await Share.share({ message: invite.shareMessage ?? invite.shareLink });
  }

  // A claimed invite has already linked a number; sending its link again
  // would only get "this invite has already been used" from the bot.
  const alreadyConnected = state.status === 'ready' && state.invite.status === 'claimed';

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
            <Pressable style={[styles.secondaryButton, { borderColor: theme.textSecondary }]} onPress={close}>
              <ThemedText type="default">Done</ThemedText>
            </Pressable>
          </View>
        )}

        {state.status === 'ready' && alreadyConnected && (
          <>
            <ThemedText type="title" style={styles.title}>
              {name ? `${name} is connected` : 'Already connected'}
            </ThemedText>
            <ThemedText type="default" themeColor="textSecondary" style={styles.subtitle}>
              {state.invite.claimedByWhatsappNumberMasked
                ? `Their WhatsApp number ending ${state.invite.claimedByWhatsappNumberMasked.slice(-4)} is linked. Meals they send show up here.`
                : 'Their WhatsApp number is linked. Meals they send show up here.'}
            </ThemedText>
            <Pressable style={[styles.primaryButton, { backgroundColor: theme.primary }]} onPress={close}>
              <ThemedText style={styles.primaryButtonText}>Done</ThemedText>
            </Pressable>
          </>
        )}

        {state.status === 'ready' && !alreadyConnected && (
          <>
            <ThemedText style={styles.emoji}>🎉</ThemedText>
            <ThemedText type="title" style={styles.title}>
              {name ? `Invite ${name}` : 'Invite your client'}
            </ThemedText>
            <ThemedText type="default" themeColor="textSecondary" style={styles.subtitle}>
              Send them this WhatsApp invite. Once they tap it and send the message, they can share meal photos with you
              — no app needed on their side.
            </ThemedText>

            <Pressable
              style={[styles.primaryButton, { backgroundColor: theme.primary }]}
              onPress={() => handleSend(state.invite)}
            >
              <ThemedText style={styles.primaryButtonText}>Send invite via WhatsApp</ThemedText>
            </Pressable>

            <Pressable style={styles.skipLink} onPress={close}>
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
