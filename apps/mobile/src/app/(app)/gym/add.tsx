import { router } from 'expo-router';

import { PersonForm } from '@/components/person-form';

// Mirrors old apps/mobile's app/(app)/coach/add.tsx (see git history) —
// gym clients have no relationship field, so this is a trivial wrapper
// unlike adults/add.tsx.
export default function AddGymClientScreen() {
  return <PersonForm product="gym" mode="add" onSuccess={() => router.back()} />;
}
