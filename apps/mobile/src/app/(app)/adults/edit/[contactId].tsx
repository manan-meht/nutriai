import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';

import { PersonForm, type PersonFormInitialValues } from '@/components/person-form';
import { EMPTY_NUTRITION_GOAL_FIELDS } from '@/components/nutrition-goal-fields';
import { ErrorState, LoadingState } from '@/components/screen-states';
import { api, type AdultsContact } from '@/lib/api';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; contact: AdultsContact };

// Mirrors old apps/mobile's app/(app)/family/person/[id]/edit.tsx (see git
// history) — fetches the contact, maps it into PersonForm's
// string-keyed initial values (the form's inputs are all TextInput, so
// numbers/goal fields get stringified here rather than in PersonForm
// itself).
export default function EditAdultsContactScreen() {
  const { contactId } = useLocalSearchParams<{ contactId: string }>();
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(() => {
    setState({ status: 'loading' });
    api
      .getAdultsContactDetails(contactId)
      .then(({ contact }) => setState({ status: 'ready', contact }))
      .catch((err) =>
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Failed to load contact.' })
      );
  }, [contactId]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={load} />;

  const { contact } = state;
  const initialValues: PersonFormInitialValues = {
    fullName: contact.fullName,
    relationship: contact.relationshipType === 'self' ? 'self' : contact.relationship ?? '',
    age: contact.age != null ? String(contact.age) : '',
    gender: contact.gender ?? '',
    weightKg: contact.weightKg != null ? String(contact.weightKg) : '',
    heightCm: contact.heightCm != null ? String(contact.heightCm) : '',
    remindersEnabled: contact.remindersEnabled,
    reminderTimes: [
      contact.reminderTimes[0] ?? '08:00',
      contact.reminderTimes[1] ?? '12:00',
      contact.reminderTimes[2] ?? '19:00',
    ],
    goalFields: {
      ...EMPTY_NUTRITION_GOAL_FIELDS,
      primaryNutritionGoal: contact.primaryNutritionGoal ?? '',
      dateOfBirth: contact.dateOfBirth ?? '',
      metabolicEquationSex: contact.metabolicEquationSex ?? '',
      activityLevel: contact.activityLevel ?? 'unknown',
      resistanceTrainingStatus: contact.resistanceTrainingStatus ?? 'unknown',
      targetWeightKg: contact.targetWeightKg != null ? String(contact.targetWeightKg) : '',
    },
  };

  return (
    <PersonForm
      product="adults"
      mode="edit"
      personId={contactId}
      initialValues={initialValues}
      onSuccess={() => router.back()}
    />
  );
}
