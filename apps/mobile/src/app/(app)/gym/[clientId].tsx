import { useCallback, useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';

import { PersonDetail } from '@/components/person-detail';
import { ThemedText } from '@/components/themed-text';
import { ErrorState, LoadingState } from '@/components/screen-states';
import { api, type GymClientDetails } from '@/lib/api';

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; details: GymClientDetails };

export default function GymClientDetailScreen() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(() => {
    setState({ status: 'loading' });
    api
      .getGymClientDetails(clientId)
      .then((details) => setState({ status: 'ready', details }))
      .catch((err) =>
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Failed to load client.' })
      );
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={load} />;

  const { client, meals, workouts, biomarkers } = state.details;

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.push(`/gym/edit/${clientId}`)}>
              <ThemedText type="link">Edit</ThemedText>
            </Pressable>
          ),
        }}
      />
      <PersonDetail
        person={client}
        meals={meals}
        workouts={workouts}
        biomarkers={biomarkers}
        foodBalanceQuery={{ clientId }}
        accessCode={{
          onGenerate: (ttlHours) => api.generateGymAccessCode(clientId, ttlHours),
          onRegenerate: (ttlHours) => api.regenerateGymAccessCode(clientId, ttlHours),
          onRevoke: () => api.revokeGymAccessCode(clientId),
        }}
      />
    </>
  );
}
