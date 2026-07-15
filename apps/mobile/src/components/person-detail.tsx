import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { ActivityHeatmap } from './activity-heatmap';
import { DateRangeSelector } from './date-range-selector';
import { FoodBalanceScoreCard } from './food-balance-score-card';
import { MacronutrientSummary } from './macronutrient-summary';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { BiomarkerLog, FoodBalanceProfileFields, MealLog, WorkoutLog } from '@/lib/api';
import { filterByDateRange, getDateRangeDayCount, DEFAULT_DASHBOARD_DATE_RANGE, recommendProteinGrams, type DashboardDateRange } from '@nutriai/dashboard-core';
import { NUTRITION_GOAL_LABELS } from '@/lib/goals';
import { calculateEnergyTargetRange, proteinTargetG, type FoodBalanceUserProfile } from '@nutriai/health-scoring';

interface PersonLike extends FoodBalanceProfileFields {
  fullName: string;
  age?: number;
  gender?: string;
  weightKg?: number;
  heightCm?: number;
}

// Shared by (app)/adults/[contactId].tsx and (app)/gym/[clientId].tsx —
// ported from nutriai-fresh's apps/mobile/src/components/PersonDetail.tsx,
// which is itself shared by that app's family/coach/self detail screens.
// Mirrors nutriai-fresh's main web app's ContactDashboard.tsx/
// ClientDashboard.tsx 6-section layout: (1) date range + inline goal, (2)
// Food Balance Score, (3) macronutrient summary, (4) key metric cards, (5)
// activity heatmap, (6) recent meals with a tap-to-open photo modal —
// workouts/biomarkers (gym only) inserted between (5) and (6) when present.
export function PersonDetail({
  person,
  meals,
  workouts,
  biomarkers,
  foodBalanceQuery,
}: {
  person: PersonLike;
  meals: MealLog[];
  workouts?: WorkoutLog[];
  biomarkers?: BiomarkerLog[];
  foodBalanceQuery: { contactId: string } | { clientId: string };
}) {
  const theme = useTheme();
  const [dateRange, setDateRange] = useState<DashboardDateRange>(DEFAULT_DASHBOARD_DATE_RANGE);
  const [modalPhoto, setModalPhoto] = useState<{ url: string; label: string } | null>(null);

  const latestBiomarker = biomarkers?.[biomarkers.length - 1];

  // Food Balance Score profile — same computation as the web dashboards, so
  // the displayed protein/calorie targets match exactly regardless of
  // platform.
  const foodBalanceProfile: FoodBalanceUserProfile | undefined = person.primaryNutritionGoal
    ? {
        goal: person.primaryNutritionGoal,
        dateOfBirth: person.dateOfBirth,
        age: person.age,
        heightCm: person.heightCm,
        currentWeightKg: person.weightKg,
        metabolicEquationSex: person.metabolicEquationSex,
        activityLevel: person.activityLevel,
        resistanceTraining: person.resistanceTrainingStatus,
        targetWeightKg: person.targetWeightKg,
      }
    : undefined;

  const recommendedProteinG = recommendProteinGrams({
    weightKg: person.weightKg,
    heightCm: person.heightCm,
    age: person.age,
    gender: person.gender,
  });
  const proteinRange = foodBalanceProfile ? proteinTargetG(foodBalanceProfile) : null;
  const proteinTarget = proteinRange ? Math.round((proteinRange.lower + proteinRange.upper) / 2) : recommendedProteinG;
  const isRecommendedProtein = !proteinRange;
  const energyRange = foodBalanceProfile ? calculateEnergyTargetRange(foodBalanceProfile, foodBalanceProfile.goal) : null;
  const calTarget = energyRange ? Math.round(energyRange.lowerKcal) : undefined;

  const mealsInRange = filterByDateRange(meals, dateRange);
  const daysLogged = new Set(mealsInRange.map((m) => m.loggedAt.slice(0, 10))).size;
  const earliestMealAt = meals.length ? new Date(Math.min(...meals.map((m) => new Date(m.loggedAt).getTime()))) : undefined;
  const rangeDays = getDateRangeDayCount(dateRange, new Date(), earliestMealAt);
  const avgProtein = Math.round(mealsInRange.reduce((s, m) => s + (m.totalProteinMin + m.totalProteinMax) / 2, 0) / rangeDays);
  const avgCalories = Math.round(mealsInRange.reduce((s, m) => s + (m.totalCaloriesMin + m.totalCaloriesMax) / 2, 0) / rangeDays);

  return (
    <>
      <FlatList
        data={meals}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.sections}>
            <View>
              <ThemedText type="title" style={styles.name}>
                {person.fullName}
              </ThemedText>
              <ThemedText type="default" themeColor="textSecondary" style={styles.subtitle}>
                {[person.age && `${person.age}y`, person.gender].filter(Boolean).join(' · ') || 'No profile details yet'}
              </ThemedText>

              <DateRangeSelector value={dateRange} onChange={setDateRange} />
              <ThemedView type="backgroundSelected" style={styles.goalPill}>
                <ThemedText type="small" style={styles.goalPillText}>
                  🎯 {person.primaryNutritionGoal ? NUTRITION_GOAL_LABELS[person.primaryNutritionGoal] ?? person.primaryNutritionGoal : 'No goal set yet'}
                </ThemedText>
              </ThemedView>
            </View>

            <FoodBalanceScoreCard {...foodBalanceQuery} />

            <MacronutrientSummary meals={mealsInRange} days={rangeDays} targets={{ protein: proteinTarget }} />

            <View style={styles.healthRow}>
              <HealthCard
                icon="🍽️"
                label="Meals logged"
                value={String(mealsInRange.length)}
                sub={`${daysLogged} of ${rangeDays} days`}
                ok={rangeDays > 1 ? daysLogged / rangeDays >= 0.7 : undefined}
              />
              <HealthCard
                icon="🌱"
                label="Avg protein/day"
                value={avgProtein > 0 ? `${avgProtein}g` : '—'}
                sub={`target: ${proteinTarget}g${isRecommendedProtein ? ' (recommended)' : ''}`}
                ok={avgProtein >= proteinTarget * 0.8}
              />
              <HealthCard
                icon="🔥"
                label="Avg calories/day"
                value={avgCalories > 0 ? String(avgCalories) : '—'}
                sub={calTarget ? `target: ≥${calTarget}` : 'kcal'}
                ok={calTarget ? avgCalories >= calTarget * 0.8 : undefined}
              />
            </View>

            <View>
              <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
                Meal activity – last 30 days
              </ThemedText>
              <ActivityHeatmap meals={meals} workouts={workouts} />
            </View>

            {latestBiomarker && (
              <View>
                <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
                  Latest measurements
                </ThemedText>
                <ThemedText type="default">
                  {[
                    latestBiomarker.weightKg != null ? `${latestBiomarker.weightKg}kg` : null,
                    latestBiomarker.bmi != null ? `BMI ${latestBiomarker.bmi.toFixed(1)}` : null,
                    latestBiomarker.bodyFatPct != null ? `${latestBiomarker.bodyFatPct}% body fat` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </ThemedText>
              </View>
            )}

            {workouts && workouts.length > 0 && (
              <View>
                <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
                  Recent workouts
                </ThemedText>
                {workouts.slice(0, 5).map((w) => (
                  <View key={w.id} style={styles.workoutRow}>
                    <ThemedText type="small">
                      {w.workoutType ?? w.description ?? 'Workout'}
                      {w.durationMinutes ? ` · ${w.durationMinutes}min` : ''}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {new Date(w.loggedAt).toLocaleDateString()}
                    </ThemedText>
                  </View>
                ))}
              </View>
            )}

            <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
              Recent meals
            </ThemedText>
          </View>
        }
        ListEmptyComponent={
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
            No meals logged yet.
          </ThemedText>
        }
        renderItem={({ item }) => (
          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.rowBetween}>
              <ThemedText type="smallBold">{item.mealType}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {new Date(item.loggedAt).toLocaleDateString()}
              </ThemedText>
            </View>
            {item.imageUrl && (
              <Pressable onPress={() => setModalPhoto({ url: item.imageUrl!, label: item.mealType })}>
                <Image source={{ uri: item.imageUrl }} style={styles.mealPhoto} contentFit="cover" />
              </Pressable>
            )}
            {item.aiSummary && (
              <ThemedText type="small" themeColor="textSecondary">
                {item.aiSummary}
              </ThemedText>
            )}
            <ThemedText type="small" themeColor="textSecondary">
              {item.totalProteinMin}-{item.totalProteinMax}g protein · {item.totalCaloriesMin}-{item.totalCaloriesMax} kcal
            </ThemedText>
          </ThemedView>
        )}
      />

      <Modal visible={!!modalPhoto} transparent animationType="fade" onRequestClose={() => setModalPhoto(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setModalPhoto(null)}>
          {modalPhoto && <Image source={{ uri: modalPhoto.url }} style={styles.modalImage} contentFit="contain" />}
        </Pressable>
      </Modal>
    </>
  );
}

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
  const theme = useTheme();
  const goodColor = { bg: '#E6F4EA', text: '#256B3A' };
  const supportColor = { bg: '#FBEAEA', text: '#9B4A44' };
  const palette = ok === true ? goodColor : ok === false ? supportColor : null;

  return (
    <View style={[healthCardStyles.card, { backgroundColor: palette?.bg ?? theme.backgroundElement }]}>
      <ThemedText type="default" style={healthCardStyles.icon}>
        {icon}
      </ThemedText>
      <ThemedText type="default" style={[healthCardStyles.value, palette && { color: palette.text }]}>
        {value}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={[healthCardStyles.label, palette && { color: palette.text }]}>
        {label}
      </ThemedText>
      {sub && (
        <ThemedText type="small" themeColor="textSecondary" style={[healthCardStyles.sub, palette && { color: palette.text }]}>
          {sub}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: Spacing.three, paddingBottom: Spacing.four },
  sections: { gap: Spacing.four, marginBottom: Spacing.two },
  name: { fontSize: 24, lineHeight: 30, marginBottom: Spacing.half },
  subtitle: { marginBottom: Spacing.three },
  goalPill: { alignSelf: 'flex-start', borderRadius: Spacing.four, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one, marginTop: Spacing.two },
  goalPillText: { fontWeight: '700' },
  healthRow: { flexDirection: 'row', gap: Spacing.two },
  sectionLabel: { textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700', marginBottom: Spacing.two },
  workoutRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.one },
  card: { borderRadius: Spacing.two, padding: Spacing.three, gap: Spacing.half, marginBottom: Spacing.two },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between' },
  mealPhoto: { width: '100%', height: 160, borderRadius: Spacing.two, marginVertical: Spacing.two },
  empty: { textAlign: 'center', marginTop: Spacing.four },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center' },
  modalImage: { width: '100%', height: '80%' },
});

const healthCardStyles = StyleSheet.create({
  card: { flex: 1, borderRadius: Spacing.two, padding: Spacing.two },
  icon: { fontSize: 18, marginBottom: Spacing.one },
  value: { fontWeight: '700' },
  label: { marginTop: Spacing.half },
  sub: { fontSize: 10, marginTop: Spacing.half },
});
