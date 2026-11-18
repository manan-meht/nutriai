import { Stack } from 'expo-router';

import { GM } from '@/constants/guidance-theme';

export default function GymLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Clients' }} />
      <Stack.Screen name="[clientId]" options={{ title: 'Client' }} />
      <Stack.Screen name="add" options={{ title: 'Add client', presentation: 'modal' }} />
      <Stack.Screen name="invite" options={{ presentation: 'modal', headerShown: false }} />
      <Stack.Screen name="edit/[clientId]" options={{ title: 'Edit client', presentation: 'modal' }} />
      {/* Guidance mode's setup flow, in Guidance's own always-dark palette. */}
      <Stack.Screen
        name="guidance/[clientId]"
        options={{ title: 'Guidance mode', headerStyle: { backgroundColor: GM.page }, headerTintColor: GM.text, headerShadowVisible: false }}
      />
    </Stack>
  );
}
