import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable, FlatList } from "react-native";
import { apiGet } from "../../src/lib/api";
import { supabase } from "../../src/lib/supabase";
import { getSelectedProduct, clearSelectedProduct, type Product } from "../../src/lib/product";

interface WorkspaceResponse {
  workspace: { id: string; name: string };
  caregiverName?: string | null;
  coachName?: string | null;
}

interface Person {
  id: string;
  fullName: string;
  mealCount: number;
}

const PRODUCT_CONFIG: Record<
  Product,
  { workspacePath: string; listPath: string; listKey: "contacts" | "clients"; personLabel: string; emptyLabel: string }
> = {
  adults: { workspacePath: "/adults/workspace", listPath: "/adults/contacts", listKey: "contacts", personLabel: "person", emptyLabel: "No one added yet." },
  gym: { workspacePath: "/gym/workspace", listPath: "/gym/clients", listKey: "clients", personLabel: "client", emptyLabel: "No clients added yet." },
};

// First end-to-end screen: proves login (session) -> mobile-api (bearer
// auth) -> real data render, in one place, before building out the rest
// of the app's screens. Branches on the product chosen on
// app/select-product.tsx rather than being two separate screens, since
// the layout is identical — only the endpoints and copy differ.
export default function DashboardScreen() {
  const [product, setProduct] = useState<Product | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceResponse | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSelectedProduct().then((p) => {
      if (!p) {
        setError("No product selected.");
        setLoading(false);
        return;
      }
      setProduct(p);
      const config = PRODUCT_CONFIG[p];
      Promise.all([
        apiGet<WorkspaceResponse>(config.workspacePath),
        apiGet<Record<string, Person[]>>(config.listPath),
      ])
        .then(([workspaceRes, listRes]) => {
          setWorkspace(workspaceRes);
          setPeople(listRes[config.listKey] ?? []);
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Something went wrong."))
        .finally(() => setLoading(false));
    });
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6750A4" />
      </View>
    );
  }

  if (error || !product) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? "Something went wrong."}</Text>
      </View>
    );
  }

  const config = PRODUCT_CONFIG[product];
  const name = workspace?.caregiverName ?? workspace?.coachName;

  return (
    <View style={styles.container}>
      <Text style={styles.greeting}>{name ? `Hi, ${name.split(" ")[0]} 👋` : "Your dashboard"}</Text>
      <Text style={styles.subtitle}>{workspace?.workspace.name}</Text>

      <FlatList
        data={people}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>{config.emptyLabel}</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardName}>{item.fullName}</Text>
            <Text style={styles.cardMeta}>{item.mealCount} meals logged</Text>
          </View>
        )}
      />

      <Pressable
        style={styles.signOut}
        onPress={() => {
          clearSelectedProduct();
          supabase.auth.signOut();
        }}
      >
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
