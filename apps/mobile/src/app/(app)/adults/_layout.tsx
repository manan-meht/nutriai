import { Stack } from 'expo-router';

export default function AdultsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Family' }} />
      <Stack.Screen name="[contactId]" options={{ title: 'Contact' }} />
      <Stack.Screen name="add" options={{ title: 'Add family member', presentation: 'modal' }} />
      <Stack.Screen name="invite" options={{ presentation: 'modal', headerShown: false }} />
      <Stack.Screen name="edit/[contactId]" options={{ title: 'Edit contact', presentation: 'modal' }} />
      <Stack.Screen name="paywall" options={{ title: 'Subscribe', presentation: 'modal' }} />
    </Stack>
  );
}
