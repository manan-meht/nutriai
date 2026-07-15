import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';
import { Spacing } from '@/constants/theme';

interface MealLike {
  loggedAt: string;
}
interface WorkoutLike {
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
  workouts = [],
  days = 30,
}: {
  meals: MealLike[];
  workouts?: WorkoutLike[];
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
    const hasWorkout = workouts.some((w) => w.loggedAt.slice(0, 10) === key);
    const isToday = key === today.toISOString().slice(0, 10);
    return { key, date: d, mealCount, hasWorkout, isToday };
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
                onPress={() => setSelectedKey(cell.key === selectedKey ? null : cell.key)}>
                {cell.hasWorkout && <View style={styles.workoutDot} />}
              </Pressable>
            ))}
          </View>
        ))}
      </View>

      {selected && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.tooltip}>
          {selected.date.toLocaleDateString()}: {selected.mealCount} meal{selected.mealCount === 1 ? '' : 's'}
          {selected.hasWorkout ? ' · workout logged' : ''}
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
        <View style={styles.legendItem}>
          <View style={styles.workoutDotLegend} />
          <ThemedText type="small" themeColor="textSecondary">
            Workout
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

const CELL_SIZE = 12;

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: 3 },
  week: { gap: 3 },
  cell: { width: CELL_SIZE, height: CELL_SIZE, borderRadius: 3 },
  today: { borderWidth: 1.5, borderColor: '#5715CE' },
  workoutDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 5,
    height: 5,
    borderRadius: Spacing.two,
    backgroundColor: '#4ADE80',
  },
  tooltip: { marginTop: Spacing.two },
  legend: { flexDirection: 'row', gap: Spacing.four, marginTop: Spacing.three },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
  workoutDotLegend: { width: 6, height: 6, borderRadius: Spacing.two, backgroundColor: '#4ADE80' },
});
