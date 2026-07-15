import { Pressable, StyleSheet, View } from 'react-native';

import { bandLabelFor } from './food-balance-score-card';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { Spacing } from '@/constants/theme';
import { useFoodBalanceScore } from '@/hooks/use-food-balance-score';
import { useTheme } from '@/hooks/use-theme';

function formatLastMeal(lastMealAt?: string): string {
  if (!lastMealAt) return 'No meals logged yet';
  const days = Math.floor((Date.now() - new Date(lastMealAt).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Last meal today';
  if (days === 1) return 'Last meal yesterday';
  return `Last meal ${days} days ago`;
}

function initialsFor(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** A person's row on the family/client selection screens — shared by
 * (app)/adults/index.tsx and (app)/gym/index.tsx so both keep the same
 * card design. Pulls in that person's own Food Balance Score (same
 * feature-flagged endpoint as the detail page's FoodBalanceScoreCard, via
 * the same hook) to show a compact score or "still learning" state inline,
 * mirroring the richer selection screen design without inventing any data
 * the API doesn't actually provide (no compliance %, alerts, etc.). */
export function PersonCard({
  fullName,
  subtitle,
  mealCount,
  lastMealAt,
  scoreQuery,
  onPress,
}: {
  fullName: string;
  subtitle?: string;
  mealCount: number;
  lastMealAt?: string;
  scoreQuery: { contactId: string } | { clientId: string };
  onPress: () => void;
}) {
  const theme = useTheme();
  const { result } = useFoodBalanceScore(scoreQuery);

  const isLearning = result && (result.status === 'collecting_data' || result.status === 'refreshing_data');
  const isScored = result && !isLearning;
  const topRecommendation = isScored ? result.recommendations[0]?.title : undefined;

  return (
    <Pressable onPress={onPress}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.header}>
          <View style={[styles.avatar, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText type="default" style={styles.avatarText}>
              {initialsFor(fullName)}
            </ThemedText>
          </View>
          <View style={styles.headerText}>
            <ThemedText type="default" style={styles.name}>
              {fullName}
            </ThemedText>
            {subtitle && (
              <ThemedText type="small" themeColor="textSecondary">
                {subtitle}
              </ThemedText>
            )}
          </View>
          <ThemedText type="default" themeColor="textSecondary">
            ›
          </ThemedText>
        </View>

        {isLearning && (
          <View style={styles.learning}>
            <View style={styles.learningHeader}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
                Learning state
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {result.dataCoverage.eligibleMealCount} of {result.dataCoverage.requiredMealCount} meals
              </ThemedText>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: theme.backgroundSelected }]}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.min(100, Math.round((result.dataCoverage.eligibleMealCount / result.dataCoverage.requiredMealCount) * 100))}%` },
                ]}
              />
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.learningCaption}>
              {result.status === 'refreshing_data' ? 'Refreshing eating pattern' : 'Learning eating pattern'}
            </ThemedText>
          </View>
        )}

        {isScored && (
          <View style={styles.scoreRow}>
            <ThemedText type="title" style={styles.scoreNumber}>
              {result.score ?? '—'}
            </ThemedText>
            <View style={styles.scoreTextBlock}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
                Food Balance Score
              </ThemedText>
              <ThemedText type="small">{bandLabelFor(result.score ?? 0)}</ThemedText>
            </View>
          </View>
        )}

        <ThemedText type="small" themeColor="textSecondary" style={styles.meta}>
          🍽️ {formatLastMeal(lastMealAt)} · {mealCount} meal{mealCount === 1 ? '' : 's'} logged
        </ThemedText>

        {topRecommendation && (
          <View style={[styles.tip, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText type="small">
              <ThemedText type="smallBold">Focus: </ThemedText>
              {topRecommendation}
            </ThemedText>
          </View>
        )}
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two,
    gap: Spacing.two,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '700' },
  headerText: { flex: 1 },
  name: { fontWeight: '700', fontSize: 18, lineHeight: 22 },
  label: { textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700', fontSize: 11 },
  learning: {},
  learningHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.one },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: '#5715CE' },
  learningCaption: { marginTop: Spacing.one, fontStyle: 'italic' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  scoreNumber: { fontSize: 32, lineHeight: 36, color: '#5715CE' },
  scoreTextBlock: { gap: Spacing.half },
  meta: {},
  tip: { borderRadius: Spacing.two, padding: Spacing.two },
});
