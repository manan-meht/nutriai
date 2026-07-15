import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/lib/auth-context';

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
  if (!session) return <Redirect href="/select-product" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="gym" />
      <Stack.Screen name="adults" />
    </Stack>
  );
}
