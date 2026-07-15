import { View, Text, Pressable, TextInput, ScrollView, StyleSheet } from 'react-native';
import type { NutritionGoal } from '@nutriai/health-scoring';

import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';
import {
  NUTRITION_GOAL_OPTIONS,
  ACTIVITY_LEVEL_OPTIONS,
  RESISTANCE_TRAINING_OPTIONS,
  goalUsesResistanceTraining,
} from '@/lib/goals';

export interface NutritionGoalFieldsValue {
  primaryNutritionGoal: NutritionGoal | '';
  dateOfBirth: string;
  metabolicEquationSex: string;
  activityLevel: string;
  resistanceTrainingStatus: string;
  targetWeightKg: string;
}

export const EMPTY_NUTRITION_GOAL_FIELDS: NutritionGoalFieldsValue = {
  primaryNutritionGoal: '',
  dateOfBirth: '',
  metabolicEquationSex: '',
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
// duplicating four times. Sex/activity/resistance-training use horizontal
// chip rows since RN has no native <select>.
export function NutritionGoalFields({ value, onChange }: NutritionGoalFieldsProps) {
  const theme = useTheme();
  const showResistanceTraining = value.primaryNutritionGoal
    ? goalUsesResistanceTraining(value.primaryNutritionGoal)
    : false;

  function set<K extends keyof NutritionGoalFieldsValue>(key: K, v: NutritionGoalFieldsValue[K]) {
    onChange({ ...value, [key]: v });
  }

  return (
    <View>
      <Text style={[styles.sectionTitle, { color: PRIMARY }]}>Nutrition goal — optional, powers the Food Balance Score</Text>

      {NUTRITION_GOAL_OPTIONS.map((option) => {
        const selected = value.primaryNutritionGoal === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => set('primaryNutritionGoal', selected ? '' : option.value)}
            style={[
              styles.goalCard,
              { borderColor: theme.backgroundSelected },
              selected && { borderColor: PRIMARY, backgroundColor: theme.backgroundElement },
            ]}
          >
            <View style={[styles.radio, { borderColor: theme.backgroundSelected }, selected && { borderColor: PRIMARY }]}>
              {selected && <View style={[styles.radioDot, { backgroundColor: PRIMARY }]} />}
            </View>
            <View style={styles.goalCardText}>
              <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>{option.label}</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 2 }}>{option.description}</Text>
            </View>
          </Pressable>
        );
      })}

      {value.primaryNutritionGoal && (
        <View style={[styles.detailsSection, { borderTopColor: theme.backgroundSelected }]}>
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Date of birth (YYYY-MM-DD)</Text>
          <TextInput
            value={value.dateOfBirth}
            onChangeText={(t) => set('dateOfBirth', t)}
            placeholder="1990-01-01"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />

          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Sex (for metabolic estimate)</Text>
          <ChipRow
            options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]}
            selected={value.metabolicEquationSex}
            onSelect={(v) => set('metabolicEquationSex', v)}
          />

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
            These personalize the Food Balance Score's energy/protein targets. Skipping them still shows a general
            score based on food quality alone.
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
  sectionTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  goalCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: 14,
    marginBottom: 8,
  },
  radio: {
    marginTop: 2,
    width: 18,
    height: 18,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 8, height: 8, borderRadius: 999 },
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
