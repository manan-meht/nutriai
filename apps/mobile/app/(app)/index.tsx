import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable, FlatList } from "react-native";
import { apiGet } from "../../src/lib/api";
import { supabase } from "../../src/lib/supabase";

interface WorkspaceResponse {
  workspace: { id: string; name: string; plan: string };
  caregiverName: string | null;
}

interface Contact {
  id: string;
  fullName: string;
  mealCount: number;
  relationshipType: "self" | "family_caregiver";
}

interface ContactsResponse {
  contacts: Contact[];
}

// First end-to-end screen: proves login (session) -> mobile-api (bearer
// auth) -> real data render, in one place, before building out the rest
// of the app's screens.
export default function WorkspaceScreen() {
  const [workspace, setWorkspace] = useState<WorkspaceResponse | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiGet<WorkspaceResponse>("/adults/workspace"),
      apiGet<ContactsResponse>("/adults/contacts"),
    ])
      .then(([workspaceRes, contactsRes]) => {
        setWorkspace(workspaceRes);
        setContacts(contactsRes.contacts);
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

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.greeting}>
        {workspace?.caregiverName ? `Hi, ${workspace.caregiverName.split(" ")[0]} 👋` : "Your family"}
      </Text>
      <Text style={styles.subtitle}>{workspace?.workspace.name}</Text>

      <FlatList
        data={contacts}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No one added yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardName}>{item.fullName}</Text>
            <Text style={styles.cardMeta}>{item.mealCount} meals logged</Text>
          </View>
        )}
      />

      <Pressable style={styles.signOut} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", paddingTop: 64, paddingHorizontal: 20 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" },
  greeting: { fontSize: 24, fontWeight: "700", color: "#111" },
  subtitle: { fontSize: 15, color: "#666", marginTop: 2, marginBottom: 20 },
  list: { paddingBottom: 24 },
  empty: { color: "#999", textAlign: "center", marginTop: 40 },
  card: {
    backgroundColor: "#f7f5fb",
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  cardName: { fontSize: 16, fontWeight: "600", color: "#111" },
  cardMeta: { fontSize: 13, color: "#666", marginTop: 2 },
  error: { color: "#c00", padding: 20, textAlign: "center" },
  signOut: { alignItems: "center", paddingVertical: 16 },
  signOutText: { color: "#c00", fontSize: 14, fontWeight: "500" },
});
