import { router } from 'expo-router';

import { PersonForm } from '@/components/person-form';

// Gym clients have no relationship field, so unlike adults/add.tsx there's
// nothing to load first. A new client goes straight to the invite screen —
// they can't log a meal until they've messaged the bot from WhatsApp.
export default function AddGymClientScreen() {
  return (
    <PersonForm
      product="gym"
      mode="add"
      onSuccess={(created) => {
        if (created) {
          router.replace({ pathname: '/gym/invite', params: { clientId: created.id, name: created.fullName.split(' ')[0] } });
        } else {
          router.back();
        }
      }}
    />
  );
}
