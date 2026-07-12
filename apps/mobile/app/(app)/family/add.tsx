import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { PersonForm } from "../../../src/components/PersonForm";
import { apiGet } from "../../../src/lib/api";
import { colors } from "../../../src/lib/theme";

export default function AddFamilyMemberScreen() {
  const router = useRouter();
  const [hasSelfContact, setHasSelfContact] = useState<boolean | null>(null);

  useEffect(() => {
    apiGet<{ contacts: Array<{ relationshipType: string }> }>("/adults/contacts")
      .then((data) => setHasSelfContact(data.contacts.some((c) => c.relationshipType === "self")))
      .catch(() => setHasSelfContact(false));
  }, []);

  if (hasSelfContact === null) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.white }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <PersonForm
      product="adults"
      mode="add"
      hasSelfContact={hasSelfContact}
      onSuccess={() => router.back()}
    />
  );
}
