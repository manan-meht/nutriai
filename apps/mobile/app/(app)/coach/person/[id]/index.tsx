import { useLocalSearchParams } from "expo-router";
import { PersonDetail } from "../../../../../src/components/PersonDetail";

export default function CoachPersonDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PersonDetail apiPath={`/gym/clients/${id}`} editRoute={`/(app)/coach/person/${id}/edit`} />;
}
