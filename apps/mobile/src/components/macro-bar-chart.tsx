import { useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface DayDatum {
  label: string;
  value: number;
}

// Ported from nutriai-fresh's apps/mobile/src/components/MacroBarChart.tsx
// — RN equivalent of the web dashboard's Recharts-based macro charts
// (Recharts doesn't run in React Native). Plain View-based bar chart rather
// than pulling in a charting library for what's just a 7-bar daily chart.
export function MacroBarChart({
  title,
  data,
  unit,
  barColor,
  target,
}: {
  title: string;
  data: DayDatum[];
  unit: string;
  barColor: string;
  target?: number;
}) {
  const theme = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const max = Math.max(...data.map((d) => d.value), target ?? 0, 1) * 1.15;
  // Fixed per-day width rather than flex-dividing the container — at a
  // 30-day range, flex-equal columns squeezed bars and day labels down to
  // illegible slivers. Past SCROLL_THRESHOLD days the chart switches to
  // fixed-width columns inside a horizontal scroll instead of shrinking
  // further; below it, flex-fill still looks better for a short range.
  const scrollable = data.length > SCROLL_THRESHOLD;

  const bars = (
    <>
      {target != null && (
        <View
          style={[
            styles.targetLine,
            { bottom: `${(target / max) * 100}%`, borderTopColor: theme.textSecondary },
          ]}
        />
      )}
      {data.map((d, i) => (
        <View key={i} style={[styles.barColumn, scrollable && { width: BAR_COLUMN_WIDTH, flex: undefined }]}>
          <View style={styles.barTrack}>
            <View style={[styles.bar, { height: `${Math.max(2, (d.value / max) * 100)}%`, backgroundColor: barColor }]} />
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={styles.barLabel}>
            {d.label}
          </ThemedText>
        </View>
      ))}
    </>
  );

  return (
    <ThemedView type="backgroundElement" style={styles.container}>
      <View style={styles.titleRow}>
        <ThemedText type="smallBold">{title}</ThemedText>
        {target != null && (
          <ThemedText type="small" themeColor="textSecondary">
            Target: {target}
            {unit}
          </ThemedText>
        )}
      </View>
      {scrollable ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          // Data is ordered oldest → newest, so today is the rightmost
          // bar — default there instead of leaving today's data a full
          // scroll away on longer ranges (30/90 days). Re-fires whenever
          // the content width changes (date range or macro switch), not
          // just on mount.
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          <View style={[styles.chart, { width: data.length * BAR_COLUMN_WIDTH }]}>{bars}</View>
        </ScrollView>
      ) : (
        <View style={styles.chart}>{bars}</View>
      )}
    </ThemedView>
  );
}

const CHART_HEIGHT = 120;
const BAR_COLUMN_WIDTH = 36;
const SCROLL_THRESHOLD = 10;

const styles = StyleSheet.create({
  container: { borderRadius: Spacing.three, padding: Spacing.three },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.three },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: CHART_HEIGHT, position: 'relative' },
  targetLine: { position: 'absolute', left: 0, right: 0, height: 1, borderTopWidth: 1, borderStyle: 'dashed' },
  barColumn: { flex: 1, alignItems: 'center', height: CHART_HEIGHT },
  barTrack: { flex: 1, width: '60%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: Spacing.half },
  barLabel: { fontSize: 10, marginTop: Spacing.one },
});
