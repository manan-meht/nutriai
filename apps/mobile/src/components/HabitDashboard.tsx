import { View, Text, StyleSheet } from "react-native";
import type {
  TrendCard,
  WeeklyFocusHabit,
  HabitMomentum,
  PatternSpectrum,
  WeeklyProgressMetric,
  TrendMood,
} from "../lib/nutrition/habit-insights";
import { colors, radii } from "../lib/theme";

// RN port of src/components/shared/dashboard/HabitDashboardSections.tsx —
// same data (from src/lib/nutrition/habit-insights.ts, ported verbatim
// into src/lib/nutrition/), reimplemented with View/Text since the web
// version is plain divs with Tailwind, not anything RN can reuse directly.

function moodPalette(mood: TrendMood) {
  if (mood === "positive") return colors.good;
  if (mood === "attention") return colors.support;
  return colors.steady;
}

const TREND_CARD_ICON: Record<string, string> = { protein: "🥩", balance: "🍽️", direction: "🧭" };

export function TrendCardGrid({ cards }: { cards: TrendCard[] }) {
  return (
    <View style={styles.trendGrid}>
      {cards.map((card) => {
        const palette = moodPalette(card.mood);
        return (
          <View key={card.key} style={[styles.trendCard, { backgroundColor: palette.bg }]}>
            <Text style={styles.trendIcon}>{TREND_CARD_ICON[card.key] ?? "•"}</Text>
            <Text style={[styles.trendTitle, { color: palette.text }]}>{card.title}</Text>
            <Text style={[styles.trendBody, { color: palette.text }]}>{card.body}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function HealthCard({
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
    <View style={[styles.healthCard, palette && { backgroundColor: palette.bg }]}>
      <Text style={styles.healthIcon}>{icon}</Text>
      <Text style={[styles.healthValue, palette && { color: palette.text }]}>{value}</Text>
      <Text style={[styles.healthLabel, palette && { color: palette.text }]}>{label}</Text>
      {sub && <Text style={[styles.healthSub, palette && { color: palette.text }]}>{sub}</Text>}
    </View>
  );
}

export function WeeklyFocusCard({ focus }: { focus: WeeklyFocusHabit | null }) {
  if (!focus) {
    return (
      <View style={styles.focusCard}>
        <Text style={styles.focusTitle}>This week's focus</Text>
        <Text style={styles.focusBody}>Keep sharing meals — Tistra will suggest a focus area once there's enough data.</Text>
      </View>
    );
  }
  const pct = Math.min(100, Math.round((focus.currentCount / focus.targetCount) * 100));
  return (
    <View style={styles.focusCard}>
      <Text style={styles.focusTitle}>This week's focus</Text>
      <Text style={styles.focusGoal}>{focus.title}</Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.focusCount}>{focus.currentCount} of {focus.targetCount} done</Text>
    </View>
  );
}

export function HabitMomentumCard({ momentum }: { momentum: HabitMomentum }) {
  return (
    <View style={styles.momentumCard}>
      <View style={styles.momentumHeader}>
        <Text style={styles.momentumHeadline}>{momentum.headline}</Text>
        <Text style={styles.momentumScore}>{momentum.score}%</Text>
      </View>
      <Text style={styles.momentumFocus}>{momentum.focus}</Text>
    </View>
  );
}

const SPECTRUM_STEPS: Array<{ key: PatternSpectrum["position"]; label: string }> = [
  { key: "needs_support", label: "Needs support" },
  { key: "getting_stronger", label: "Getting stronger" },
  { key: "healthier_pattern", label: "Healthier pattern" },
];

export function FoodPatternSpectrumCard({ spectrum }: { spectrum: PatternSpectrum }) {
  const activeIndex = SPECTRUM_STEPS.findIndex((s) => s.key === spectrum.position);
  return (
    <View style={styles.spectrumCard}>
      <Text style={styles.spectrumTitle}>Your food pattern</Text>
      <View style={styles.spectrumBar}>
        {SPECTRUM_STEPS.map((step, i) => (
          <View key={step.key} style={[styles.spectrumSegment, i <= activeIndex && styles.spectrumSegmentActive]} />
        ))}
      </View>
      <View style={styles.spectrumLabels}>
        {SPECTRUM_STEPS.map((step, i) => (
          <Text key={step.key} style={[styles.spectrumLabel, i === activeIndex && styles.spectrumLabelActive]}>
            {step.label}
          </Text>
        ))}
      </View>
      <Text style={styles.spectrumNote}>{spectrum.note}</Text>
    </View>
  );
}

export function WeeklyProgressBoard({ metrics }: { metrics: WeeklyProgressMetric[] }) {
  if (metrics.length === 0) {
    return (
      <View style={styles.progressBoardEmpty}>
        <Text style={styles.empty}>Keep sharing meals to see weekly progress.</Text>
      </View>
    );
  }
  return (
    <View style={styles.progressBoard}>
      {metrics.map((metric) => {
        const palette = moodPalette(metric.mood);
        return (
          <View key={metric.label} style={styles.progressMetric}>
            <Text style={styles.progressLabel}>{metric.label}</Text>
            <View style={[styles.progressPill, { backgroundColor: palette.bg }]}>
              <Text style={[styles.progressPillText, { color: palette.text }]}>{metric.changeLabel}</Text>
            </View>
            <Text style={styles.progressCount}>{metric.thisWeekLabel}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  trendGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 8 },
  trendCard: { flexBasis: "31%", flexGrow: 1, borderRadius: radii.pill, padding: 12 },
  trendIcon: { fontSize: 20, marginBottom: 6 },
  trendTitle: { fontSize: 13, fontWeight: "700", marginBottom: 4 },
  trendBody: { fontSize: 12, lineHeight: 16 },

  healthCard: {
    flexBasis: "31%",
    flexGrow: 1,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    padding: 12,
    alignItems: "flex-start",
  },
  healthIcon: { fontSize: 18, marginBottom: 4 },
  healthValue: { fontSize: 20, fontWeight: "700", color: colors.textPrimary },
  healthLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  healthSub: { fontSize: 10, color: colors.textMeta, marginTop: 2 },

  focusCard: { backgroundColor: colors.primaryLight, borderRadius: radii.pill, padding: 16 },
  focusTitle: { fontSize: 12, fontWeight: "700", color: colors.primary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  focusGoal: { fontSize: 15, fontWeight: "600", color: colors.textPrimary, marginBottom: 10 },
  focusBody: { fontSize: 13, color: colors.textSecondary },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: "rgba(103,80,164,0.15)", overflow: "hidden", marginBottom: 6 },
  progressFill: { height: "100%", borderRadius: 4, backgroundColor: colors.primary },
  focusCount: { fontSize: 12, color: colors.textSecondary },

  momentumCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radii.card, padding: 16 },
  momentumHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  momentumHeadline: { fontSize: 14, fontWeight: "600", color: colors.textPrimary, flex: 1, marginRight: 8 },
  momentumScore: { fontSize: 24, fontWeight: "700", color: colors.primary },
  momentumFocus: { fontSize: 13, color: colors.textSecondary },

  spectrumCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radii.card, padding: 16 },
  spectrumTitle: { fontSize: 13, fontWeight: "700", color: colors.textPrimary, marginBottom: 10 },
  spectrumBar: { flexDirection: "row", gap: 4, marginBottom: 6 },
  spectrumSegment: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.border },
  spectrumSegmentActive: { backgroundColor: colors.primary },
  spectrumLabels: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  spectrumLabel: { fontSize: 10, color: colors.textMeta, flex: 1, textAlign: "center" },
  spectrumLabelActive: { color: colors.primary, fontWeight: "700" },
  spectrumNote: { fontSize: 11, color: colors.textMeta },

  progressBoard: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  progressBoardEmpty: { padding: 16, alignItems: "center" },
  progressMetric: { flexBasis: "47%", flexGrow: 1, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, padding: 12 },
  progressLabel: { fontSize: 12, fontWeight: "600", color: colors.textPrimary, marginBottom: 6 },
  progressPill: { alignSelf: "flex-start", borderRadius: radii.full, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 6 },
  progressPillText: { fontSize: 10, fontWeight: "600" },
  progressCount: { fontSize: 11, color: colors.textSecondary },
  empty: { color: colors.textMeta, fontSize: 13, textAlign: "center" },
});
