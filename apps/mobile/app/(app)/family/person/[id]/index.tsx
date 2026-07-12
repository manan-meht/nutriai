import { useLocalSearchParams } from "expo-router";
import { PersonDetail } from "../../../../../src/components/PersonDetail";

export default function FamilyPersonDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PersonDetail apiPath={`/adults/contacts/${id}`} editRoute={`/(app)/family/person/${id}/edit`} />;
}
