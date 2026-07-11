import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from "react-native";
import { apiGet } from "../../../src/lib/api";
import { supabase } from "../../../src/lib/supabase";
import { PersonDetail } from "../../../src/components/PersonDetail";

interface Contact {
  id: string;
  relationshipType: "self" | "family_caregiver";
}

interface ContactsResponse {
  contacts: Contact[];
}

// A self-tracking workspace has exactly one contact (relationshipType
// "self") — this resolves its id, then hands off to the same PersonDetail
// component Family/Coach use for meal history, skipping the list screen
// entirely since there's only ever one person here.
export default function SelfDashboardScreen() {
  const [selfContactId, setSelfContactId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<ContactsResponse>("/adults/contacts")
      .then((res) => {
        const self = res.contacts.find((c) => c.relationshipType === "self") ?? res.contacts[0];
        if (!self) {
          setError("No self-tracking profile found yet.");
        } else {
          setSelfContactId(self.id);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Something went wrong."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6750A4" />
      </View>
    );
  }

  if (error || !selfContactId) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? "Something went wrong."}</Text>
        <Pressable style={styles.signOut} onPress={() => supabase.auth.signOut()}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <PersonDetail
      apiPath={`/adults/contacts/${selfContactId}`}
      showBackButton={false}
      onSignOut={() => supabase.auth.signOut()}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" },
  error: { color: "#c00", padding: 20, textAlign: "center" },
  signOut: { alignItems: "center", paddingVertical: 16 },
  signOutText: { color: "#c00", fontSize: 14, fontWeight: "500" },
});
