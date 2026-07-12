import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable, FlatList, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { apiGet } from "../lib/api";
import { supabase } from "../lib/supabase";
import { colors, radii } from "../lib/theme";

interface WorkspaceResponse {
  workspace: { id: string; name: string };
  caregiverName?: string | null;
  coachName?: string | null;
}

interface Goal {
  status: string;
  title: string;
}

interface Person {
  id: string;
  fullName: string;
  mealCount: number;
  lastMealAt?: string;
  goals?: Goal[];
}

interface PeopleDashboardProps {
  workspacePath: string;
  listPath: string;
  listKey: "contacts" | "clients";
  emptyLabel: string;
  detailRouteBase: string;
}

function initials(name: string): string {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

function formatRelative(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return minutes <= 1 ? "just now" : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Shared by app/(app)/family/index.tsx and app/(app)/coach/index.tsx —
// those are deliberately separate route files/flows per product, but the
// list-of-people layout is identical between them, only the endpoints and
// copy differ (Self skips this screen entirely, see app/(app)/self/index.tsx).
// Visual language mirrors the web dashboard's ContactCard/ClientCard —
// see src/components/adults/AdultsDashboardClient.tsx and
// src/components/gym/ClientCard.tsx.
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
        <ActivityIndicator size="large" color={colors.primary} />
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
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{name ? `Hi, ${name.split(" ")[0]} 👋` : "Your dashboard"}</Text>
          <Text style={styles.subtitle}>{workspace?.workspace.name}</Text>
        </View>
      </View>

      <FlatList
        data={people}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
        ListEmptyComponent={<Text style={styles.empty}>{emptyLabel}</Text>}
        renderItem={({ item }) => {
          const activeGoal = item.goals?.find((g) => g.status === "active");
          return (
            <Pressable style={styles.card} onPress={() => router.push(`${detailRouteBase}/${item.id}`)}>
              <View style={styles.cardRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials(item.fullName)}</Text>
                  {item.mealCount > 0 && <View style={styles.presenceDot} />}
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardName}>{item.fullName}</Text>
                  {item.mealCount > 0 ? (
                    <View style={styles.metaRow}>
                      <View style={styles.activityBanner}>
                        <Text style={styles.activityText}>🍽️ {item.mealCount} logged</Text>
                      </View>
                      {item.lastMealAt && <Text style={styles.cardMeta}>Last: {formatRelative(item.lastMealAt)}</Text>}
                    </View>
                  ) : (
                    <Text style={styles.cardMeta}>No meals logged yet</Text>
                  )}
                  {activeGoal && (
                    <View style={styles.goalPill}>
                      <Text style={styles.goalText}>🎯 {activeGoal.title}</Text>
                    </View>
                  )}
                </View>
              </View>
            </Pressable>
          );
        }}
      />

      <Pressable style={styles.signOut} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, paddingTop: 60, paddingHorizontal: 20 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.surface },
  header: { marginBottom: 20 },
  greeting: { fontSize: 24, fontWeight: "700", color: colors.textPrimary },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
  list: { paddingBottom: 24 },
  empty: { color: colors.textMeta, textAlign: "center", marginTop: 40 },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 14, fontWeight: "700", color: colors.primary },
  presenceDot: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 12,
    height: 12,
    borderRadius: radii.full,
    backgroundColor: colors.activityDot,
    borderWidth: 2,
    borderColor: colors.white,
  },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: "600", color: colors.textPrimary, marginBottom: 4 },
  cardMeta: { fontSize: 12, color: colors.textMeta },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  activityBanner: {
    backgroundColor: colors.activityBg,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  activityText: { fontSize: 12, fontWeight: "600", color: colors.activityText },
  goalPill: {
    backgroundColor: colors.primaryLight,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
    marginTop: 6,
  },
  goalText: { fontSize: 11, fontWeight: "600", color: colors.primary },
  error: { color: colors.error, padding: 20, textAlign: "center" },
  signOut: { alignItems: "center", paddingVertical: 16 },
  signOutText: { color: colors.error, fontSize: 14, fontWeight: "500" },
});
