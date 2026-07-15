import { useEffect, useState } from 'react';
import { router } from 'expo-router';

import { PersonForm } from '@/components/person-form';
import { LoadingState } from '@/components/screen-states';
import { api } from '@/lib/api';

// Mirrors old apps/mobile's app/(app)/family/add.tsx (see git history) —
// loads the existing contacts first just to know whether a "self" contact
// already exists, so PersonForm can hide the "Myself" relationship chip
// once it's already taken.
export default function AddAdultsContactScreen() {
  const [hasSelfContact, setHasSelfContact] = useState<boolean | null>(null);

  useEffect(() => {
    api
      .getAdultsContacts()
      .then(({ contacts }) => setHasSelfContact(contacts.some((c) => c.relationshipType === 'self')))
      .catch(() => setHasSelfContact(false));
  }, []);

  if (hasSelfContact === null) return <LoadingState />;

  return (
    <PersonForm
      product="adults"
      mode="add"
      hasSelfContact={hasSelfContact}
      onSuccess={() => router.back()}
    />
  );
}
