import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getPushPermissionStatus, registerForPushNotificationsAsync } from '@/lib/notifications';

const DISMISSED_KEY = 'tistra_push_primer_dismissed';

interface PushPermissionCardProps {
  /** What this account will actually be notified about — e.g. "when a
   * loved one logs a meal" for family plan. Rendered as "Get notified
   * {message}." so callers don't repeat the "Get notified" framing. */
  message: string;
}

/** Explains, in our own words, why we're about to ask for notification
 * permission — the OS system dialog itself ("<App> Would Like to Send You
 * Notifications") can't be customized on either platform, so this card is
 * shown first and only requests the real permission (which pops that
 * system dialog) once the user taps Enable. Renders nothing once the
 * permission has been decided (granted or denied — the OS won't re-prompt
 * either way) or once the user has dismissed this card. */
export function PushPermissionCard({ message }: PushPermissionCardProps) {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [status, dismissed] = await Promise.all([
        getPushPermissionStatus(),
        SecureStore.getItemAsync(DISMISSED_KEY),
      ]);
      if (cancelled) return;
      if (status === 'undetermined' && !dismissed) {
        setVisible(true);
      } else if (status === 'granted') {
        // Already decided — re-register (cheap upsert) to keep this
        // device's push token fresh across sessions, same as the token
        // refresh every other authenticated screen used to get from the
        // app-layout-level effect this component replaces for adults.
        registerForPushNotificationsAsync();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function dismiss() {
    setVisible(false);
    await SecureStore.setItemAsync(DISMISSED_KEY, '1');
  }

  async function enable() {
    setRequesting(true);
    try {
      await registerForPushNotificationsAsync();
    } finally {
      setRequesting(false);
      setVisible(false);
    }
  }

  if (!visible) return null;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">Turn on notifications</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.description}>
        Get notified {message}.
      </ThemedText>
      <View style={styles.row}>
        <Pressable onPress={dismiss} disabled={requesting} style={[styles.secondaryButton, { borderColor: theme.textSecondary }]}>
          <ThemedText type="small">Not now</ThemedText>
        </Pressable>
        <Pressable onPress={enable} disabled={requesting} style={[styles.primaryButton, { backgroundColor: theme.primary, opacity: requesting ? 0.6 : 1 }]}>
          {requesting ? <ActivityIndicator color="#fff" /> : <ThemedText type="small" style={styles.primaryButtonText}>Enable</ThemedText>}
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.two, padding: Spacing.three, gap: Spacing.two },
  description: { marginBottom: Spacing.one },
  row: { flexDirection: 'row', gap: Spacing.two },
  secondaryButton: { flex: 1, borderWidth: 1, borderRadius: Spacing.two, paddingVertical: Spacing.two, alignItems: 'center' },
  primaryButton: { flex: 1, borderRadius: Spacing.two, paddingVertical: Spacing.two, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '700' },
});
