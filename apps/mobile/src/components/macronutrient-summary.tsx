import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { MacroBarChart, type DayDatum } from './macro-bar-chart';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { Spacing } from '@/constants/theme';

export interface MacroMeal {
  loggedAt: string;
  totalProteinMin: number;
  totalProteinMax: number;
  totalCarbsMin: number;
  totalCarbsMax: number;
  totalFatMin: number;
  totalFatMax: number;
  totalFiberMin: number;
  totalFiberMax: number;
}

type MacroKey = 'protein' | 'carbs' | 'fat' | 'fiber';

const MACRO_META: Record<MacroKey, { label: string; unit: string; color: string }> = {
  protein: { label: 'Protein', unit: 'g', color: '#5715CE' },
  carbs: { label: 'Carbs', unit: 'g', color: '#2563eb' },
  fat: { label: 'Fat', unit: 'g', color: '#f97316' },
  fiber: { label: 'Fiber', unit: 'g', color: '#059669' },
};
const MACRO_KEYS: MacroKey[] = ['protein', 'carbs', 'fat', 'fiber'];

function mealAvg(m: MacroMeal, key: MacroKey): number {
  switch (key) {
    case 'protein':
      return (m.totalProteinMin + m.totalProteinMax) / 2;
    case 'carbs':
      return (m.totalCarbsMin + m.totalCarbsMax) / 2;
    case 'fat':
      return (m.totalFatMin + m.totalFatMax) / 2;
    case 'fiber':
      return (m.totalFiberMin + m.totalFiberMax) / 2;
  }
}

function buildDayData(meals: MacroMeal[], key: MacroKey, days: number): DayDatum[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const dayKey = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString(undefined, { weekday: 'short' });
    const dayMeals = meals.filter((m) => m.loggedAt.slice(0, 10) === dayKey);
    return { label, value: dayMeals.length ? Math.round(dayMeals.reduce((s, m) => s + mealAvg(m, key), 0)) : 0 };
  });
}

function averagePerDay(meals: MacroMeal[], key: MacroKey, days: number): number {
  if (!meals.length || days <= 0) return 0;
  const total = meals.reduce((s, m) => s + mealAvg(m, key), 0);
  return Math.round(total / days);
}

// Ported from nutriai-fresh's
// apps/mobile/src/components/MacronutrientSummary.tsx — shows 4 macro
// pills (protein/carbs/fat/fiber) with one detail chart for whichever is
// selected, mirroring web's mobile-width layout.
export function MacronutrientSummary({
  meals,
  days,
  targets,
}: {
  meals: MacroMeal[];
  days: number;
  targets?: Partial<Record<MacroKey, number>>;
}) {
  const [selected, setSelected] = useState<MacroKey>('protein');
  const chartDays = Math.min(Math.max(days, 1), 30);

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.title}>
        Macronutrient summary
      </ThemedText>
      <ThemedView style={styles.pillRow}>
        {MACRO_KEYS.map((key) => {
          const meta = MACRO_META[key];
          const average = averagePerDay(meals, key, days);
          const target = targets?.[key];
          const active = key === selected;
          return (
            <Pressable key={key} onPress={() => setSelected(key)} style={styles.pillWrap}>
              <ThemedView type={active ? 'backgroundSelected' : 'backgroundElement'} style={styles.pill}>
                <ThemedText type="small" themeColor="textSecondary">
                  {meta.label}
                </ThemedText>
                <ThemedText type="default" style={styles.pillValue}>
                  {average}
                  <ThemedText type="small" themeColor="textSecondary">
                    {meta.unit}
                  </ThemedText>
                </ThemedText>
                {target ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.pillTarget}>
                    target {target}
                    {meta.unit}
                  </ThemedText>
                ) : null}
              </ThemedView>
            </Pressable>
          );
        })}
      </ThemedView>
      <MacroBarChart
        title={`${MACRO_META[selected].label} (${MACRO_META[selected].unit})`}
        data={buildDayData(meals, selected, chartDays)}
        unit={MACRO_META[selected].unit}
        barColor={MACRO_META[selected].color}
        target={targets?.[selected]}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.three },
  title: { textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700' },
  pillRow: { flexDirection: 'row', gap: Spacing.two },
  pillWrap: { flex: 1 },
  pill: { borderRadius: Spacing.two, padding: Spacing.two },
  pillValue: { fontWeight: '700', marginTop: Spacing.half },
  pillTarget: { marginTop: Spacing.half, fontSize: 10 },
});
