import { ScrollView, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from './themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { DATE_RANGE_OPTIONS, type DashboardDateRange } from '@nutriai/dashboard-core';

// Ported from nutriai-fresh's apps/mobile/src/components/DateRangeSelector.tsx
// — same 7 options (see src/lib/date-range.ts), horizontally scrollable
// pill row instead of a dropdown/tab bar since there isn't room for 7
// options on a phone-width screen.
export function DateRangeSelector({
  value,
  onChange,
}: {
  value: DashboardDateRange;
  onChange: (range: DashboardDateRange) => void;
}) {
  const theme = useTheme();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.container}>
      {DATE_RANGE_OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            style={[
              styles.pill,
              { borderColor: theme.backgroundSelected },
              active && styles.pillActive,
            ]}
            onPress={() => onChange(option.value)}>
            <ThemedText type="small" style={active ? styles.pillTextActive : undefined} themeColor={active ? undefined : 'textSecondary'}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two, paddingVertical: Spacing.one },
  pill: {
    borderWidth: 1,
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  pillActive: { backgroundColor: '#5715CE', borderColor: '#5715CE' },
  pillTextActive: { color: '#ffffff', fontWeight: '600' },
});
