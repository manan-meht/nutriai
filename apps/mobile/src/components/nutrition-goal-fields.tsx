import { View, Text, Pressable, TextInput, ScrollView, StyleSheet } from 'react-native';
import { resolveMacroStrategy, STRATEGY_EXPLANATIONS, type NutritionGoal } from '@nutriai/health-scoring';

import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';
import {
  NUTRITION_GOAL_OPTIONS,
  ACTIVITY_LEVEL_OPTIONS,
  RESISTANCE_TRAINING_OPTIONS,
  goalUsesResistanceTraining,
} from '@/lib/goals';

export interface NutritionGoalFieldsValue {
  /** One or more simultaneous goals — see packages/health-scoring's
   * FoodBalanceUserProfile.goals doc comment for how multiple goals blend
   * into a single energy/protein target rather than picking a "primary"
   * winner. */
  nutritionGoals: NutritionGoal[];
  activityLevel: string;
  resistanceTrainingStatus: string;
  targetWeightKg: string;
}

export const EMPTY_NUTRITION_GOAL_FIELDS: NutritionGoalFieldsValue = {
  nutritionGoals: [],
  activityLevel: 'unknown',
  resistanceTrainingStatus: 'unknown',
  targetWeightKg: '',
};

interface NutritionGoalFieldsProps {
  value: NutritionGoalFieldsValue;
  onChange: (value: NutritionGoalFieldsValue) => void;
}

// Ported from nutriai-fresh's old apps/mobile/src/components/NutritionGoalFields.tsx
// (see git history) — same Food Balance Score goal + profile inputs, shared
// by the add/edit person and add/edit client screens instead of
// duplicating four times. Activity/resistance-training use horizontal chip
// rows since RN has no native <select>.
//
// Goals are multi-select (checkboxes, not the old single-choice radio) —
// packages/health-scoring blends multiple simultaneous goals into one
// energy/protein target rather than forcing a single "primary" choice.
//
// No separate "date of birth"/"sex for metabolic estimate" fields here —
// those used to duplicate the age/gender fields already collected earlier
// in the same form. Age and gender (already on the person) are used
// directly for all calculations now.
export function NutritionGoalFields({ value, onChange }: NutritionGoalFieldsProps) {
  const theme = useTheme();
  const showResistanceTraining = value.nutritionGoals.some((g) => goalUsesResistanceTraining(g));
  const hasAnyGoal = value.nutritionGoals.length > 0;

  function set<K extends keyof NutritionGoalFieldsValue>(key: K, v: NutritionGoalFieldsValue[K]) {
    onChange({ ...value, [key]: v });
  }

  function toggleGoal(goal: NutritionGoal) {
    const selected = value.nutritionGoals.includes(goal);
    set('nutritionGoals', selected ? value.nutritionGoals.filter((g) => g !== goal) : [...value.nutritionGoals, goal]);
  }

  return (
    <View>
      <Text style={[styles.sectionTitle, { color: PRIMARY }]}>Nutrition goals — optional, powers the Food Balance Score. Pick as many as apply.</Text>
      <Text style={[styles.subHint, { color: theme.textSecondary }]}>
        Choose one or more goals. Tistra will use these to suggest your starting nutrition targets.
      </Text>

      {NUTRITION_GOAL_OPTIONS.map((option) => {
        const selected = value.nutritionGoals.includes(option.value);
        return (
          <Pressable
            key={option.value}
            onPress={() => toggleGoal(option.value)}
            style={[
              styles.goalCard,
              { borderColor: theme.backgroundSelected },
              selected && { borderColor: PRIMARY, backgroundColor: theme.backgroundElement },
            ]}
          >
            <View style={[styles.checkbox, { borderColor: theme.backgroundSelected }, selected && { borderColor: PRIMARY, backgroundColor: PRIMARY }]}>
              {selected && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <View style={styles.goalCardText}>
              <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>{option.label}</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 2 }}>{option.description}</Text>
            </View>
          </Pressable>
        );
      })}

      {hasAnyGoal && (
        <View style={[styles.strategyBox, { backgroundColor: theme.backgroundElement }]}>
          <Text style={{ color: PRIMARY, fontSize: 12, lineHeight: 17 }}>
            {STRATEGY_EXPLANATIONS[resolveMacroStrategy(value.nutritionGoals)]}
          </Text>
        </View>
      )}

      {hasAnyGoal && (
        <View style={[styles.detailsSection, { borderTopColor: theme.backgroundSelected }]}>
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Activity level</Text>
          <ChipRow options={ACTIVITY_LEVEL_OPTIONS} selected={value.activityLevel} onSelect={(v) => set('activityLevel', v)} />

          {showResistanceTraining && (
            <>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Do they currently do resistance training?</Text>
              <ChipRow
                options={RESISTANCE_TRAINING_OPTIONS}
                selected={value.resistanceTrainingStatus}
                onSelect={(v) => set('resistanceTrainingStatus', v)}
              />
            </>
          )}

          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Target weight (kg) — optional</Text>
          <TextInput
            value={value.targetWeightKg}
            onChangeText={(t) => set('targetWeightKg', t)}
            placeholder="65"
            placeholderTextColor={theme.textSecondary}
            keyboardType="numeric"
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />

          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            These personalize the Food Balance Score&apos;s energy/protein targets, using the age/gender already entered
            above. Skipping them still shows a general score based on food quality alone.
          </Text>
        </View>
      )}
    </View>
  );
}

// Matches login.tsx's existing hardcoded primary color — this app's theme
// tokens (src/constants/theme.ts) don't define a brand color yet.
const PRIMARY = '#5715CE';

function ChipRow({
  options,
  selected,
  onSelect,
}: {
  options: Array<{ value: string; label: string }>;
  selected: string;
  onSelect: (value: string) => void;
}) {
  const theme = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {options.map((option) => {
        const active = option.value === selected;
        return (
          <Pressable
            key={option.value}
            onPress={() => onSelect(option.value)}
            style={[
              styles.chip,
              { borderColor: theme.backgroundSelected, backgroundColor: theme.background },
              active && { backgroundColor: PRIMARY, borderColor: PRIMARY },
            ]}
          >
            <Text style={[{ fontSize: 13, fontWeight: '500', color: theme.textSecondary }, active && { color: '#fff' }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  subHint: { fontSize: 12, marginBottom: 12, lineHeight: 16 },
  strategyBox: { borderRadius: Spacing.two, padding: 12, marginBottom: 8 },
  goalCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: 14,
    marginBottom: 8,
  },
  checkbox: {
    marginTop: 2,
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: { color: '#fff', fontSize: 12, fontWeight: '700', lineHeight: 14 },
  goalCardText: { flex: 1 },
  detailsSection: { marginTop: 8, paddingTop: 16, borderTopWidth: 1 },
  fieldLabel: { fontSize: 13, fontWeight: '500', marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: 12,
    fontSize: 14,
  },
  chipRow: { gap: 8, paddingVertical: 2 },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  hint: { fontSize: 12, marginTop: 12, lineHeight: 17 },
});
