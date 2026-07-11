import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, FlatList, Pressable, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { apiGet } from "../lib/api";
import { colors, radii, mealEmoji } from "../lib/theme";

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

function initials(name: string): string {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
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
// Visual language mirrors the web app's contact detail page (solid
// primary-color header bar) — see
// src/components/adults/dashboard/ContactDashboard.tsx.
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
        <ActivityIndicator size="large" color={colors.primary} />
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
      <View style={styles.header}>
        {showBackButton ? (
          <Pressable style={styles.headerAction} onPress={() => router.back()}>
            <Text style={styles.headerActionText}>← Back</Text>
          </Pressable>
        ) : (
          onSignOut && (
            <Pressable style={styles.headerAction} onPress={onSignOut}>
              <Text style={styles.headerActionText}>Sign out</Text>
            </Pressable>
          )
        )}
        <View style={styles.headerRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(name)}</Text>
          </View>
          <View>
            <Text style={styles.name}>{name}</Text>
            <Text style={styles.subtitle}>{detail.meals.length} meal{detail.meals.length === 1 ? "" : "s"} logged</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={detail.meals}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
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
              <Text style={styles.mealType}>
                {mealEmoji(item.mealType)} {item.mealType.charAt(0).toUpperCase() + item.mealType.slice(1)}
              </Text>
              <Text style={styles.loggedAt}>{new Date(item.loggedAt).toLocaleDateString()}</Text>
            </View>
            {item.aiSummary && <Text style={styles.summary}>{item.aiSummary}</Text>}
            <View style={styles.macroRow}>
              <Text style={styles.macroProtein}>{formatRange(item.totalProteinMin, item.totalProteinMax, "g")} protein</Text>
              <Text style={styles.macroCalories}>{formatRange(item.totalCaloriesMin, item.totalCaloriesMax)} cal</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.surface },
  header: { backgroundColor: colors.primary, paddingTop: 56, paddingBottom: 20, paddingHorizontal: 20 },
  headerAction: { marginBottom: 16 },
  headerActionText: { color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: "500" },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 15, fontWeight: "700", color: colors.white },
  name: { fontSize: 20, fontWeight: "700", color: colors.white },
  subtitle: { fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  list: { padding: 20, paddingBottom: 24 },
  empty: { color: colors.textMeta, textAlign: "center", marginTop: 40 },
  headerSections: { marginBottom: 8 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 12, fontWeight: "700", color: colors.textMeta, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  sectionMeta: { fontSize: 15, color: colors.textPrimary },
  workoutRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  workoutDesc: { fontSize: 14, color: colors.textPrimary, flexShrink: 1 },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 10,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  mealType: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  loggedAt: { fontSize: 12, color: colors.textMeta },
  summary: { fontSize: 14, color: "#4B5563", marginBottom: 8 },
  macroRow: { flexDirection: "row", gap: 12 },
  macroProtein: { fontSize: 12, fontWeight: "600", color: colors.primary },
  macroCalories: { fontSize: 12, color: colors.textSecondary },
  error: { color: colors.error, padding: 20, textAlign: "center" },
});
