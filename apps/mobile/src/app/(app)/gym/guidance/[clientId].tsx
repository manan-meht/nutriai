import { useLocalSearchParams } from 'expo-router';

import { GuidanceSetupScreen } from '@/components/guidance/guidance-panel';

// Guidance mode's setup flow for a coach's client: health questions, the
// proposed targets, confirm. Reached from the Guidance mode switch on the
// client's screen, which reloads on the way back.
export default function GymGuidanceSetupScreen() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  return <GuidanceSetupScreen subject={{ kind: 'gym', id: clientId }} />;
}
