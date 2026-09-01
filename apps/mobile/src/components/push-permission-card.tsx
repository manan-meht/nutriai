import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getPushPermissionState, registerForPushNotificationsAsync } from '@/lib/notifications';
import {
  isSameLocalDay,
  missingUpdatesMessage,
  parseLastShownAt,
  shouldShowWeeklyNudge,
  trackedLovedOneNames,
  type NudgeContact,
} from '@/lib/push-nudge';

const DISMISSED_KEY = 'tistra_push_primer_dismissed';

/** Separate key from DISMISSED_KEY on purpose: dismissing the first-run
 * primer must not also silence the weekly "you're missing updates" nudge,
 * which is about an active, ongoing loss rather than a one-off offer. */
const NUDGE_LAST_SHOWN_KEY = 'tistra_push_nudge_last_shown';

/** How long "Not now" suppresses the FIRST-RUN primer for.
 *
 * It used to suppress it forever, which turned one stray tap into a
 * permanent loss of notifications: the card was the only thing that could
 * request permission, so once dismissed there was no route back short of
 * reinstalling. The weekly nudge below has its own, shorter cadence. */
const DISMISSAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

async function dismissalActive(key: string = DISMISSED_KEY): Promise<boolean> {
  const raw = await SecureStore.getItemAsync(key);
  if (!raw) return false;
  if (raw === '1') {
    // Written before this was time-boxed; migrate to "dismissed now" rather
    // than treating it as expired, so upgrading never re-prompts instantly.
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
  /** The workspace's contacts, used to decide whether anything is actually
   * being missed. The weekly nudge only appears when at least one NON-self
   * contact is actively logging — see lib/push-nudge.ts. */
  contacts?: NudgeContact[];
}

type Variant = 'primer' | 'missing_updates';

/** Explains why notifications matter, and — when they are off and meals are
 * actively going unreported — says so once a week.
 *
 * Three states, because the right thing to offer differs:
 *
 *   granted            -> render nothing, silently refresh the token
 *   off, can prompt    -> offer the in-app prompt (Enable / Turn on)
 *   off, cannot prompt -> offer the system Settings page
 *
 * The last two are distinguished by canAskAgain, NOT by status: Android
 * reports a never-requested permission as "denied", so keying off
 * "undetermined" (as this did originally) meant the card never rendered on
 * Android at all and the permission was never requested. */
export function PushPermissionCard({ message, contacts = [] }: PushPermissionCardProps) {
  const theme = useTheme();
  const [variant, setVariant] = useState<Variant | null>(null);
  const [canPrompt, setCanPrompt] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const lovedOnes = trackedLovedOneNames(contacts);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { status, canAskAgain } = await getPushPermissionState();
      if (cancelled || status === null) return;

      if (status === 'granted') {
        // Already decided — re-register (cheap upsert) to keep this
        // device's push token fresh across sessions.
        registerForPushNotificationsAsync();
        return;
      }

      setCanPrompt(canAskAgain);

      // Something is actively being missed: nudge weekly, and say whose
      // updates are going unseen.
      if (lovedOnes.length > 0) {
        const lastShownAt = parseLastShownAt(
          await SecureStore.getItemAsync(NUDGE_LAST_SHOWN_KEY)
        );
        if (cancelled) return;
        const now = Date.now();
        if (shouldShowWeeklyNudge(lastShownAt, now)) {
          // Stamp only when a NEW cycle begins. Re-stamping on a same-day
          // remount would slide the week forward on every app launch, so
          // the nudge would drift later and later instead of landing
          // weekly.
          const continuingToday = lastShownAt !== null && isSameLocalDay(lastShownAt, now);
          if (!continuingToday) await SecureStore.setItemAsync(NUDGE_LAST_SHOWN_KEY, String(now));
          setVariant('missing_updates');
        }
        return;
      }

      // Nothing to miss yet (no loved ones logging) — the gentler
      // first-run offer, and only if it hasn't been waved off recently.
      if (!(await dismissalActive())) {
        if (!cancelled) setVariant('primer');
      }
    })();
    return () => {
      cancelled = true;
    };
    // lovedOnes is derived from contacts; joining keeps the effect stable
    // across renders that produce an equal list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lovedOnes.join(',')]);

  async function dismiss() {
    const key = variant === 'missing_updates' ? NUDGE_LAST_SHOWN_KEY : DISMISSED_KEY;
    setVariant(null);
    await SecureStore.setItemAsync(key, String(Date.now()));
  }

  async function act() {
    if (!canPrompt) {
      // Android will not re-prompt once refused; Settings is the only
      // remaining route.
      Linking.openSettings();
      return;
    }
    setRequesting(true);
    try {
      await registerForPushNotificationsAsync();
    } finally {
      setRequesting(false);
      setVariant(null);
    }
  }

  if (!variant) return null;

  const isNudge = variant === 'missing_updates';
  const title = isNudge ? 'You’re missing meal updates' : 'Turn on notifications';
  const body = isNudge
    ? `${missingUpdatesMessage(lovedOnes)} Notifications are off for Tistra Health.`
    : `Get notified ${message}.`;
  const actionLabel = canPrompt ? (isNudge ? 'Turn on' : 'Enable') : 'Open settings';

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.description}>
        {body}
      </ThemedText>
      <View style={styles.row}>
        <Pressable onPress={dismiss} disabled={requesting} style={[styles.secondaryButton, { borderColor: theme.textSecondary }]}>
          <ThemedText type="small">Not now</ThemedText>
        </Pressable>
        <Pressable onPress={act} disabled={requesting} style={[styles.primaryButton, { backgroundColor: theme.primary, opacity: requesting ? 0.6 : 1 }]}>
          {requesting ? <ActivityIndicator color="#fff" /> : <ThemedText type="small" style={styles.primaryButtonText}>{actionLabel}</ThemedText>}
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
