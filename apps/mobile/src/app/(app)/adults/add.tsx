import { useEffect, useState } from 'react';
import { router } from 'expo-router';

import { PersonForm } from '@/components/person-form';
import { LoadingState } from '@/components/screen-states';
import { api } from '@/lib/api';

// Mirrors old apps/mobile's app/(app)/family/add.tsx (see git history) —
// loads the existing contacts first just to know whether a "self" contact
// already exists, so PersonForm can hide the "Myself" relationship chip
// once it's already taken. Also loads the workspace's plan: a "self" plan
// workspace only ever has exactly one contact (the caregiver's own tracked
// profile), so PersonForm skips the relationship picker entirely for it
// rather than asking a question with only one possible answer.
export default function AddAdultsContactScreen() {
  const [hasSelfContact, setHasSelfContact] = useState<boolean | null>(null);
  const [workspacePlan, setWorkspacePlan] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getAdultsContacts(), api.getAdultsWorkspace()])
      .then(([{ contacts }, { workspace }]) => {
        setHasSelfContact(contacts.some((c) => c.relationshipType === 'self'));
        setWorkspacePlan(workspace.plan);
      })
      .catch(() => {
        setHasSelfContact(false);
        setWorkspacePlan('family');
      });
  }, []);

  if (hasSelfContact === null || workspacePlan === null) return <LoadingState />;

  return (
    <PersonForm
      product="adults"
      mode="add"
      hasSelfContact={hasSelfContact}
      workspacePlan={workspacePlan}
      onSuccess={(created) => {
        // created is undefined only for the "Myself" relationship chosen
        // within an otherwise multi-member family plan (that contact uses
        // the caregiver's own login, no separate WhatsApp link needed) —
        // see PersonForm's handleSubmit. A self-plan workspace's one and
        // only contact still needs its own WhatsApp number connected, so it
        // always gets a `created` result and routes to the invite screen
        // like any other contact, just with self-specific copy there (see
        // the `self=1` param).
        if (created) {
          router.replace({
            pathname: '/adults/invite',
            params: { contactId: created.id, name: created.fullName.split(' ')[0], ...(workspacePlan === 'self' ? { self: '1' } : {}) },
          });
        } else {
          router.back();
        }
      }}
    />
  );
}
