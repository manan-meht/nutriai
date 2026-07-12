import { ScrollView, Pressable, Text, StyleSheet } from "react-native";
import { DATE_RANGE_OPTIONS, type DashboardDateRange } from "@nutriai/dashboard-core";
import { colors, radii } from "../lib/theme";

interface DateRangeSelectorProps {
  value: DashboardDateRange;
  onChange: (range: DashboardDateRange) => void;
}

// RN port of the web app's DateRangeSelector — same 7 options from
// src/lib/dashboard/date-range.ts (ported verbatim), horizontally
// scrollable pill row instead of a dropdown/tab bar since there isn't
// room for 7 options on a phone-width screen.
export function DateRangeSelector({ value, onChange }: DateRangeSelectorProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.container}>
      {DATE_RANGE_OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            style={[styles.pill, active && styles.pillActive]}
            onPress={() => onChange(option.value)}
          >
            <Text style={[styles.pillText, active && styles.pillTextActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8, paddingVertical: 4 },
  pill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.full,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: colors.white,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { fontSize: 13, fontWeight: "500", color: colors.textSecondary },
  pillTextActive: { color: colors.white },
});
