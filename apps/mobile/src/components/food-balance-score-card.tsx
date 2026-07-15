import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { Spacing } from '@/constants/theme';
import { useFoodBalanceScore } from '@/hooks/use-food-balance-score';
import { useTheme } from '@/hooks/use-theme';

const SCORE_BAND_LABEL = [
  { max: 39, label: 'Learning and building' },
  { max: 59, label: 'Building balance' },
  { max: 79, label: 'Supporting your goal' },
  { max: 100, label: 'Strong foundation' },
];

export function bandLabelFor(score: number): string {
  return SCORE_BAND_LABEL.find((b) => score <= b.max)?.label ?? 'Supporting your goal';
}

// Ported from nutriai-fresh's
// apps/mobile/src/components/FoodBalanceScoreCard.tsx — same ring meter
// (purple-only, never a red/green diagnostic gauge) via react-native-svg,
// calling mobile-api's own /food-balance-score endpoint (feature-flagged
// server-side; a failure or 404 here just means "don't show the card", not
// a hard error).
export function FoodBalanceScoreCard(params: { contactId: string } | { clientId: string }) {
  const theme = useTheme();
  const { result, loading } = useFoodBalanceScore(params);

  if (loading || !result) return null;

  if (result.status === 'collecting_data' || result.status === 'refreshing_data') {
    const { eligibleMealCount, requiredMealCount, distinctLoggingDays, requiredLoggingDays } = result.dataCoverage;
    const progressPct = Math.min(100, Math.round((eligibleMealCount / requiredMealCount) * 100));
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">Food Balance Score</ThemedText>
        <ThemedText type="small" style={styles.stateLabel}>
          {result.status === 'refreshing_data' ? 'Refreshing your Food Balance Score' : 'Learning your eating pattern'}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.stateBody}>
          {result.status === 'refreshing_data'
            ? 'Log a few more recent meals so the score reflects your current eating pattern.'
            : 'Log a few more meals so Tistra can understand your nutrition and give you useful guidance.'}
        </ThemedText>
        <View style={[styles.progressTrack, { backgroundColor: theme.backgroundSelected }]}>
          <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.stateMeta}>
          {eligibleMealCount} of {requiredMealCount} meals logged · Logged across {distinctLoggingDays} of {requiredLoggingDays} days
        </ThemedText>
      </ThemedView>
    );
  }

  const score = result.score ?? 0;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">Food Balance Score</ThemedText>
      <View style={styles.scoreRow}>
        <View style={styles.ringWrap}>
          <Svg width={100} height={100} viewBox="0 0 100 100">
            <Circle cx={50} cy={50} r={radius} stroke="#E7DBFA" strokeWidth={10} fill="none" />
            <Circle
              cx={50}
              cy={50}
              r={radius}
              stroke="#5715CE"
              strokeWidth={10}
              fill="none"
              strokeDasharray={`${progress} ${circumference}`}
              strokeLinecap="round"
              rotation={-90}
              origin="50, 50"
            />
          </Svg>
          <ThemedText type="subtitle" style={styles.scoreNumber}>
            {score}
          </ThemedText>
        </View>
        <View style={styles.scoreTextBlock}>
          <ThemedText type="default" style={styles.bandLabel}>
            {bandLabelFor(score)}
          </ThemedText>
          {result.status === 'partially_personalized' && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.stateMeta}>
              Add your height, weight, and activity level to personalize this score.
            </ThemedText>
          )}
          <ThemedText type="small" themeColor="textSecondary" style={styles.stateMeta}>
            Based on your meals from the last 14 days
          </ThemedText>
        </View>
      </View>

      {result.recommendations.length > 0 && (
        <View style={[styles.recommendations, { borderTopColor: theme.backgroundSelected }]}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.recTitle}>
            Top ways to improve
          </ThemedText>
          {result.recommendations.map((rec, i) => (
            <ThemedText key={rec.id} type="small" themeColor="textSecondary" style={styles.recItem}>
              {i + 1}. {rec.title}
            </ThemedText>
          ))}
        </View>
      )}

      <ThemedText type="small" themeColor="textSecondary" style={styles.disclaimer}>
        This is not a medical assessment and may not capture everything you eat.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.three, padding: Spacing.three },
  stateLabel: { color: '#5715CE', fontWeight: '600', marginTop: Spacing.one },
  stateBody: { marginTop: Spacing.one, lineHeight: 18 },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: Spacing.two },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: '#5715CE' },
  stateMeta: { marginTop: Spacing.one, fontSize: 11 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginTop: Spacing.two },
  ringWrap: { width: 100, height: 100, alignItems: 'center', justifyContent: 'center' },
  scoreNumber: { position: 'absolute', fontSize: 24, lineHeight: 28 },
  scoreTextBlock: { flex: 1 },
  bandLabel: { fontWeight: '600' },
  recommendations: { marginTop: Spacing.three, paddingTop: Spacing.three, borderTopWidth: 1 },
  recTitle: { textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700', fontSize: 11, marginBottom: Spacing.one },
  recItem: { marginBottom: Spacing.one },
  disclaimer: { fontSize: 10, marginTop: Spacing.two },
});
