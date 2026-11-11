import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';

import { PersonForm, type PersonFormInitialValues } from '@/components/person-form';
import { EMPTY_NUTRITION_GOAL_FIELDS } from '@/components/nutrition-goal-fields';
import { ErrorState, LoadingState } from '@/components/screen-states';
import { api, type GymClient } from '@/lib/api';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; client: GymClient };

// Same mapping as adults/edit/[contactId].tsx, minus the fields gym_clients
// doesn't have (relationship, reminders, timezone).
export default function EditGymClientScreen() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(() => {
    // No synchronous setState({ status: 'loading' }) here — see
    // adults/edit/[contactId].tsx's identical note.
    api
      .getGymClientDetails(clientId)
      .then(({ client }) => setState({ status: 'ready', client }))
      .catch((err) =>
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Failed to load client.' })
      );
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={load} />;

  const { client } = state;
  const initialValues: PersonFormInitialValues = {
    fullName: client.fullName,
    age: client.age != null ? String(client.age) : '',
    gender: client.gender ?? '',
    weightKg: client.weightKg != null ? String(client.weightKg) : '',
    heightCm: client.heightCm != null ? String(client.heightCm) : '',
    goalFields: {
      ...EMPTY_NUTRITION_GOAL_FIELDS,
      nutritionGoals: client.nutritionGoals ?? [],
      dailyMovementLevel: client.dailyMovementLevel ?? 'not_sure',
      weeklyModerateActivity: client.weeklyModerateActivity ?? 'not_sure',
      strengthExerciseFrequency: client.strengthExerciseFrequency ?? 'not_sure',
      targetWeightKg: client.targetWeightKg != null ? String(client.targetWeightKg) : '',
    },
  };

  return (
    <PersonForm
      product="gym"
      mode="edit"
      personId={clientId}
      initialValues={initialValues}
      onSuccess={() => router.back()}
    />
  );
}
