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
        // Every new contact routes to the invite screen now, including
        // "Myself" (whether it's a self-plan workspace's only contact, or
        // "Myself" within an otherwise multi-member family plan) — both are
        // the same real situation (the caregiver connecting their own
        // WhatsApp number), so both get the same self-specific copy there
        // (see the `self=1` param and PersonForm's handleSubmit).
        if (created) {
          router.replace({
            pathname: '/adults/invite',
            params: { contactId: created.id, name: created.fullName.split(' ')[0], ...(created.isSelf ? { self: '1' } : {}) },
          });
        } else {
          router.back();
        }
      }}
    />
  );
}
