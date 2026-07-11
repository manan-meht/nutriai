import { View, Text, StyleSheet } from "react-native";
import { colors, radii } from "../lib/theme";

export interface DayDatum {
  label: string;
  value: number;
}

interface MacroBarChartProps {
  title: string;
  data: DayDatum[];
  unit: string;
  barColor: string;
  target?: number;
}

// RN equivalent of ProteinChart/CalorieChart in
// src/components/gym/dashboard/MacroCharts.tsx — those are built on
// Recharts (SVG), which doesn't run in React Native. Rather than pull in
// a full charting library for what's just a 7-bar daily chart, this is a
// plain View-based bar chart — same buildDayData-shaped input, own
// lightweight rendering. If richer charts are needed later (tooltips,
// animations, multi-series), reconsider a real RN charting library then.
export function MacroBarChart({ title, data, unit, barColor, target }: MacroBarChartProps) {
  const max = Math.max(...data.map((d) => d.value), target ?? 0, 1) * 1.15;

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{title}</Text>
        {target != null && <Text style={styles.target}>Target: {target}{unit}</Text>}
      </View>
      <View style={styles.chart}>
        {target != null && (
          <View style={[styles.targetLine, { bottom: `${(target / max) * 100}%` }]} />
        )}
        {data.map((d, i) => (
          <View key={i} style={styles.barColumn}>
            <View style={styles.barTrack}>
              <View style={[styles.bar, { height: `${Math.max(2, (d.value / max) * 100)}%`, backgroundColor: barColor }]} />
            </View>
            <Text style={styles.barLabel}>{d.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const CHART_HEIGHT = 120;

const styles = StyleSheet.create({
  container: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radii.card, padding: 16 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  title: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  target: { fontSize: 11, color: colors.textMeta },
  chart: { flexDirection: "row", alignItems: "flex-end", height: CHART_HEIGHT, position: "relative" },
  targetLine: { position: "absolute", left: 0, right: 0, height: 1, borderTopWidth: 1, borderTopColor: colors.textMeta, borderStyle: "dashed" },
  barColumn: { flex: 1, alignItems: "center", height: CHART_HEIGHT },
  barTrack: { flex: 1, width: "60%", justifyContent: "flex-end" },
  bar: { width: "100%", borderRadius: 4 },
  barLabel: { fontSize: 10, color: colors.textMeta, marginTop: 4 },
});
