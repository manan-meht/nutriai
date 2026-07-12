import { View, Text, Pressable, TextInput, ScrollView, StyleSheet } from "react-native";
import type { NutritionGoal } from "@nutriai/health-scoring";
import { NUTRITION_GOAL_OPTIONS, ACTIVITY_LEVEL_OPTIONS, RESISTANCE_TRAINING_OPTIONS, goalUsesResistanceTraining } from "../lib/goalOptions";
import { colors, radii } from "../lib/theme";

export interface NutritionGoalFieldsValue {
  primaryNutritionGoal: NutritionGoal | "";
  dateOfBirth: string;
  metabolicEquationSex: string;
  activityLevel: string;
  resistanceTrainingStatus: string;
  targetWeightKg: string;
}

export const EMPTY_NUTRITION_GOAL_FIELDS: NutritionGoalFieldsValue = {
  primaryNutritionGoal: "",
  dateOfBirth: "",
  metabolicEquationSex: "",
  activityLevel: "unknown",
  resistanceTrainingStatus: "unknown",
  targetWeightKg: "",
};

interface NutritionGoalFieldsProps {
  value: NutritionGoalFieldsValue;
  onChange: (value: NutritionGoalFieldsValue) => void;
}

/** RN port of src/components/shared/dashboard/NutritionGoalFields.tsx on
 * web — same Food Balance Score goal + profile inputs, shared by the
 * add/edit person and add/edit client screens instead of duplicating four
 * times. Sex/activity/resistance-training use horizontal chip rows (same
 * visual pattern as DateRangeSelector.tsx) since RN has no native <select>. */
export function NutritionGoalFields({ value, onChange }: NutritionGoalFieldsProps) {
  const showResistanceTraining = value.primaryNutritionGoal
    ? goalUsesResistanceTraining(value.primaryNutritionGoal)
    : false;

  function set<K extends keyof NutritionGoalFieldsValue>(key: K, v: NutritionGoalFieldsValue[K]) {
    onChange({ ...value, [key]: v });
  }

  return (
    <View>
      <Text style={styles.sectionTitle}>Nutrition goal — optional, powers the Food Balance Score</Text>

      {NUTRITION_GOAL_OPTIONS.map((option) => {
        const selected = value.primaryNutritionGoal === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => set("primaryNutritionGoal", selected ? "" : option.value)}
            style={[styles.goalCard, selected && styles.goalCardSelected]}
          >
            <View style={[styles.radio, selected && styles.radioSelected]}>
              {selected && <View style={styles.radioDot} />}
            </View>
            <View style={styles.goalCardText}>
              <Text style={styles.goalTitle}>{option.label}</Text>
              <Text style={styles.goalDescription}>{option.description}</Text>
            </View>
          </Pressable>
        );
      })}

      {value.primaryNutritionGoal && (
        <View style={styles.detailsSection}>
          <Text style={styles.fieldLabel}>Date of birth (YYYY-MM-DD)</Text>
          <TextInput
            value={value.dateOfBirth}
            onChangeText={(t) => set("dateOfBirth", t)}
            placeholder="1990-01-01"
            style={styles.input}
          />

          <Text style={styles.fieldLabel}>Sex (for metabolic estimate)</Text>
          <ChipRow
            options={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }]}
            selected={value.metabolicEquationSex}
            onSelect={(v) => set("metabolicEquationSex", v)}
          />

          <Text style={styles.fieldLabel}>Activity level</Text>
          <ChipRow
            options={ACTIVITY_LEVEL_OPTIONS}
            selected={value.activityLevel}
            onSelect={(v) => set("activityLevel", v)}
          />

          {showResistanceTraining && (
            <>
              <Text style={styles.fieldLabel}>Do they currently do resistance training?</Text>
              <ChipRow
                options={RESISTANCE_TRAINING_OPTIONS}
                selected={value.resistanceTrainingStatus}
                onSelect={(v) => set("resistanceTrainingStatus", v)}
              />
            </>
          )}

          <Text style={styles.fieldLabel}>Target weight (kg) — optional</Text>
          <TextInput
            value={value.targetWeightKg}
            onChangeText={(t) => set("targetWeightKg", t)}
            placeholder="65"
            keyboardType="numeric"
            style={styles.input}
          />

          <Text style={styles.hint}>
            These personalize the Food Balance Score's energy/protein targets. Skipping them still shows a general
            score based on food quality alone.
          </Text>
        </View>
      )}
    </View>
  );
}

function ChipRow({
  options,
  selected,
  onSelect,
}: {
  options: Array<{ value: string; label: string }>;
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {options.map((option) => {
        const active = option.value === selected;
        return (
          <Pressable key={option.value} onPress={() => onSelect(option.value)} style={[styles.chip, active && styles.chipActive]}>
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 12, fontWeight: "700", color: colors.primary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 },
  goalCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    padding: 14,
    marginBottom: 8,
  },
  goalCardSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  radio: {
    marginTop: 2,
    width: 18,
    height: 18,
    borderRadius: radii.full,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 8, height: 8, borderRadius: radii.full, backgroundColor: colors.primary },
  goalCardText: { flex: 1 },
  goalTitle: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  goalDescription: { fontSize: 12, color: colors.textMeta, marginTop: 2 },
  detailsSection: { marginTop: 8, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border },
  fieldLabel: { fontSize: 13, fontWeight: "500", color: colors.textSecondary, marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    padding: 12,
    fontSize: 14,
    color: colors.textPrimary,
  },
  chipRow: { gap: 8, paddingVertical: 2 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.white,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: "500", color: colors.textSecondary },
  chipTextActive: { color: colors.white },
  hint: { fontSize: 12, color: colors.textMeta, marginTop: 12, lineHeight: 17 },
});
