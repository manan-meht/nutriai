import { useCallback, useState } from 'react';
import { Pressable } from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { PersonDetail } from '@/components/person-detail';
import { ThemedText } from '@/components/themed-text';
import { ErrorState, LoadingState } from '@/components/screen-states';
import { api, type GymClientDetails } from '@/lib/api';
import type { GuidanceResponse } from '@/lib/guidance-types';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; details: GymClientDetails; guidance: GuidanceResponse | null };

export default function GymClientDetailScreen() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(() => {
    setState({ status: 'loading' });
    // Guidance's state loads alongside (see adults/[contactId].tsx); a
    // failure there only means no Guidance on this screen.
    Promise.all([api.getGymClientDetails(clientId), api.getGuidance({ kind: 'gym', id: clientId }).catch(() => null)])
      .then(([details, guidance]) => setState({ status: 'ready', details, guidance }))
      .catch((err) =>
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Failed to load client.' })
      );
  }, [clientId]);

  // useFocusEffect (covers the initial mount and every subsequent focus)
  // rather than a mount-only useEffect — see adults/[contactId].tsx's
  // identical fix for the full rationale (stale data after editing).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

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
        guidance={{ subject: { kind: 'gym', id: clientId }, initial: state.guidance }}
      />
    </>
  );
}
