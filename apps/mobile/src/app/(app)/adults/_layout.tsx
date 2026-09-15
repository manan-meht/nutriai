import { Pressable } from 'react-native';
import { router, Stack } from 'expo-router';

import { ThemedText } from '@/components/themed-text';

// iOS gives a modal no back button. It can be swiped down, but nothing on
// the screen says so, and the paywall was reported as a dead end on iPad.
// Explicit on both platforms; the fallback covers a cold deep link, where
// there is no screen underneath to go back to.
function CloseButton() {
  return (
    <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/adults'))} hitSlop={8}>
      <ThemedText type="link">Close</ThemedText>
    </Pressable>
  );
}

export default function AdultsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Family' }} />
      <Stack.Screen name="[contactId]" options={{ title: 'Contact' }} />
      <Stack.Screen name="add" options={{ title: 'Add family member', presentation: 'modal' }} />
      <Stack.Screen name="invite" options={{ presentation: 'modal', headerShown: false }} />
      <Stack.Screen name="edit/[contactId]" options={{ title: 'Edit contact', presentation: 'modal' }} />
      <Stack.Screen
        name="paywall"
        options={{ title: 'Subscribe', presentation: 'modal', headerRight: () => <CloseButton /> }}
      />
    </Stack>
  );
}
