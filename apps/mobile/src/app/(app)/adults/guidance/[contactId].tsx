import { useLocalSearchParams } from 'expo-router';

import { GuidanceSetupScreen } from '@/components/guidance/guidance-panel';

// Guidance mode's setup flow for a family contact (or the account holder's
// own "self" contact): health questions, the proposed targets, confirm.
// Reached from the Guidance mode switch on the contact's screen, which
// reloads on the way back.
export default function AdultsGuidanceSetupScreen() {
  const { contactId } = useLocalSearchParams<{ contactId: string }>();
  return <GuidanceSetupScreen subject={{ kind: 'adults', id: contactId }} />;
}
