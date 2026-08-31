import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getPushPermissionStatus, registerForPushNotificationsAsync } from '@/lib/notifications';

const DISMISSED_KEY = 'tistra_push_primer_dismissed';

/** Separate key from DISMISSED_KEY on purpose: dismissing the pre-permission
 * primer must not also silence the "notifications are off" notice, which is
 * about a different (and worse) state and is the only route back from it. */
const DENIED_DISMISSED_KEY = 'tistra_push_denied_notice_dismissed';

/** How long "Not now" suppresses the card for.
 *
 * It used to suppress it FOREVER, which turned one stray tap into a
 * permanent loss of notifications: the card is the only thing that can
 * request permission, so once dismissed there was no route back to a
 * working push token short of reinstalling the app. Nothing in the UI
 * indicated anything was wrong — meals kept appearing in the app, they just
 * never arrived on the lock screen.
 *
 * A month is long enough that "not now" is respected rather than nagged
 * past, and short enough that a caregiver who wants notifications isn't
 * permanently locked out by one tap. */
const DISMISSAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Reads the dismissal timestamp, returning true while it is still in
 * effect. Values written before this was time-boxed are the literal '1';
 * those are migrated to "dismissed now" rather than treated as expired, so
 * upgrading the app never re-prompts someone immediately. */
async function dismissalActive(key: string = DISMISSED_KEY): Promise<boolean> {
  const raw = await SecureStore.getItemAsync(key);
  if (!raw) return false;
  if (raw === '1') {
    await SecureStore.setItemAsync(key, String(Date.now()));
    return true;
  }
  const at = Number(raw);
  if (!Number.isFinite(at)) return false;
  return Date.now() - at < DISMISSAL_TTL_MS;
}

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
  const [deniedVisible, setDeniedVisible] = useState(false);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [status, dismissed] = await Promise.all([
        getPushPermissionStatus(),
        dismissalActive(),
      ]);
      if (cancelled) return;
      if (status === 'undetermined' && !dismissed) {
        setVisible(true);
      } else if (status === 'denied') {
        // Previously this rendered nothing at all, which is how a caregiver
        // ended up with notifications silently off and an empty screen
        // where the explanation should be: the card is the only thing that
        // ever mentions notifications, and it hid itself precisely when
        // something was wrong. Android will not let an app re-prompt after
        // a denial, so the only honest thing to offer is a route to
        // Settings.
        if (!(await dismissalActive(DENIED_DISMISSED_KEY))) setDeniedVisible(true);
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
    await SecureStore.setItemAsync(DISMISSED_KEY, String(Date.now()));
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

  if (deniedVisible) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">Notifications are off</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.description}>
          You won&apos;t be notified {message}. Turn notifications on for Tistra Health in
          your phone&apos;s settings.
        </ThemedText>
        <View style={styles.row}>
          <Pressable
            onPress={async () => {
              setDeniedVisible(false);
              await SecureStore.setItemAsync(DENIED_DISMISSED_KEY, String(Date.now()));
            }}
            style={[styles.secondaryButton, { borderColor: theme.textSecondary }]}
          >
            <ThemedText type="small">Not now</ThemedText>
          </Pressable>
          <Pressable
            onPress={() => Linking.openSettings()}
            style={[styles.primaryButton, { backgroundColor: theme.primary }]}
          >
            <ThemedText type="small" style={styles.primaryButtonText}>Open settings</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
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
