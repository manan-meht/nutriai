import { useEffect } from 'react';
import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/lib/auth-context';
import { setupNotificationNavigation } from '@/lib/notifications';

export default function AppLayout() {
  // Second auth check, redundant with the root layout's conditional
  // Stack.Screen — expo-router's file-based routing resolves the initial
  // "/" URL straight to this group's index.tsx from the static route
  // table, which can mount this layout before/independent of the root
  // gate. Without this, an unauthenticated cold boot lands here anyway,
  // (app)/index.tsx's /me/products call always 401s, and the screen is
  // left stuck on its own loading spinner forever with no route back to
  // /select-product.
  const { session } = useAuth();

  // Push permission is not requested silently at this layout level — it
  // goes through PushPermissionCard (adults/index.tsx) so the OS system
  // dialog (which neither platform lets us relabel) is preceded by our own
  // explanation of what the notification is actually for.

  // Routes a tapped notification (cold-launch or app-already-running) to
  // the screen it's actually about — see setupNotificationNavigation's own
  // docs. Only wired once a session exists, since it navigates to routes
  // inside this authenticated group.
  useEffect(() => {
    if (!session) return;
    return setupNotificationNavigation();
  }, [session]);

  if (!session) return <Redirect href="/select-product" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="adults" />
    </Stack>
  );
}
