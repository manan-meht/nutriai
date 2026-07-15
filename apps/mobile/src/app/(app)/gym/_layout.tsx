import { Stack } from 'expo-router';

export default function GymLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Clients' }} />
      <Stack.Screen name="[clientId]" options={{ title: 'Client' }} />
      <Stack.Screen name="add" options={{ title: 'Add client', presentation: 'modal' }} />
      <Stack.Screen name="edit/[clientId]" options={{ title: 'Edit client', presentation: 'modal' }} />
    </Stack>
  );
}
