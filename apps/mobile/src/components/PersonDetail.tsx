import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, FlatList, Pressable, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { apiGet } from "../lib/api";

interface Meal {
  id: string;
  mealType: string;
  loggedAt: string;
  totalCaloriesMin: number;
  totalCaloriesMax: number;
  totalProteinMin: number;
  totalProteinMax: number;
  aiSummary?: string;
}

interface Workout {
  id: string;
  loggedAt: string;
  description?: string;
  workoutType?: string;
  durationMinutes?: number;
}

interface Biomarker {
  id: string;
  loggedAt: string;
  weightKg?: number;
  bmi?: number;
}

// Adults nests under `contact`, gym under `client`; only gym's response
// includes workouts/biomarkers.
interface DetailResponse {
  contact?: { fullName: string };
  client?: { fullName: string };
  meals: Meal[];
  workouts?: Workout[];
  biomarkers?: Biomarker[];
}

function formatRange(min: number, max: number, unit = ""): string {
  const lo = Math.round(min);
  const hi = Math.round(max);
  return lo === hi ? `${lo}${unit}` : `${lo}–${hi}${unit}`;
}

interface PersonDetailProps {
  apiPath: string;
  /** Shows a back button when true (Family/Coach, reached via a list
   * screen) — Self skips straight here from login, so there's nothing to
   * go back to; it shows a sign-out link in that spot instead. */
  showBackButton?: boolean;
  onSignOut?: () => void;
}

// Shared by app/(app)/family/person/[id].tsx, app/(app)/coach/person/[id].tsx,
// and app/(app)/self/index.tsx (Self skips the list screen and lands here
// directly after login) — those are deliberately separate route
// files/flows per product, but the meal-history layout is identical.
export function PersonDetail({ apiPath, showBackButton = true, onSignOut }: PersonDetailProps) {
  const router = useRouter();
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      try {
        setDetail(await apiGet<DetailResponse>(apiPath));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        isRefresh ? setRefreshing(false) : setLoading(false);
      }
    },
    [apiPath]
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

  if (error || !detail) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? "Not found."}</Text>
      </View>
    );
  }

  const name = detail.contact?.fullName ?? detail.client?.fullName ?? "Unknown";
  const latestBiomarker = detail.biomarkers?.[detail.biomarkers.length - 1];

  return (
    <View style={styles.container}>
      {showBackButton ? (
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
      ) : (
        onSignOut && (
          <Pressable style={styles.back} onPress={onSignOut}>
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        )
      )}

      <Text style={styles.name}>{name}</Text>
      <Text style={styles.subtitle}>{detail.meals.length} meal{detail.meals.length === 1 ? "" : "s"} logged</Text>

      <FlatList
        data={detail.meals}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#6750A4" />}
        ListHeaderComponent={
          detail.workouts?.length || latestBiomarker ? (
            <View style={styles.headerSections}>
              {latestBiomarker && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Latest measurements</Text>
                  <Text style={styles.sectionMeta}>
                    {latestBiomarker.weightKg != null ? `${latestBiomarker.weightKg}kg` : ""}
                    {latestBiomarker.bmi != null ? ` · BMI ${latestBiomarker.bmi}` : ""}
                  </Text>
                </View>
              )}
              {detail.workouts && detail.workouts.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Recent workouts</Text>
                  {detail.workouts.slice(0, 5).map((w) => (
                    <View key={w.id} style={styles.workoutRow}>
                      <Text style={styles.workoutDesc}>
                        {w.workoutType ?? w.description ?? "Workout"}
                        {w.durationMinutes ? ` · ${w.durationMinutes}min` : ""}
                      </Text>
                      <Text style={styles.loggedAt}>{new Date(w.loggedAt).toLocaleDateString()}</Text>
                    </View>
                  ))}
                </View>
              )}
              <Text style={styles.sectionTitle}>Meals</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={<Text style={styles.empty}>No meals logged yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.mealType}>{item.mealType.charAt(0).toUpperCase() + item.mealType.slice(1)}</Text>
              <Text style={styles.loggedAt}>{new Date(item.loggedAt).toLocaleDateString()}</Text>
            </View>
            {item.aiSummary && <Text style={styles.summary}>{item.aiSummary}</Text>}
            <Text style={styles.macros}>
              {formatRange(item.totalCaloriesMin, item.totalCaloriesMax)} cal · {formatRange(item.totalProteinMin, item.totalProteinMax, "g")} protein
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", paddingTop: 56, paddingHorizontal: 20 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" },
  back: { marginBottom: 12 },
  backText: { color: "#6750A4", fontSize: 15, fontWeight: "500" },
  signOutText: { color: "#c00", fontSize: 15, fontWeight: "500" },
  name: { fontSize: 24, fontWeight: "700", color: "#111" },
  subtitle: { fontSize: 14, color: "#666", marginTop: 2, marginBottom: 20 },
  list: { paddingBottom: 24 },
  empty: { color: "#999", textAlign: "center", marginTop: 40 },
  headerSections: { marginBottom: 8 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: "#999", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  sectionMeta: { fontSize: 15, color: "#111" },
  workoutRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  workoutDesc: { fontSize: 14, color: "#111", flexShrink: 1 },
  card: {
    backgroundColor: "#f7f5fb",
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  mealType: { fontSize: 15, fontWeight: "600", color: "#111" },
  loggedAt: { fontSize: 13, color: "#999" },
  summary: { fontSize: 14, color: "#444", marginBottom: 6 },
  macros: { fontSize: 13, color: "#666" },
  error: { color: "#c00", padding: 20, textAlign: "center" },
});
