import { useEffect } from 'react';
import { Linking, Platform, Pressable, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { Spacing } from '@/constants/theme';

// Shown only when the server states that this specific build is no longer
// supported — never because a newer build exists. See version-policy.ts for
// why those are different questions, and note that nothing reaches this
// screen unless minimumSupportedBuild has been deliberately raised above
// the installed build.
//
// There is no dismiss and no retry, because there is nothing to retry: the
// installed binary cannot work. The only action is the store.

const STORE_URL = Platform.select({
  ios: 'https://apps.apple.com/app/id6811860460',
  android: 'market://details?id=com.tistrahealth.app',
  default: 'https://tistrahealth.com',
}) as string;

export function UnsupportedVersionScreen() {
  // This screen can become the first thing rendered, and the native splash
  // is held until something hides it (see _layout.tsx). RootNavigator's
  // hideAsync is on the path this screen replaces, so it has to do it
  // itself or the person stares at the splash.
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle" style={styles.title}>
        Time for an update
      </ThemedText>
      <ThemedText style={styles.body}>
        This version of Tistra Health is too old to keep working. Updating takes a moment and your
        meals, settings and sign-in are all kept.
      </ThemedText>
      <Pressable
        style={styles.button}
        onPress={() => {
          Linking.openURL(STORE_URL).catch(() => {
            // market:// is unavailable on a device without the Play Store
            // (and on a simulator). Falling back to the web listing means
            // the one action on this screen always does something.
            Linking.openURL('https://tistrahealth.com').catch(() => {});
          });
        }}
      >
        <ThemedText style={styles.buttonText}>
          {Platform.OS === 'ios' ? 'Open the App Store' : 'Open Google Play'}
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  title: { textAlign: 'center' },
  body: { textAlign: 'center', opacity: 0.8 },
  button: {
    marginTop: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: 12,
    backgroundColor: '#5715CE',
  },
  buttonText: { color: '#fff', fontWeight: '600' },
});
