import { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { apiGet } from "../lib/api";
import { colors, radii } from "../lib/theme";

interface FoodBalanceScoreResult {
  score: number | null;
  status: "collecting_data" | "refreshing_data" | "foundation_only" | "partially_personalized" | "fully_personalized";
  confidence: number;
  dataCoverage: {
    eligibleMealCount: number;
    requiredMealCount: number;
    distinctLoggingDays: number;
    requiredLoggingDays: number;
  };
  recommendations: Array<{ id: string; title: string }>;
}

interface FoodBalanceScoreCardProps {
  contactId?: string;
  clientId?: string;
}

const SCORE_BAND_LABEL = [
  { max: 39, label: "Learning and building" },
  { max: 59, label: "Building balance" },
  { max: 79, label: "Supporting your goal" },
  { max: 100, label: "Strong foundation" },
];

function bandLabelFor(score: number): string {
  return SCORE_BAND_LABEL.find((b) => score <= b.max)?.label ?? "Supporting your goal";
}

/** RN port of src/components/shared/dashboard/FoodBalanceScoreCard.tsx —
 * same ring meter (purple-only, never a red/green diagnostic gauge) via
 * react-native-svg (already a dependency, see BrandIcons.tsx), calling the
 * mobile-api's own /food-balance-score endpoint instead of the main web
 * app's /api/v1 route (different deployments — mobile only ever talks to
 * mobile-api, see src/lib/api.ts). */
export function FoodBalanceScoreCard({ contactId, clientId }: FoodBalanceScoreCardProps) {
  const [result, setResult] = useState<FoodBalanceScoreResult | null>(null);
  const [loading, setLoading] = useState(true);
  const queryParam = contactId ? `contactId=${contactId}` : `clientId=${clientId}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiGet<FoodBalanceScoreResult>(`/food-balance-score?${queryParam}`)
      .then((data) => !cancelled && setResult(data))
      .catch(() => !cancelled && setResult(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [queryParam]);

  if (loading || !result) return null;

  if (result.status === "collecting_data" || result.status === "refreshing_data") {
    const { eligibleMealCount, requiredMealCount, distinctLoggingDays, requiredLoggingDays } = result.dataCoverage;
    const progressPct = Math.min(100, Math.round((eligibleMealCount / requiredMealCount) * 100));
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Food Balance Score</Text>
        <Text style={styles.stateLabel}>
          {result.status === "refreshing_data" ? "Refreshing your Food Balance Score" : "Learning your eating pattern"}
        </Text>
        <Text style={styles.stateBody}>
          {result.status === "refreshing_data"
            ? "Log a few more recent meals so the score reflects your current eating pattern."
            : "Log a few more meals so Tistra can understand your nutrition and give you useful guidance."}
        </Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
        </View>
        <Text style={styles.stateMeta}>
          {eligibleMealCount} of {requiredMealCount} meals logged · Logged across {distinctLoggingDays} of {requiredLoggingDays} days
        </Text>
      </View>
    );
  }

  const score = result.score ?? 0;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Food Balance Score</Text>
      <View style={styles.scoreRow}>
        <View style={styles.ringWrap}>
          <Svg width={100} height={100} viewBox="0 0 100 100">
            <Circle cx={50} cy={50} r={radius} stroke={colors.primaryLight} strokeWidth={10} fill="none" />
            <Circle
              cx={50}
              cy={50}
              r={radius}
              stroke={colors.primary}
              strokeWidth={10}
              fill="none"
              strokeDasharray={`${progress} ${circumference}`}
              strokeLinecap="round"
              rotation={-90}
              origin="50, 50"
            />
          </Svg>
          <Text style={styles.scoreNumber}>{score}</Text>
        </View>
        <View style={styles.scoreTextBlock}>
          <Text style={styles.bandLabel}>{bandLabelFor(score)}</Text>
          {result.status === "partially_personalized" && (
            <Text style={styles.stateMeta}>Add your height, weight, and activity level to personalize this score.</Text>
          )}
          <Text style={styles.stateMeta}>Based on your meals from the last 14 days</Text>
        </View>
      </View>

      {result.recommendations.length > 0 && (
        <View style={styles.recommendations}>
          <Text style={styles.recTitle}>Top ways to improve</Text>
          {result.recommendations.map((rec, i) => (
            <Text key={rec.id} style={styles.recItem}>
              {i + 1}. {rec.title}
            </Text>
          ))}
        </View>
      )}

      <Text style={styles.disclaimer}>This is not a medical assessment and may not capture everything you eat.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radii.card, padding: 16 },
  title: { fontSize: 15, fontWeight: "700", color: colors.textPrimary, marginBottom: 4 },
  stateLabel: { fontSize: 13, fontWeight: "600", color: colors.primary, marginTop: 4 },
  stateBody: { fontSize: 13, color: colors.textSecondary, marginTop: 4, lineHeight: 18 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surface, overflow: "hidden", marginTop: 10 },
  progressFill: { height: "100%", borderRadius: 4, backgroundColor: colors.primary },
  stateMeta: { fontSize: 11, color: colors.textMeta, marginTop: 6 },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 8 },
  ringWrap: { width: 100, height: 100, alignItems: "center", justifyContent: "center" },
  scoreNumber: { position: "absolute", fontSize: 24, fontWeight: "700", color: colors.textPrimary },
  scoreTextBlock: { flex: 1 },
  bandLabel: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  recommendations: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border },
  recTitle: { fontSize: 11, fontWeight: "700", color: colors.textMeta, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  recItem: { fontSize: 13, color: colors.textSecondary, marginBottom: 4 },
  disclaimer: { fontSize: 10, color: colors.textMeta, marginTop: 10 },
});
