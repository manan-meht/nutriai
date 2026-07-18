import { useCallback, useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';

import { PersonDetail } from '@/components/person-detail';
import { ThemedText } from '@/components/themed-text';
import { ErrorState, LoadingState } from '@/components/screen-states';
import { api, type AdultsContactDetails } from '@/lib/api';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; details: AdultsContactDetails };

export default function AdultsContactDetailScreen() {
  const { contactId } = useLocalSearchParams<{ contactId: string }>();
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(() => {
    setState({ status: 'loading' });
    api
      .getAdultsContactDetails(contactId)
      .then((details) => setState({ status: 'ready', details }))
      .catch((err) =>
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Failed to load contact.' })
      );
  }, [contactId]);

  useEffect(() => {
    load();
  }, [load]);

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
      />
    </>
  );
}
