import { useCallback, useState } from 'react';
import { Pressable } from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { PersonDetail } from '@/components/person-detail';
import { ThemedText } from '@/components/themed-text';
import { ErrorState, LoadingState } from '@/components/screen-states';
import { api, type AdultsContactDetails } from '@/lib/api';
import type { GuidanceResponse } from '@/lib/guidance-types';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; details: AdultsContactDetails; tistraWhatsAppNumber?: string; guidance: GuidanceResponse | null };

export default function AdultsContactDetailScreen() {
  const { contactId } = useLocalSearchParams<{ contactId: string }>();
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(() => {
    setState({ status: 'loading' });
    // Guidance's state loads alongside, so a person in Guidance mode opens
    // straight on it rather than on tracking first. Any failure there just
    // means no Guidance on this screen: it never blocks the contact.
    Promise.all([
      api.getAdultsContactDetails(contactId),
      api.getAdultsWorkspace(),
      api.getGuidance({ kind: 'adults', id: contactId }).catch(() => null),
    ])
      .then(([details, { tistraWhatsAppNumber }, guidance]) => setState({ status: 'ready', details, tistraWhatsAppNumber, guidance }))
      .catch((err) =>
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Failed to load contact.' })
      );
  }, [contactId]);

  // useFocusEffect (covers the initial mount and every subsequent focus)
  // rather than a mount-only useEffect — returning here after editing the
  // contact (e.g. adding gender) previously showed stale data forever,
  // since this screen instance stays mounted underneath Edit and a plain
  // useEffect only ever ran once.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={load} />;

  const { contact, meals } = state.details;

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.push(`/adults/edit/${contactId}`)}>
              <ThemedText type="link">Edit</ThemedText>
            </Pressable>
          ),
        }}
      />
      <PersonDetail
        person={contact}
        meals={meals}
        foodBalanceQuery={{ contactId }}
        accessCode={{
          onGenerate: (ttlHours) => api.generateAdultsAccessCode(contactId, ttlHours),
          onRegenerate: (ttlHours) => api.regenerateAdultsAccessCode(contactId, ttlHours),
          onRevoke: () => api.revokeAdultsAccessCode(contactId),
        }}
        foodPreferencesContactId={contactId}
        tistraWhatsAppNumber={state.tistraWhatsAppNumber}
        onReactToMeal={(mealLogId, emoji) => api.reactToAdultsMeal(contactId, mealLogId, emoji)}
        guidance={{ subject: { kind: 'adults', id: contactId }, initial: state.guidance }}
      />
    </>
  );
}
