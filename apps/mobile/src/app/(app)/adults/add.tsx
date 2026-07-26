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
      onSuccess={(created) => {
        // created is undefined when the "Myself" relationship was chosen
        // (self-tracking has no separate family invite to send) — see
        // PersonForm's handleSubmit. Otherwise route to the invite screen
        // instead of just popping back, so adding someone always ends with
        // an actual way to connect them on WhatsApp.
        if (created) {
          router.replace({ pathname: '/adults/invite', params: { contactId: created.id, name: created.fullName.split(' ')[0] } });
        } else {
          router.back();
        }
      }}
    />
  );
}
