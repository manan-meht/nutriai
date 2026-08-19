import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { Stack } from 'expo-router';
// DarkTheme/DefaultTheme/ThemeProvider used to be re-exported from
// expo-router itself (SDK 57) — the SDK 54 version this app is now pinned
// to (matching this machine's Expo Go, see this repo's README) dropped that
// re-export, so these come straight from @react-navigation/native instead
// (expo-router's Stack is itself built on React Navigation, so this was
// always the real source).
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AuthProvider, useAuth } from '@/lib/auth-context';
import { configurePurchases, logOutPurchases } from '@/lib/purchases';
import { checkForUpdate } from '@/lib/check-for-update';
import { updateAppIconForWeeklyActivity } from '@/lib/dynamic-app-icon';

// Hold the native splash (the Tistra bowl on purple) until the stored
// session has been restored, so the login screen never flashes on a cold
// start. RootNavigator calls hideAsync() the moment that resolves.
//
// There used to be a second splash on top of this one: a JS overlay from
// the Expo starter template that hid the native splash immediately and
// then showed the EXPO logo for 600ms before animating out. That is the
// "Expo logo before the app opens" people saw. It is gone; the native
// splash now stays up for exactly as long as the app is actually loading.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  // Fires once per app open, regardless of auth state — someone stuck on
  // an old build should get nudged to update before they even sign in,
  // not only once they happen to reopen the Play Store listing (the
  // reported gap). See check-for-update.ts for why this is Android-only
  // and uses the FLEXIBLE (not IMMEDIATE) update flow.
  useEffect(() => {
    checkForUpdate();
  }, []);
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}

// Stack.Protected (not the older manual conditional-Stack.Screen pattern —
// see git history) — that older pattern left stale React Navigation state
// behind whenever the logged-out side had more than one screen deep
// (select-product -> login), causing a blank screen or "Unmatched Route"
// once sign-in completed and the guard flipped. Stack.Protected is
// expo-router's own fix for exactly this: per its docs, "if a screen
// becomes protected while it is active, [the navigator] redirect[s] to the
// anchor route" instead of leaving orphaned state around.
function RootNavigator() {
  const { session, loading } = useAuth();
  const configuredUserId = useRef<string | null>(null);

  // Configures RevenueCat's SDK identity to the Supabase auth user id (see
  // lib/purchases.ts) as soon as a session exists, and tears it down on
  // sign-out — keyed on user id rather than session object identity since
  // a token refresh produces a new Session but the same user.
  useEffect(() => {
    const userId = session?.user.id ?? null;
    if (userId) {
      if (configuredUserId.current !== userId) {
        configuredUserId.current = userId;
        configurePurchases(userId);
      }
    } else if (configuredUserId.current) {
      configuredUserId.current = null;
      logOutPurchases();
    }
  }, [session?.user.id]);

  // Refreshes the Android launcher icon (empty/starting-to-fill/filling-up/
  // full bowl) from the trailing week's meal-sharing activity — once as
  // soon as a session exists, and again on every subsequent foreground
  // (mirrors checkForUpdate's cadence), so the icon reflects reasonably
  // fresh data without a per-screen refetch. No-op on iOS and while
  // signed out — see dynamic-app-icon.ts.
  useEffect(() => {
    if (!session) return;
    updateAppIconForWeeklyActivity();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') updateAppIconForWeeklyActivity();
    });
    return () => subscription.remove();
  }, [session]);

  // Hiding the splash is what actually reveals the app, so it has to run
  // on every path out of loading — a missed call leaves the user staring
  // at the splash forever. auth-context guarantees `loading` always
  // resolves, even when restoring the session fails, precisely so this
  // can be relied on.
  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => {});
  }, [loading]);

  // Nothing to render yet — the native splash is still covering this.
  if (loading) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>

      <Stack.Protected guard={!session}>
        <Stack.Screen name="select-product" />
        <Stack.Screen name="login" />
        <Stack.Screen name="signup" />
        <Stack.Screen name="auth/callback" />
        {/* Participant/access-code flow — a completely separate session
            from Supabase Auth (see lib/end-user-session.ts), so it lives
            under the same "logged-out" bucket rather than (app)'s
            Supabase-gated stack. A device with no Supabase session at all
            is the expected case for a tracked family member using this.
            Single combined login screen (WhatsApp number + access code) —
            no separate verify step, since there's nothing to "send" for a
            manually-shared Temporary Access Code. */}
        <Stack.Screen name="end-user/login" />
        <Stack.Screen name="end-user/dashboard" />
      </Stack.Protected>
    </Stack>
  );
}
