import { useRouter } from "expo-router";
import { PersonForm } from "../../../src/components/PersonForm";

export default function AddClientScreen() {
  const router = useRouter();
  return <PersonForm product="gym" mode="add" onSuccess={() => router.back()} />;
}
