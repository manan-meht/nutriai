import { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';

import { AccessCodeCard } from './access-code-card';
import { ActivityHeatmap } from './activity-heatmap';
import { DateRangeSelector } from './date-range-selector';
import { FoodBalanceScoreCard } from './food-balance-score-card';
import { FoodPreferencesEditor } from './food-preferences-editor';
import { MacronutrientSummary } from './macronutrient-summary';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { YourWinsSection } from './your-wins-section';
import { MealShareModal } from './meal-share-modal';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useFoodBalanceScore } from '@/hooks/use-food-balance-score';
import { api, type AccessCodeResult, type BiomarkerLog, type FoodBalanceProfileFields, type MealLog, type WorkoutLog } from '@/lib/api';
import { filterByDateRange, getDateRangeDayCount, DEFAULT_DASHBOARD_DATE_RANGE, recommendProteinGrams, type DashboardDateRange } from '@nutriai/dashboard-core';
import { NUTRITION_GOAL_LABELS } from '@/lib/goals';
import { calculateEnergyTargetRange, proteinTargetG, type FoodBalanceUserProfile } from '@nutriai/health-scoring';
import { buildMealShareData } from '@/lib/meal-share/types';

interface PersonLike extends FoodBalanceProfileFields {
  fullName: string;
  age?: number;
  gender?: string;
  weightKg?: number;
  heightCm?: number;
  /** adults-only — used to determine meal-share caption audience (self
   * vs. family), see @/lib/meal-share/overlay-text.ts. */
  relationshipType?: 'self' | 'family_caregiver';
  relationship?: string;
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
  accessCode,
  foodPreferencesContactId,
}: {
  person: PersonLike;
  meals: MealLog[];
  workouts?: WorkoutLog[];
  biomarkers?: BiomarkerLog[];
  foodBalanceQuery: { contactId: string } | { clientId: string };
  /** Temporary Access Code generation — omitted entirely (no card shown)
   * if the caller doesn't pass this, rather than defaulting to a no-op,
   * since every current caller (adults/gym detail screens) does pass it. */
  accessCode?: {
    onGenerate: (ttlHours: 1 | 24) => Promise<AccessCodeResult>;
    onRegenerate: (ttlHours: 1 | 24) => Promise<AccessCodeResult>;
    onRevoke: () => Promise<{ ok: boolean }>;
  };
  /** Adults-only "Food preferences" editor (no gym equivalent on web
   * either) — only the adults detail screen passes this. */
  foodPreferencesContactId?: string;
}) {
  const theme = useTheme();
  const [dateRange, setDateRange] = useState<DashboardDateRange>(DEFAULT_DASHBOARD_DATE_RANGE);
  const [modalPhoto, setModalPhoto] = useState<{ url: string; label: string; meal: MealLog } | null>(null);
  const [sharingMeal, setSharingMeal] = useState<MealLog | null>(null);
  const MEALS_PAGE_SIZE = 10;
  const [visibleMealCount, setVisibleMealCount] = useState(MEALS_PAGE_SIZE);

  const latestBiomarker = biomarkers?.[biomarkers.length - 1];

  // Food Balance Score profile — same computation as the web dashboards, so
  // the displayed protein/calorie targets match exactly regardless of
  // platform.
  const foodBalanceProfile: FoodBalanceUserProfile | undefined = person.nutritionGoals && person.nutritionGoals.length > 0
    ? {
        goals: person.nutritionGoals,
        age: person.age,
        heightCm: person.heightCm,
        currentWeightKg: person.weightKg,
        // No separate "sex for metabolic estimate" field anymore — gender
        // (already collected) is used directly, mirroring the main web
        // app's src/lib/food-balance/adapter.ts#metabolicSexFromGender.
        metabolicEquationSex: person.gender === 'male' || person.gender === 'female' ? person.gender : undefined,
        activityLevel: person.activityLevel,
        resistanceTraining: person.resistanceTrainingStatus,
        targetWeightKg: person.targetWeightKg,
      }
    : undefined;

  // Active macro targets (calories/protein/carbs/fat/fiber) — same
  // /food-balance-score response FoodBalanceScoreCard reads, so this
  // dashboard's targets always match whatever the user has customized
  // (see resolveMacroTargets on the mobile-api side). Falls back to the
  // older protein/calorie-only heuristics while loading.
  const { result: foodBalanceResult } = useFoodBalanceScore(foodBalanceQuery);
  const activeMacroTargets = foodBalanceResult?.activeMacroTargets;

  const recommendedProteinG = recommendProteinGrams({
    weightKg: person.weightKg,
    heightCm: person.heightCm,
    age: person.age,
    gender: person.gender,
  });
  const proteinRange = foodBalanceProfile ? proteinTargetG(foodBalanceProfile) : null;
  const fallbackProteinTarget = proteinRange ? Math.round((proteinRange.lower + proteinRange.upper) / 2) : recommendedProteinG;
  const isRecommendedProtein = !proteinRange && !activeMacroTargets;
  const energyRange = foodBalanceProfile ? calculateEnergyTargetRange(foodBalanceProfile, foodBalanceProfile.goals) : null;
  const fallbackCalTarget = energyRange ? Math.round(energyRange.lowerKcal) : undefined;

  const proteinTarget = activeMacroTargets ? activeMacroTargets.protein.target : fallbackProteinTarget;
  const calTarget = activeMacroTargets ? activeMacroTargets.calories.target : fallbackCalTarget;
  const carbTarget = activeMacroTargets?.carbs.target;
  const fatTarget = activeMacroTargets?.fat.target;
  const fiberTarget = activeMacroTargets?.fiber.target;

  const mealsInRange = filterByDateRange(meals, dateRange);
  const daysLogged = new Set(mealsInRange.map((m) => m.loggedAt.slice(0, 10))).size;
  const earliestMealAt = meals.length ? new Date(Math.min(...meals.map((m) => new Date(m.loggedAt).getTime()))) : undefined;
  const rangeDays = getDateRangeDayCount(dateRange, new Date(), earliestMealAt);
  const avgProtein = Math.round(mealsInRange.reduce((s, m) => s + (m.totalProteinMin + m.totalProteinMax) / 2, 0) / rangeDays);
  const avgCalories = Math.round(mealsInRange.reduce((s, m) => s + (m.totalCaloriesMin + m.totalCaloriesMax) / 2, 0) / rangeDays);

  // Health-markers completeness nudge — see the identical check in the web
  // app's ProfileDashboard.tsx.
  const missingHealthFields = [
    !person.age && 'age',
    !person.gender && 'gender',
    !person.weightKg && 'weight',
    !person.heightCm && 'height',
    (!person.activityLevel || person.activityLevel === 'unknown') && 'activity level',
  ].filter((f): f is string => Boolean(f));
  const editHref = 'clientId' in foodBalanceQuery ? `/gym/edit/${foodBalanceQuery.clientId}` : `/adults/edit/${foodBalanceQuery.contactId}`;

  // Once the user has interacted with (saved) a food preference at least
  // once, the editor moves into the edit-contact screen instead — see the
  // identical dashboard-vs-edit-modal split in the web app's ContactPage/
  // EditContactModal. `null` (not yet loaded) hides the editor, same as
  // this component's other self-fetching cards.
  const [hasInteractedWithFoodPreferences, setHasInteractedWithFoodPreferences] = useState<boolean | null>(null);
  useEffect(() => {
    if (!foodPreferencesContactId) return;
    let cancelled = false;
    api
      .getAdultsFoodPreferences(foodPreferencesContactId)
      .then((profile) => !cancelled && setHasInteractedWithFoodPreferences(profile.last_updated_at != null))
      .catch(() => !cancelled && setHasInteractedWithFoodPreferences(true));
    return () => {
      cancelled = true;
    };
  }, [foodPreferencesContactId]);

  return (
    <>
      <FlatList
        data={meals.slice(0, visibleMealCount)}
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

              {missingHealthFields.length > 0 && (
                <Pressable style={styles.healthNudge} onPress={() => router.push(editHref as any)}>
                  <ThemedText type="small" style={styles.healthNudgeText}>
                    Add {missingHealthFields.join(', ')} so Tistra can give more accurate insights.
                  </ThemedText>
                  <ThemedText type="small" style={styles.healthNudgeLink}>
                    Add details
                  </ThemedText>
                </Pressable>
              )}

              <DateRangeSelector value={dateRange} onChange={setDateRange} />
              <ThemedView type="backgroundSelected" style={styles.goalPill}>
                <ThemedText type="small" style={styles.goalPillText}>
                  🎯 {person.nutritionGoals && person.nutritionGoals.length > 0
                    ? person.nutritionGoals.map((g) => NUTRITION_GOAL_LABELS[g] ?? g).join(', ')
                    : 'No goal set yet'}
                </ThemedText>
              </ThemedView>
            </View>

            <FoodBalanceScoreCard {...foodBalanceQuery} />

            <YourWinsSection {...foodBalanceQuery} />

            <MacronutrientSummary
              meals={mealsInRange}
              days={rangeDays}
              targets={{ calories: calTarget, protein: proteinTarget, carbs: carbTarget, fat: fatTarget, fiber: fiberTarget }}
            />

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
              <ActivityHeatmap meals={meals} />
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
        ListFooterComponent={
          <View style={styles.sections}>
            {visibleMealCount < meals.length && (
              <Pressable
                onPress={() => setVisibleMealCount((c) => c + MEALS_PAGE_SIZE)}
                style={[styles.showMoreButton, { borderColor: theme.backgroundSelected }]}
              >
                <ThemedText type="small" themeColor="textSecondary" style={styles.showMoreButtonText}>
                  Show more
                </ThemedText>
              </Pressable>
            )}

            {accessCode && <AccessCodeCard personName={person.fullName} {...accessCode} />}

            {foodPreferencesContactId && hasInteractedWithFoodPreferences === false && (
              <FoodPreferencesEditor contactId={foodPreferencesContactId} />
            )}
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
              <Pressable onPress={() => setModalPhoto({ url: item.imageUrl!, label: item.mealType, meal: item })}>
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
          {modalPhoto && (
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                setSharingMeal(modalPhoto.meal);
              }}
              style={[styles.shareMealButton, { backgroundColor: theme.primary }]}
            >
              <ThemedText type="small" style={styles.shareMealButtonText}>
                Share this meal
              </ThemedText>
            </Pressable>
          )}
        </Pressable>
      </Modal>

      <MealShareModal
        meal={sharingMeal ? buildMealShareData(sharingMeal) : null}
        visible={!!sharingMeal}
        onClose={() => setSharingMeal(null)}
        audience={'clientId' in foodBalanceQuery ? 'coach' : person.relationshipType === 'self' ? 'self' : 'family'}
        relationship={person.relationship}
      />
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
  healthNudge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, backgroundColor: '#FEF3C7', borderRadius: Spacing.two, padding: Spacing.two, marginTop: Spacing.two },
  healthNudgeText: { flex: 1, color: '#92400E' },
  healthNudgeLink: { color: '#92400E', fontWeight: '700' },
  goalPillText: { fontWeight: '700' },
  showMoreButton: { width: '100%', paddingVertical: Spacing.two, borderRadius: Spacing.two, borderWidth: 1, alignItems: 'center' },
  showMoreButtonText: { fontWeight: '600' },
  healthRow: { flexDirection: 'row', gap: Spacing.two },
  sectionLabel: { textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700', marginBottom: Spacing.two },
  workoutRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.one },
  card: { borderRadius: Spacing.two, padding: Spacing.three, gap: Spacing.half, marginBottom: Spacing.two },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between' },
  mealPhoto: { width: '100%', height: 160, borderRadius: Spacing.two, marginVertical: Spacing.two },
  empty: { textAlign: 'center', marginTop: Spacing.four },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center' },
  modalImage: { width: '100%', height: '80%' },
  shareMealButton: { marginTop: Spacing.three, borderRadius: Spacing.two, paddingVertical: Spacing.two, paddingHorizontal: Spacing.four },
  shareMealButtonText: { color: '#ffffff', fontWeight: '700' },
});

const healthCardStyles = StyleSheet.create({
  card: { flex: 1, borderRadius: Spacing.two, padding: Spacing.two },
  icon: { fontSize: 18, marginBottom: Spacing.one },
  value: { fontWeight: '700' },
  label: { marginTop: Spacing.half },
  sub: { fontSize: 10, marginTop: Spacing.half },
});
