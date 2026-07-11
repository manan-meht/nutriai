import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, FlatList, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { apiGet } from "../../../src/lib/api";
import { supabase } from "../../../src/lib/supabase";
import { detectProductFromEmail } from "../../../src/lib/product";

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

// Both mobile-api detail responses share this shape closely enough to
// read generically here — adults nests under `contact`, gym under
// `client`; gym's response also includes `workouts`/`biomarkers`, not
// shown yet in this first pass (meal history only, matching what's common
// to both products).
interface DetailResponse {
  contact?: { fullName: string };
  client?: { fullName: string };
  meals: Meal[];
}

function formatRange(min: number, max: number, unit = ""): string {
  const lo = Math.round(min);
  const hi = Math.round(max);
  return lo === hi ? `${lo}${unit}` : `${lo}–${hi}${unit}`;
}

export default function PersonDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const product = detectProductFromEmail(data.session?.user.email);
      const path = product === "adults" ? `/adults/contacts/${id}` : `/gym/clients/${id}`;
      apiGet<DetailResponse>(path)
        .then(setDetail)
        .catch((err) => setError(err instanceof Error ? err.message : "Something went wrong."))
        .finally(() => setLoading(false));
    });
  }, [id]);

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

  return (
    <View style={styles.container}>
      <Pressable style={styles.back} onPress={() => router.back()}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      <Text style={styles.name}>{name}</Text>
      <Text style={styles.subtitle}>{detail.meals.length} meal{detail.meals.length === 1 ? "" : "s"} logged</Text>

      <FlatList
        data={detail.meals}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
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
  name: { fontSize: 24, fontWeight: "700", color: "#111" },
  subtitle: { fontSize: 14, color: "#666", marginTop: 2, marginBottom: 20 },
  list: { paddingBottom: 24 },
  empty: { color: "#999", textAlign: "center", marginTop: 40 },
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
