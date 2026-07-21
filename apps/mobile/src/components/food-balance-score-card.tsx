import { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { Spacing } from '@/constants/theme';
import { useFoodBalanceScore } from '@/hooks/use-food-balance-score';
import { useTheme } from '@/hooks/use-theme';
import { api, type FoodBalanceScoreResult, type RecommendationFeedback } from '@/lib/api';

const FEEDBACK_OPTIONS: Array<{ value: RecommendationFeedback; label: string }> = [
  { value: 'helpful', label: 'Helpful' },
  { value: 'not_useful', label: 'Not useful' },
  { value: 'already_eat', label: 'I already eat this' },
  { value: 'dont_like', label: "I don't like this food" },
  { value: 'not_available', label: 'Not available where I live' },
  { value: 'too_hard', label: 'Too hard' },
];

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
        <ThemedText type="small" style={[styles.stateLabel, { color: theme.primary }]}>
          {result.status === 'refreshing_data' ? 'Refreshing your Food Balance Score' : 'Learning your eating pattern'}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.stateBody}>
          {result.status === 'refreshing_data'
            ? 'Log a few more recent meals so the score reflects your current eating pattern.'
            : 'Log a few more meals so Tistra can understand your nutrition and give you useful guidance.'}
        </ThemedText>
        <View style={[styles.progressTrack, { backgroundColor: theme.backgroundSelected }]}>
          <View style={[styles.progressFill, { width: `${progressPct}%`, backgroundColor: theme.primary }]} />
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
              stroke={theme.primary}
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
            <View
              key={rec.id}
              style={[
                styles.recItem,
                { backgroundColor: i % 2 === 0 ? theme.background : theme.backgroundSelected },
              ]}
            >
              <ThemedText type="small" style={styles.recItemTitle}>
                {i + 1}. {rec.title}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.recItemDescription}>
                {rec.description}
              </ThemedText>
              {rec.whyThisHelps && (
                <ThemedText type="small" themeColor="textSecondary" style={styles.recItemWhy}>
                  {rec.whyThisHelps}
                </ThemedText>
              )}
              <RecommendationFeedbackButtons rec={rec} params={params} />
            </View>
          ))}
        </View>
      )}

      <View style={[styles.disclaimerBand, { backgroundColor: theme.backgroundSelected }]}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.disclaimer}>
          This is not a medical assessment and may not capture everything you eat.
        </ThemedText>
      </View>
    </ThemedView>
  );
}

/** Feedback buttons for one recommendation's shown foods
 * (rec.exampleFoodIds) — mirrors the web app's RecommendationFeedbackButtons
 * (see src/lib/food-balance/feedback.ts for how each choice affects future
 * recommendations). Hidden once submitted (shows a brief confirmation
 * instead) rather than allowing repeated conflicting feedback. */
function RecommendationFeedbackButtons({
  rec,
  params,
}: {
  rec: FoodBalanceScoreResult['recommendations'][number];
  params: { contactId: string } | { clientId: string };
}) {
  const theme = useTheme();
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!rec.exampleFoodIds || rec.exampleFoodIds.length === 0) return null;

  async function handleFeedback(value: RecommendationFeedback, label: string) {
    setSubmitting(true);
    try {
      await api.recordFoodBalanceFeedback(params, value, rec.exampleFoodIds!);
      setSubmitted(label);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <ThemedText type="small" themeColor="textSecondary" style={styles.feedbackConfirmation}>
        Thanks — noted &ldquo;{submitted}.&rdquo;
      </ThemedText>
    );
  }

  return (
    <View style={styles.feedbackRow}>
      {FEEDBACK_OPTIONS.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          disabled={submitting}
          onPress={() => handleFeedback(opt.value, opt.label)}
          style={[styles.feedbackPill, { borderColor: theme.backgroundSelected, opacity: submitting ? 0.5 : 1 }]}
        >
          <ThemedText type="small" themeColor="textSecondary" style={styles.feedbackPillLabel}>
            {opt.label}
          </ThemedText>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.three, padding: Spacing.three },
  stateLabel: { fontWeight: '600', marginTop: Spacing.one },
  stateBody: { marginTop: Spacing.one, lineHeight: 18 },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: Spacing.two },
  progressFill: { height: '100%', borderRadius: 4 },
  stateMeta: { marginTop: Spacing.one, fontSize: 11 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginTop: Spacing.two },
  ringWrap: { width: 100, height: 100, alignItems: 'center', justifyContent: 'center' },
  scoreNumber: { position: 'absolute', fontSize: 24, lineHeight: 28 },
  scoreTextBlock: { flex: 1 },
  bandLabel: { fontWeight: '600' },
  recommendations: { marginTop: Spacing.three, paddingTop: Spacing.three, borderTopWidth: 1 },
  recTitle: { textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700', fontSize: 11, marginBottom: Spacing.one },
  recItem: { marginBottom: Spacing.two, padding: Spacing.two, borderRadius: Spacing.two },
  recItemTitle: { fontWeight: '600' },
  recItemDescription: { marginTop: 2 },
  recItemWhy: { fontSize: 11, marginTop: Spacing.one },
  disclaimerBand: {
    marginTop: Spacing.three,
    marginHorizontal: -Spacing.three,
    marginBottom: -Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomLeftRadius: Spacing.three,
    borderBottomRightRadius: Spacing.three,
  },
  disclaimer: { fontSize: 10 },
  feedbackRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, marginTop: Spacing.one },
  feedbackPill: { paddingHorizontal: Spacing.two, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  feedbackPillLabel: { fontSize: 11 },
  feedbackConfirmation: { fontSize: 11, marginTop: Spacing.one },
});
