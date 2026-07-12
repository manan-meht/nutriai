import { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { colors, radii } from "../lib/theme";
import { MacroBarChart, type DayDatum } from "./MacroBarChart";

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

type MacroKey = "protein" | "carbs" | "fat" | "fiber";

const MACRO_META: Record<MacroKey, { label: string; unit: string; color: string }> = {
  protein: { label: "Protein", unit: "g", color: colors.primary },
  carbs: { label: "Carbs", unit: "g", color: "#2563eb" },
  fat: { label: "Fat", unit: "g", color: "#f97316" },
  fiber: { label: "Fiber", unit: "g", color: "#059669" },
};
const MACRO_KEYS: MacroKey[] = ["protein", "carbs", "fat", "fiber"];

function mealAvg(m: MacroMeal, key: MacroKey): number {
  switch (key) {
    case "protein": return (m.totalProteinMin + m.totalProteinMax) / 2;
    case "carbs": return (m.totalCarbsMin + m.totalCarbsMax) / 2;
    case "fat": return (m.totalFatMin + m.totalFatMax) / 2;
    case "fiber": return (m.totalFiberMin + m.totalFiberMax) / 2;
  }
}

function buildDayData(meals: MacroMeal[], key: MacroKey, days: number): DayDatum[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const dayKey = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString(undefined, { weekday: "short" });
    const dayMeals = meals.filter((m) => m.loggedAt.slice(0, 10) === dayKey);
    return { label, value: dayMeals.length ? Math.round(dayMeals.reduce((s, m) => s + mealAvg(m, key), 0)) : 0 };
  });
}

function averagePerDay(meals: MacroMeal[], key: MacroKey, days: number): number {
  if (!meals.length || days <= 0) return 0;
  const total = meals.reduce((s, m) => s + mealAvg(m, key), 0);
  return Math.round(total / days);
}

interface MacronutrientSummaryProps {
  meals: MacroMeal[];
  days: number;
  targets?: Partial<Record<MacroKey, number>>;
}

/** RN port of src/components/shared/dashboard/MacronutrientSummary.tsx —
 * web uses Recharts (not available in RN); this reuses the existing
 * plain-View MacroBarChart component instead of pulling in a charting
 * library, same reasoning as MacroBarChart.tsx's own comment. Shows 4
 * macro pills (protein/carbs/fat/fiber) with one detail chart for
 * whichever is selected, mirroring web's mobile-width layout. */
export function MacronutrientSummary({ meals, days, targets }: MacronutrientSummaryProps) {
  const [selected, setSelected] = useState<MacroKey>("protein");
  const chartDays = Math.min(Math.max(days, 1), 30);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Macronutrient summary</Text>
      <View style={styles.pillRow}>
        {MACRO_KEYS.map((key) => {
          const meta = MACRO_META[key];
          const average = averagePerDay(meals, key, days);
          const target = targets?.[key];
          const active = key === selected;
          return (
            <Pressable key={key} onPress={() => setSelected(key)} style={[styles.pill, active && styles.pillActive]}>
              <Text style={styles.pillLabel}>{meta.label}</Text>
              <Text style={styles.pillValue}>
                {average}
                <Text style={styles.pillUnit}>{meta.unit}</Text>
              </Text>
              {target ? <Text style={styles.pillTarget}>target {target}{meta.unit}</Text> : null}
            </Pressable>
          );
        })}
      </View>
      <MacroBarChart
        title={`${MACRO_META[selected].label} (${MACRO_META[selected].unit})`}
        data={buildDayData(meals, selected, chartDays)}
        unit={MACRO_META[selected].unit}
        barColor={MACRO_META[selected].color}
        target={targets?.[selected]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radii.card, padding: 16 },
  title: { fontSize: 12, fontWeight: "700", color: colors.textMeta, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 },
  pillRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  pill: { flex: 1, backgroundColor: colors.surface, borderRadius: radii.pill, padding: 10 },
  pillActive: { backgroundColor: colors.primaryLight },
  pillLabel: { fontSize: 11, fontWeight: "600", color: colors.textSecondary },
  pillValue: { fontSize: 16, fontWeight: "700", color: colors.textPrimary, marginTop: 2 },
  pillUnit: { fontSize: 10, fontWeight: "500", color: colors.textMeta },
  pillTarget: { fontSize: 10, color: colors.textMeta, marginTop: 2 },
});
