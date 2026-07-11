import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable, FlatList, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { apiGet } from "../lib/api";
import { supabase } from "../lib/supabase";

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

interface PeopleDashboardProps {
  workspacePath: string;
  listPath: string;
  listKey: "contacts" | "clients";
  emptyLabel: string;
  detailRouteBase: string;
}

// Shared by app/(app)/family/index.tsx and app/(app)/coach/index.tsx —
// those are deliberately separate route files/flows per product, but the
// list-of-people layout is identical between them, only the endpoints and
// copy differ (Self skips this screen entirely, see app/(app)/self/index.tsx).
export function PeopleDashboard({ workspacePath, listPath, listKey, emptyLabel, detailRouteBase }: PeopleDashboardProps) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<WorkspaceResponse | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      try {
        const [workspaceRes, listRes] = await Promise.all([
          apiGet<WorkspaceResponse>(workspacePath),
          apiGet<Record<string, Person[]>>(listPath),
        ]);
        setWorkspace(workspaceRes);
        setPeople(listRes[listKey] ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        isRefresh ? setRefreshing(false) : setLoading(false);
      }
    },
    [workspacePath, listPath, listKey]
  );

  useEffect(() => {
    load();
  }, [load]);

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

  const name = workspace?.caregiverName ?? workspace?.coachName;

  return (
    <View style={styles.container}>
      <Text style={styles.greeting}>{name ? `Hi, ${name.split(" ")[0]} 👋` : "Your dashboard"}</Text>
      <Text style={styles.subtitle}>{workspace?.workspace.name}</Text>

      <FlatList
        data={people}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#6750A4" />}
        ListEmptyComponent={<Text style={styles.empty}>{emptyLabel}</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => router.push(`${detailRouteBase}/${item.id}`)}>
            <Text style={styles.cardName}>{item.fullName}</Text>
            <Text style={styles.cardMeta}>{item.mealCount} meals logged</Text>
          </Pressable>
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
