import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, FlatList, Pressable, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { apiGet } from "../lib/api";
import { colors, radii, mealEmoji } from "../lib/theme";
import { classifyMeal, type ClassifiableMeal } from "../lib/nutrition/food-classification";
import { applyHumanCorrection, type HumanCorrectionFields } from "../lib/nutrition/human-corrections";
import { buildHabitDashboard } from "../lib/nutrition/habit-insights";
import { recommendProteinGrams } from "../lib/nutrition/protein-recommendation";
import { filterByDateRange, getDateRangeDayCount, type DashboardDateRange } from "../lib/dashboard/date-range";
import {
  TrendCardGrid,
  HealthCard,
  WeeklyFocusCard,
  HabitMomentumCard,
  FoodPatternSpectrumCard,
  WeeklyProgressBoard,
} from "./HabitDashboard";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { MacroBarChart, type DayDatum } from "./MacroBarChart";
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
  aiSummary?: string;
  humanCorrection?: HumanCorrectionFields;
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
  goals?: Array<{ status: string; targetProteinG?: number; targetCaloriesMin?: number; targetCaloriesMax?: number }>;
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

function midpoint(min: number, max: number): number {
  return (min + max) / 2;
}

/** Same day-bucketing pattern as buildDayData() in the web app's
 * MacroCharts.tsx — per-day totals are the midpoint of each meal's
 * min/max range, summed across all meals logged that day. */
function buildDailyTotals(meals: Meal[], days: number): { protein: DayDatum[]; calories: DayDatum[] } {
  const protein: DayDatum[] = [];
  const calories: DayDatum[] = [];
  const d = new Date();
  for (let i = 0; i < days; i++) {
    const day = new Date(d);
    day.setDate(day.getDate() - (days - 1 - i));
    const key = day.toISOString().slice(0, 10);
    const label = day.toLocaleDateString(undefined, { weekday: "short" });
    const dayMeals = meals.filter((m) => m.loggedAt.slice(0, 10) === key);
    protein.push({ label, value: Math.round(dayMeals.reduce((s, m) => s + midpoint(m.totalProteinMin, m.totalProteinMax), 0)) });
    calories.push({ label, value: Math.round(dayMeals.reduce((s, m) => s + midpoint(m.totalCaloriesMin, m.totalCaloriesMax), 0)) });
  }
  return { protein, calories };
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
// primary-color header bar, habit-insights sections, macro charts,
// activity heatmap) — see src/components/adults/dashboard/ContactDashboard.tsx.
export function PersonDetail({ apiPath, showBackButton = true, onSignOut }: PersonDetailProps) {
  const router = useRouter();
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DashboardDateRange>("this_week");

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

  const classifiedMeals = useMemo(() => {
    if (!detail) return [];
    return detail.meals.map((m) => {
      const classifiable: ClassifiableMeal = { id: m.id, loggedAt: m.loggedAt, mealType: m.mealType, foods: m.foods, aiSummary: m.aiSummary };
      return applyHumanCorrection(classifyMeal(classifiable), m.humanCorrection);
    });
  }, [detail]);

  const habitDashboard = useMemo(() => buildHabitDashboard(classifiedMeals), [classifiedMeals]);

  const weekStats = useMemo(() => {
    if (!detail) return null;
    const mealsInRange = filterByDateRange(detail.meals, dateRange);
    const daysLogged = new Set(mealsInRange.map((m) => m.loggedAt.slice(0, 10))).size;
    const earliestMealAt = detail.meals.length
      ? new Date(Math.min(...detail.meals.map((m) => new Date(m.loggedAt).getTime())))
      : undefined;
    const rangeDays = getDateRangeDayCount(dateRange, new Date(), earliestMealAt);
    const avgProtein = Math.round(mealsInRange.reduce((s, m) => s + midpoint(m.totalProteinMin, m.totalProteinMax), 0) / rangeDays);
    const avgCalories = Math.round(mealsInRange.reduce((s, m) => s + midpoint(m.totalCaloriesMin, m.totalCaloriesMax), 0) / rangeDays);
    return { mealsThisWeek: mealsInRange.length, daysLogged, rangeDays, avgProtein, avgCalories };
  }, [detail, dateRange]);

  const dailyTotals = useMemo(() => (detail ? buildDailyTotals(detail.meals, 7) : null), [detail]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !detail || !weekStats || !dailyTotals) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? "Not found."}</Text>
      </View>
    );
  }

  const person = detail.contact ?? detail.client;
  const name = person?.fullName ?? "Unknown";
  const latestBiomarker = detail.biomarkers?.[detail.biomarkers.length - 1];
  const activeGoal = person?.goals?.find((g) => g.status === "active");
  const proteinTarget = activeGoal?.targetProteinG ?? recommendProteinGrams({
    weightKg: person?.weightKg,
    heightCm: person?.heightCm,
    age: person?.age,
    gender: person?.gender,
  });
  const calTarget = activeGoal?.targetCaloriesMin;

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
          <View style={styles.sections}>
            <DateRangeSelector value={dateRange} onChange={setDateRange} />

            <View style={styles.healthRow}>
              <HealthCard icon="🍽️" label="Meals this week" value={String(weekStats.mealsThisWeek)} sub={`${weekStats.daysLogged} of ${weekStats.rangeDays} days`} ok={weekStats.rangeDays > 1 ? weekStats.daysLogged / weekStats.rangeDays >= 0.7 : undefined} />
              <HealthCard icon="🥩" label="Avg protein/day" value={weekStats.avgProtein > 0 ? `${weekStats.avgProtein}g` : "—"} sub={`target: ${proteinTarget}g`} ok={weekStats.avgProtein >= proteinTarget * 0.8} />
              <HealthCard icon="🔥" label="Avg calories/day" value={weekStats.avgCalories > 0 ? String(weekStats.avgCalories) : "—"} sub={calTarget ? `≥${calTarget} kcal` : "kcal"} ok={calTarget ? weekStats.avgCalories >= calTarget * 0.8 : undefined} />
            </View>

            <Text style={styles.sectionTitle}>Weekly trends</Text>
            <TrendCardGrid cards={[habitDashboard.proteinTrend, habitDashboard.balancedPlateTrend, habitDashboard.healthierDirectionTrend]} />

            <WeeklyFocusCard focus={habitDashboard.weeklyFocus} />

            <View style={styles.twoCol}>
              <View style={styles.twoColItem}><HabitMomentumCard momentum={habitDashboard.habitMomentum} /></View>
              <View style={styles.twoColItem}><FoodPatternSpectrumCard spectrum={habitDashboard.patternSpectrum} /></View>
            </View>

            <MacroBarChart title="Protein (last 7 days)" data={dailyTotals.protein} unit="g" barColor={colors.primary} target={proteinTarget} />
            <MacroBarChart title="Calories (last 7 days)" data={dailyTotals.calories} unit=" kcal" barColor="#6366F1" target={calTarget} />

            <Text style={styles.sectionTitle}>Weekly progress</Text>
            <WeeklyProgressBoard metrics={habitDashboard.weeklyProgress} />

            <Text style={styles.sectionTitle}>Activity (last 30 days)</Text>
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
  sections: { gap: 16, marginBottom: 8 },
  healthRow: { flexDirection: "row", gap: 10 },
  twoCol: { flexDirection: "row", gap: 10 },
  twoColItem: { flex: 1 },
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
  summary: { fontSize: 14, color: "#4B5563", marginBottom: 8 },
  macroRow: { flexDirection: "row", gap: 12 },
  macroProtein: { fontSize: 12, fontWeight: "600", color: colors.primary },
  macroCalories: { fontSize: 12, color: colors.textSecondary },
  error: { color: colors.error, padding: 20, textAlign: "center" },
});
