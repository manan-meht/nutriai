import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ActivityHeatmap } from '@/components/activity-heatmap';
import { MacronutrientSummary } from '@/components/macronutrient-summary';
import { DateRangeSelector } from '@/components/date-range-selector';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { endUserApi, EndUserApiError } from '@/lib/end-user-api';
import { clearEndUserSession, getStoredEndUserContact } from '@/lib/end-user-session';
import {
  DEFAULT_DASHBOARD_DATE_RANGE,
  filterByDateRange,
  getDateRangeDayCount,
  recommendProteinGrams,
  type DashboardDateRange,
} from '@nutriai/dashboard-core';

interface DashboardMeal {
  id: string;
  mealType: string;
  loggedAt: string;
  foods: any[];
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

interface DashboardData {
  profile: {
    fullName: string;
    age?: number;
    gender?: 'male' | 'female' | 'other';
    weightKg?: number;
    heightCm?: number;
  };
  meals: DashboardMeal[];
  accessList: { role: 'caregiver' | 'coach'; label: string }[];
  isPaused: boolean;
}

// Participant's own dashboard — the mobile counterpart to the web app's
// /my-progress/dashboard. Note this deliberately does NOT reuse
// components/person-detail.tsx (the shared contact/client detail screen):
// that component's Food Balance Score section calls the mobile-api's
// /food-balance-score route, which is authenticated by a Supabase JWT (see
// lib/api.ts) — this screen's session is a completely different OTP-based
// token (see lib/end-user-api.ts), so that one section is intentionally
// left out here rather than wired to the wrong auth. Everything else
// (macro summary, activity heatmap, recent meals) works the same way
// regardless of auth mechanism.
export default function EndUserDashboardScreen() {
  const theme = useTheme();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DashboardDateRange>(DEFAULT_DASHBOARD_DATE_RANGE);
  const [pausing, setPausing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const contact = await getStoredEndUserContact();
      if (!contact) {
        router.replace('/end-user/login');
        return;
      }
      const result = await endUserApi.getDashboard();
      setData(result as unknown as DashboardData);
    } catch (err) {
      if (err instanceof EndUserApiError && err.status === 401) {
        await clearEndUserSession();
        router.replace('/end-user/login');
        return;
      }
      setError('Could not load your dashboard. Pull down to try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  // useFocusEffect (below) covers both the initial mount and every
  // subsequent focus — e.g. returning here after signing out and back in
  // — so a separate mount-only useEffect would just be a redundant first
  // call.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleSignOut() {
    await clearEndUserSession();
    router.replace('/end-user/login');
  }

  async function handleTogglePause() {
    if (!data) return;
    setPausing(true);
    try {
      await endUserApi.setSharingPaused(!data.isPaused);
      setData({ ...data, isPaused: !data.isPaused });
    } catch {
      // Best-effort — a failed toggle just leaves the switch as it was;
      // the user can retry.
    } finally {
      setPausing(false);
    }
  }

  if (loading) {
    return (
      <ThemedView style={styles.centerContainer}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  if (error || !data) {
    return (
      <ThemedView style={styles.centerContainer}>
        <ThemedText type="default" style={styles.errorText}>
          {error ?? 'Something went wrong.'}
        </ThemedText>
        <Pressable style={[styles.retryButton, { backgroundColor: '#5715CE' }]} onPress={load}>
          <ThemedText style={styles.retryButtonText}>Try again</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  const { profile, meals, accessList, isPaused } = data;
  const firstName = profile.fullName.split(' ')[0];
  const mealsInRange = filterByDateRange(meals, dateRange);
  const earliestMealAt = meals.length ? new Date(meals[meals.length - 1].loggedAt) : undefined;
  const rangeDays = getDateRangeDayCount(dateRange, new Date(), earliestMealAt);
  const recommendedProteinG = recommendProteinGrams({
    weightKg: profile.weightKg,
    heightCm: profile.heightCm,
    age: profile.age,
    gender: profile.gender,
  });

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <ThemedText type="title" style={styles.headerTitle}>
              Hi, {firstName} 👋
            </ThemedText>
            <Pressable onPress={handleSignOut}>
              <ThemedText type="small" themeColor="textSecondary">
                Sign out
              </ThemedText>
            </Pressable>
          </View>

          <DateRangeSelector value={dateRange} onChange={setDateRange} />

          <View style={styles.section}>
            <MacronutrientSummary meals={mealsInRange} days={rangeDays} targets={{ protein: recommendedProteinG }} />
          </View>

          <View style={[styles.section, styles.card, { borderColor: theme.backgroundSelected }]}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
              MEAL ACTIVITY – LAST 30 DAYS
            </ThemedText>
            <ActivityHeatmap meals={meals} days={30} />
          </View>

          <View style={styles.section}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
              RECENT MEALS
            </ThemedText>
            {meals.length === 0 ? (
              <ThemedText type="default" themeColor="textSecondary" style={styles.emptyState}>
                No meals logged yet — send a photo on WhatsApp to get started!
              </ThemedText>
            ) : (
              meals.slice(0, 10).map((meal) => {
                const avgProt = Math.round((meal.totalProteinMin + meal.totalProteinMax) / 2);
                const avgCal = Math.round((meal.totalCaloriesMin + meal.totalCaloriesMax) / 2);
                return (
                  <View key={meal.id} style={[styles.mealRow, { borderColor: theme.backgroundSelected }]}>
                    {meal.imageUrl ? (
                      <Image source={{ uri: meal.imageUrl }} style={styles.mealImage} contentFit="cover" />
                    ) : (
                      <ThemedText style={styles.mealEmoji}>🍽️</ThemedText>
                    )}
                    <View style={styles.mealInfo}>
                      <ThemedText type="default" style={styles.mealType}>
                        {meal.mealType}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                        {meal.aiSummary ?? meal.foods.map((f: any) => f.name).join(', ')}
                      </ThemedText>
                      <ThemedText type="small" style={styles.mealMacros}>
                        {avgProt}g protein · {avgCal} kcal
                      </ThemedText>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          <View style={[styles.section, styles.card, { borderColor: theme.backgroundSelected }]}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
              WHO HAS ACCESS
            </ThemedText>
            {accessList.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                No one else currently has access.
              </ThemedText>
            ) : (
              accessList.map((entry, i) => (
                <ThemedText key={i} type="small" themeColor="textSecondary">
                  {entry.label}
                </ThemedText>
              ))
            )}
          </View>

          <View style={[styles.section, styles.card, { borderColor: theme.backgroundSelected }]}>
            <Pressable
              style={[styles.pauseButton, { borderColor: theme.backgroundSelected, opacity: pausing ? 0.5 : 1 }]}
              disabled={pausing}
              onPress={handleTogglePause}
            >
              <ThemedText type="default">{isPaused ? 'Resume sharing' : 'Pause sharing'}</ThemedText>
            </Pressable>
            <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
              {isPaused
                ? "New meals you log won't be shared until you resume."
                : 'Pausing keeps your WhatsApp logging working — it just stops sharing new meals.'}
            </ThemedText>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.four },
  errorText: { textAlign: 'center', marginBottom: Spacing.three },
  retryButton: { borderRadius: 999, paddingVertical: Spacing.two, paddingHorizontal: Spacing.four },
  retryButtonText: { color: '#fff', fontWeight: '600' },
  scroll: { padding: Spacing.four, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center', gap: Spacing.four },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 20 },
  section: { gap: Spacing.two },
  sectionLabel: { textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { borderWidth: 1, borderRadius: 16, padding: Spacing.three },
  emptyState: { textAlign: 'center', paddingVertical: Spacing.four },
  mealRow: { flexDirection: 'row', gap: Spacing.three, borderWidth: 1, borderRadius: 12, padding: Spacing.three, alignItems: 'center' },
  mealImage: { width: 48, height: 48, borderRadius: 8 },
  mealEmoji: { fontSize: 24 },
  mealInfo: { flex: 1, gap: 2 },
  mealType: { textTransform: 'capitalize' },
  mealMacros: { color: '#5715CE', fontWeight: '600' },
  pauseButton: { borderWidth: 1, borderRadius: 12, paddingVertical: Spacing.three, alignItems: 'center' },
  footnote: { marginTop: Spacing.two },
});
