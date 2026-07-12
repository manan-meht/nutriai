import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, FlatList, Pressable, RefreshControl, Image, Modal } from "react-native";
import { useRouter } from "expo-router";
import { apiGet } from "../lib/api";
import { colors, radii, mealEmoji } from "../lib/theme";
import {
  recommendProteinGrams,
  filterByDateRange,
  getDateRangeDayCount,
  type DashboardDateRange,
} from "@nutriai/dashboard-core";
import { proteinTargetG, calculateEnergyTargetRange, type FoodBalanceUserProfile, type NutritionGoal } from "@nutriai/health-scoring";
import { NUTRITION_GOAL_LABELS } from "../lib/goalOptions";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { MacronutrientSummary } from "./MacronutrientSummary";
import { FoodBalanceScoreCard } from "./FoodBalanceScoreCard";
import { DateRangeSelector } from "./DateRangeSelector";

interface Meal {
  id: string;
  mealType: string;
  loggedAt: string;
  foods: Array<{ name: string }>;
  totalCaloriesMin: number;
  totalCaloriesMax: number;
  totalProteinMin: number;
  totalProteinMax: number;
  totalCarbsMin: number;
  totalCarbsMax: number;
  totalFatMin: number;
  totalFatMax: number;
  totalFiberMin: number;
  totalFiberMax: number;
  aiSummary?: string;
  imageUrl?: string;
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

interface PersonSummary {
  fullName: string;
  age?: number;
  gender?: string;
  weightKg?: number;
  heightCm?: number;
  dateOfBirth?: string;
  metabolicEquationSex?: string;
  activityLevel?: string;
  resistanceTrainingStatus?: string;
  targetWeightKg?: number;
  primaryNutritionGoal?: string;
}

// Adults nests under `contact`, gym under `client`; only gym's response
// includes workouts/biomarkers.
interface DetailResponse {
  contact?: PersonSummary;
  client?: PersonSummary;
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
  /** Whichever query param the /food-balance-score endpoint needs — passed
   * separately from apiPath since that endpoint lives at its own route,
   * not nested under /adults or /gym (see FoodBalanceScoreCard.tsx). */
  foodBalanceQuery: { contactId?: string; clientId?: string };
  /** Shows a back button when true (Family/Coach, reached via a list
   * screen) — Self skips straight here from login, so there's nothing to
   * go back to; it shows a sign-out link in that spot instead. */
  showBackButton?: boolean;
  onSignOut?: () => void;
  /** Route to the edit screen (see PersonForm.tsx) — omitted for Self,
   * which edits its own details via a different flow (not built yet). */
  editRoute?: string;
}

// Shared by app/(app)/family/person/[id]/index.tsx,
// app/(app)/coach/person/[id]/index.tsx, and app/(app)/self/index.tsx
// (Self skips the list screen and lands here directly after login) —
// those are deliberately separate route files/flows per product, but the
// meal-history layout is identical. Mirrors
// src/components/adults/dashboard/ContactDashboard.tsx's 6-section layout
// exactly: (1) greeting + date range + inline goal, (2) Food Balance
// Score, (3) macronutrient summary, (4) key metric cards, (5) activity
// heatmap, (6) recent meals with a tap-to-open photo modal.
export function PersonDetail({ apiPath, foodBalanceQuery, showBackButton = true, onSignOut, editRoute }: PersonDetailProps) {
  const router = useRouter();
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DashboardDateRange>("this_week");
  const [modalPhoto, setModalPhoto] = useState<{ url: string; label: string } | null>(null);

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

  const person = detail.contact ?? detail.client;
  const name = person?.fullName ?? "Unknown";
  const latestBiomarker = detail.biomarkers?.[detail.biomarkers.length - 1];

  // Food Balance Score profile — same computation as
  // ContactDashboard.tsx/ClientDashboard.tsx on web, so the displayed
  // protein/calorie targets match exactly regardless of platform.
  const foodBalanceProfile: FoodBalanceUserProfile | undefined = person?.primaryNutritionGoal
    ? {
        goal: person.primaryNutritionGoal as NutritionGoal,
        dateOfBirth: person.dateOfBirth,
        age: person.age,
        heightCm: person.heightCm,
        currentWeightKg: person.weightKg,
        metabolicEquationSex: person.metabolicEquationSex as FoodBalanceUserProfile["metabolicEquationSex"],
        activityLevel: person.activityLevel as FoodBalanceUserProfile["activityLevel"],
        resistanceTraining: person.resistanceTrainingStatus as FoodBalanceUserProfile["resistanceTraining"],
        targetWeightKg: person.targetWeightKg,
      }
    : undefined;

  const recommendedProteinG = recommendProteinGrams({
    weightKg: person?.weightKg,
    heightCm: person?.heightCm,
    age: person?.age,
    gender: person?.gender,
  });
  const proteinRange = foodBalanceProfile ? proteinTargetG(foodBalanceProfile) : null;
  const proteinTarget = proteinRange ? Math.round((proteinRange.lower + proteinRange.upper) / 2) : recommendedProteinG;
  const isRecommendedProtein = !proteinRange;
  const energyRange = foodBalanceProfile ? calculateEnergyTargetRange(foodBalanceProfile, foodBalanceProfile.goal) : null;
  const calTarget = energyRange ? Math.round(energyRange.lowerKcal) : undefined;

  const mealsInRange = filterByDateRange(detail.meals, dateRange);
  const daysLogged = new Set(mealsInRange.map((m) => m.loggedAt.slice(0, 10))).size;
  const earliestMealAt = detail.meals.length
    ? new Date(Math.min(...detail.meals.map((m) => new Date(m.loggedAt).getTime())))
    : undefined;
  const rangeDays = getDateRangeDayCount(dateRange, new Date(), earliestMealAt);
  const avgProtein = Math.round(mealsInRange.reduce((s, m) => s + (m.totalProteinMin + m.totalProteinMax) / 2, 0) / rangeDays);
  const avgCalories = Math.round(mealsInRange.reduce((s, m) => s + (m.totalCaloriesMin + m.totalCaloriesMax) / 2, 0) / rangeDays);

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
          <View style={styles.headerNameBlock}>
            <Text style={styles.name}>{name}</Text>
            <Text style={styles.subtitle}>{detail.meals.length} meal{detail.meals.length === 1 ? "" : "s"} logged</Text>
          </View>
          {editRoute && (
            <Pressable style={styles.headerAction} onPress={() => router.push(editRoute)}>
              <Text style={styles.headerActionText}>Edit</Text>
            </Pressable>
          )}
        </View>
      </View>

      <FlatList
        data={detail.meals}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
        ListHeaderComponent={
          <View style={styles.sections}>
            {/* Section 1 — greeting + date-range selector + inline goal. */}
            <View>
              <DateRangeSelector value={dateRange} onChange={setDateRange} />
              <View style={styles.goalRow}>
                <View style={styles.goalPill}>
                  <Text style={styles.goalPillText}>
                    🎯 {person?.primaryNutritionGoal
                      ? NUTRITION_GOAL_LABELS[person.primaryNutritionGoal as NutritionGoal] ?? person.primaryNutritionGoal
                      : "No goal set yet"}
                  </Text>
                </View>
              </View>
            </View>

            {/* Section 2 — Food Balance Score, recommendations included
                inside the card itself once available. */}
            <FoodBalanceScoreCard {...foodBalanceQuery} />

            {/* Section 3 — Macronutrient summary. */}
            <MacronutrientSummary meals={mealsInRange} days={rangeDays} targets={{ protein: proteinTarget }} />

            {/* Section 4 — key metric cards. */}
            <View style={styles.healthRow}>
              <HealthCard icon="🍽️" label="Meals logged" value={String(mealsInRange.length)} sub={`${daysLogged} of ${rangeDays} days`} ok={rangeDays > 1 ? daysLogged / rangeDays >= 0.7 : undefined} />
              <HealthCard icon="🌱" label="Avg protein/day" value={avgProtein > 0 ? `${avgProtein}g` : "—"} sub={`target: ${proteinTarget}g${isRecommendedProtein ? " (recommended)" : ""}`} ok={avgProtein >= proteinTarget * 0.8} />
              <HealthCard icon="🔥" label="Avg calories/day" value={avgCalories > 0 ? String(avgCalories) : "—"} sub={calTarget ? `target: ≥${calTarget}` : "kcal"} ok={calTarget ? avgCalories >= calTarget * 0.8 : undefined} />
            </View>

            {/* Section 5 — activity heatmap. */}
            <Text style={styles.sectionTitle}>Meal activity – last 30 days</Text>
            <ActivityHeatmap meals={detail.meals} workouts={detail.workouts} />

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

            {/* Section 6 — recent meals. */}
            <Text style={styles.sectionTitle}>Recent meals</Text>
          </View>
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
            {item.imageUrl && (
              <Pressable onPress={() => setModalPhoto({ url: item.imageUrl!, label: item.mealType })}>
                <Image source={{ uri: item.imageUrl }} style={styles.mealPhoto} resizeMode="cover" />
              </Pressable>
            )}
            {item.aiSummary && <Text style={styles.summary}>{item.aiSummary}</Text>}
            <View style={styles.macroRow}>
              <Text style={styles.macroProtein}>{formatRange(item.totalProteinMin, item.totalProteinMax, "g")} protein</Text>
              <Text style={styles.macroCalories}>{formatRange(item.totalCaloriesMin, item.totalCaloriesMax)} cal</Text>
            </View>
          </View>
        )}
      />

      <Modal visible={!!modalPhoto} transparent animationType="fade" onRequestClose={() => setModalPhoto(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setModalPhoto(null)}>
          {modalPhoto && (
            <Image source={{ uri: modalPhoto.url }} style={styles.modalImage} resizeMode="contain" />
          )}
        </Pressable>
      </Modal>
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
  headerNameBlock: { flex: 1 },
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
  sections: { gap: 16, marginBottom: 8 },
  goalRow: { flexDirection: "row", marginTop: 10 },
  goalPill: { backgroundColor: colors.primaryLight, borderRadius: radii.full, paddingHorizontal: 12, paddingVertical: 6 },
  goalPillText: { fontSize: 12, fontWeight: "700", color: colors.primary },
  healthRow: { flexDirection: "row", gap: 10 },
  section: {},
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
  mealPhoto: { width: "100%", height: 160, borderRadius: radii.pill, marginVertical: 8 },
  summary: { fontSize: 14, color: "#4B5563", marginBottom: 8 },
  macroRow: { flexDirection: "row", gap: 12 },
  macroProtein: { fontSize: 12, fontWeight: "600", color: colors.primary },
  macroCalories: { fontSize: 12, color: colors.textSecondary },
  error: { color: colors.error, padding: 20, textAlign: "center" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)", alignItems: "center", justifyContent: "center" },
  modalImage: { width: "100%", height: "80%" },
});

function HealthCard({
  icon,
  label,
  value,
  sub,
  ok,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  ok?: boolean;
}) {
  const palette = ok === true ? colors.good : ok === false ? colors.support : null;
  return (
    <View style={[healthCardStyles.card, palette && { backgroundColor: palette.bg }]}>
      <Text style={healthCardStyles.icon}>{icon}</Text>
      <Text style={[healthCardStyles.value, palette && { color: palette.text }]}>{value}</Text>
      <Text style={[healthCardStyles.label, palette && { color: palette.text }]}>{label}</Text>
      {sub && <Text style={[healthCardStyles.sub, palette && { color: palette.text }]}>{sub}</Text>}
    </View>
  );
}

const healthCardStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    padding: 12,
  },
  icon: { fontSize: 18, marginBottom: 4 },
  value: { fontSize: 18, fontWeight: "700", color: colors.textPrimary },
  label: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  sub: { fontSize: 10, color: colors.textMeta, marginTop: 2 },
});
