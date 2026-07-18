import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider, useAuth } from '@/lib/auth-context';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
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

  // Keep the native splash screen up (see AnimatedSplashOverlay) rather
  // than flashing the login screen for a moment while the stored session
  // is still being restored from SecureStore.
  if (loading) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>

      <Stack.Protected guard={!session}>
        <Stack.Screen name="select-product" />
        <Stack.Screen name="login" />
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
