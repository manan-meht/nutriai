import { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { colors, radii } from "../lib/theme";

interface MealLike {
  loggedAt: string;
}
interface WorkoutLike {
  loggedAt: string;
}

interface ActivityHeatmapProps {
  meals: MealLike[];
  workouts?: WorkoutLike[];
  days?: number;
}

function mealColor(count: number): string {
  if (count >= 3) return colors.primary;
  if (count === 2) return "#9F87C7"; // purple-400-ish
  if (count === 1) return "#D9CCEC"; // purple-200-ish
  return "#F0F0F0"; // gray-100
}

// RN port of src/components/gym/dashboard/ActivityHeatmap.tsx — that
// version is plain divs (no charting library) already, so this ports
// directly to a View-based grid. The native `title` tooltip on web
// becomes tap-to-reveal here instead, since RN has no hover/tooltip
// equivalent.
export function ActivityHeatmap({ meals, workouts = [], days = 30 }: ActivityHeatmapProps) {
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
                style={[
                  styles.cell,
                  { backgroundColor: mealColor(cell.mealCount) },
                  cell.isToday && styles.today,
                ]}
                onPress={() => setSelectedKey(cell.key === selectedKey ? null : cell.key)}
              >
                {cell.hasWorkout && <View style={styles.workoutDot} />}
              </Pressable>
            ))}
          </View>
        ))}
      </View>

      {selected && (
        <Text style={styles.tooltip}>
          {selected.date.toLocaleDateString()}: {selected.mealCount} meal{selected.mealCount === 1 ? "" : "s"}
          {selected.hasWorkout ? " · workout logged" : ""}
        </Text>
      )}

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: mealColor(0) }]} />
          <Text style={styles.legendText}>No meals</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: mealColor(3) }]} />
          <Text style={styles.legendText}>3+ meals</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={styles.workoutDotLegend} />
          <Text style={styles.legendText}>Workout</Text>
        </View>
      </View>
    </View>
  );
}

const CELL_SIZE = 12;

const styles = StyleSheet.create({
  grid: { flexDirection: "row", gap: 3 },
  week: { gap: 3 },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: 3,
  },
  today: { borderWidth: 1.5, borderColor: colors.primary },
  workoutDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 5,
    height: 5,
    borderRadius: radii.full,
    backgroundColor: colors.activityDot,
  },
  tooltip: { fontSize: 12, color: colors.textSecondary, marginTop: 8 },
  legend: { flexDirection: "row", gap: 16, marginTop: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
  legendText: { fontSize: 11, color: colors.textMeta },
  workoutDotLegend: { width: 6, height: 6, borderRadius: radii.full, backgroundColor: colors.activityDot },
});
