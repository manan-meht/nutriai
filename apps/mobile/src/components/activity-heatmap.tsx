import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';
import { Spacing } from '@/constants/theme';

interface MealLike {
  loggedAt: string;
}

function mealColor(count: number): string {
  if (count >= 3) return '#5715CE';
  if (count === 2) return '#9F87C7';
  if (count === 1) return '#D9CCEC';
  return '#E0E1E6';
}

// Ported from nutriai-fresh's apps/mobile/src/components/ActivityHeatmap.tsx
// — View-based grid (no charting library). The native `title` tooltip on
// web becomes tap-to-reveal here, since RN has no hover/tooltip
// equivalent.
export function ActivityHeatmap({
  meals,
  days = 30,
}: {
  meals: MealLike[];
  days?: number;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cells = Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (days - 1 - i));
    const key = d.toISOString().slice(0, 10);
    const mealCount = meals.filter((m) => m.loggedAt.slice(0, 10) === key).length;
    const isToday = key === today.toISOString().slice(0, 10);
    return { key, date: d, mealCount, isToday };
  });

  const weeks: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const selected = cells.find((c) => c.key === selectedKey);

  return (
    <View>
      <View style={styles.grid}>
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.week}>
            {week.map((cell) => (
              <Pressable
                key={cell.key}
                style={[styles.cell, { backgroundColor: mealColor(cell.mealCount) }, cell.isToday && styles.today]}
                onPress={() => setSelectedKey(cell.key === selectedKey ? null : cell.key)}
              />
            ))}
          </View>
        ))}
      </View>

      {selected && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.tooltip}>
          {selected.date.toLocaleDateString()}: {selected.mealCount} meal{selected.mealCount === 1 ? '' : 's'}
        </ThemedText>
      )}

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: mealColor(0) }]} />
          <ThemedText type="small" themeColor="textSecondary">
            No meals
          </ThemedText>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: mealColor(3) }]} />
          <ThemedText type="small" themeColor="textSecondary">
            3+ meals
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

const CELL_SIZE = 14;

const styles = StyleSheet.create({
  // justifyContent: 'space-between' + width: '100%' (rather than a fixed
  // gap) spreads the week-columns across the full card width instead of
  // leaving them content-sized and hugging the left edge.
  grid: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  week: { gap: 3 },
  cell: { width: CELL_SIZE, height: CELL_SIZE, borderRadius: 3 },
  today: { borderWidth: 1.5, borderColor: '#5715CE' },
  tooltip: { marginTop: Spacing.two },
  legend: { flexDirection: 'row', gap: Spacing.four, marginTop: Spacing.three },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
});
