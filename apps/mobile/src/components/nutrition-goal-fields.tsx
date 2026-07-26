import { useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import { resolveMacroStrategy, STRATEGY_EXPLANATIONS, type NutritionGoal } from '@nutriai/health-scoring';

import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';
import {
  NUTRITION_GOAL_OPTIONS,
  DAILY_MOVEMENT_OPTIONS,
  WEEKLY_MODERATE_ACTIVITY_OPTIONS,
  STRENGTH_EXERCISE_FREQUENCY_OPTIONS,
  goalUsesResistanceTraining,
} from '@/lib/goals';

export interface NutritionGoalFieldsValue {
  /** One or more simultaneous goals — see packages/health-scoring's
   * FoodBalanceUserProfile.goals doc comment for how multiple goals blend
   * into a single energy/protein target rather than picking a "primary"
   * winner. */
  nutritionGoals: NutritionGoal[];
  dailyMovementLevel: string;
  weeklyModerateActivity: string;
  strengthExerciseFrequency: string;
  targetWeightKg: string;
}

export const EMPTY_NUTRITION_GOAL_FIELDS: NutritionGoalFieldsValue = {
  nutritionGoals: [],
  dailyMovementLevel: 'not_sure',
  weeklyModerateActivity: 'not_sure',
  strengthExerciseFrequency: 'not_sure',
  targetWeightKg: '',
};

/** See web's NutritionGoalFields.tsx PersonDisplay — same contract, mirrored
 * here since this app can't import from the Next.js web app directly.
 * Resolves verb conjugation ("you do" / "they do" / "Meera does") and
 * possessive form for the personalized question copy below. */
export type PersonDisplay = { type: 'self' } | { type: 'name'; name: string } | { type: 'they' };

function personCopy(display: PersonDisplay): { subject: string; doForm: string } {
  if (display.type === 'self') return { subject: 'you', doForm: 'do' };
  if (display.type === 'name') return { subject: display.name, doForm: 'does' };
  return { subject: 'they', doForm: 'do' };
}

interface NutritionGoalFieldsProps {
  value: NutritionGoalFieldsValue;
  onChange: (value: NutritionGoalFieldsValue) => void;
  /** Defaults to "they" (family/client with no name typed yet) when
   * omitted. */
  personDisplay?: PersonDisplay;
}

// Ported from nutriai-fresh's old apps/mobile/src/components/NutritionGoalFields.tsx
// (see git history) — same Food Balance Score goal + profile inputs, shared
// by the add/edit person and add/edit client screens instead of
// duplicating four times.
//
// The activity questions are deliberately behavioural rather than
// subjective ("mostly sitting" vs "very active") — see
// @nutriai/health-scoring's deriveActivityLevel for how the two answers
// below become the internal category calorie/macro calculations use.
// "Resistance training" (a term many users didn't understand) is replaced
// by "strength-building exercises". These options now use a vertical
// answer-card list (AnswerCards below) rather than the old horizontal chip
// row — several of the new option labels are full sentences, which don't
// fit a horizontal scroll the way "Mostly sitting" did.
//
// Goals are multi-select (checkboxes, not the old single-choice radio) —
// packages/health-scoring blends multiple simultaneous goals into one
// energy/protein target rather than forcing a single "primary" choice.
//
// No separate "date of birth"/"sex for metabolic estimate" fields here —
// those used to duplicate the age/gender fields already collected earlier
// in the same form. Age and gender (already on the person) are used
// directly for all calculations now.
export function NutritionGoalFields({ value, onChange, personDisplay = { type: 'they' } }: NutritionGoalFieldsProps) {
  const theme = useTheme();
  const showStrengthExercise = value.nutritionGoals.some((g) => goalUsesResistanceTraining(g));
  const hasAnyGoal = value.nutritionGoals.length > 0;
  const [showBreathingHelp, setShowBreathingHelp] = useState(false);
  const { subject, doForm } = personCopy(personDisplay);
  const isSelf = personDisplay.type === 'self';

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
        Choose one or more goals. Tistra will use these to suggest {isSelf ? 'your' : `${subject}'s`} starting nutrition
        targets.
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
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
            What does a typical day look like for {subject}?
          </Text>
          <Text style={[styles.fieldHint, { color: theme.textSecondary }]}>
            Include work, household tasks, walking and other regular movement.
          </Text>
          <AnswerCards options={DAILY_MOVEMENT_OPTIONS} selected={value.dailyMovementLevel} onSelect={(v) => set('dailyMovementLevel', v)} />

          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
            In a typical week, how much activity makes {subject} breathe faster?
          </Text>
          <Text style={[styles.fieldHint, { color: theme.textSecondary }]}>
            Include brisk walking, cycling, energetic household work, active yoga, exercise, sports and physically demanding
            work. Do not include slow walking, gentle stretching or very light household tasks.
          </Text>
          <Pressable onPress={() => setShowBreathingHelp((v) => !v)}>
            <Text style={[styles.helpToggle, { color: PRIMARY }]}>{showBreathingHelp ? 'Hide example' : 'What does that mean?'}</Text>
          </Pressable>
          {showBreathingHelp && (
            <View style={[styles.helpBox, { backgroundColor: theme.backgroundElement }]}>
              <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 17 }}>
                During this activity, {isSelf ? 'you should' : `${subject} should`} be able to talk, but would find it
                difficult to sing.
              </Text>
            </View>
          )}
          <AnswerCards
            options={WEEKLY_MODERATE_ACTIVITY_OPTIONS}
            selected={value.weeklyModerateActivity}
            onSelect={(v) => set('weeklyModerateActivity', v)}
          />

          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Target weight (kg) — optional</Text>
          <TextInput
            value={value.targetWeightKg}
            onChangeText={(t) => set('targetWeightKg', t)}
            placeholder="65"
            placeholderTextColor={theme.textSecondary}
            keyboardType="numeric"
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />

          {showStrengthExercise && (
            <>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                How many days a week {doForm} {subject} do strength-building exercises, such as lifting weights, squats or
                push-ups?
              </Text>
              <Text style={[styles.fieldHint, { color: theme.textSecondary }]}>
                This can include weights, resistance bands or challenging body-weight exercises. Regular yoga only counts if
                it&apos;s a challenging routine that makes the muscles work harder than usual.
              </Text>
              <AnswerCards
                options={STRENGTH_EXERCISE_FREQUENCY_OPTIONS}
                selected={value.strengthExerciseFrequency}
                onSelect={(v) => set('strengthExerciseFrequency', v)}
              />
            </>
          )}

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

/** Vertical single-select answer list — replaces the old horizontal
 * ChipRow for these questions, since several option labels here are full
 * sentences that don't fit a horizontal scroll. "Not sure" is always last
 * and visually secondary (dimmed), matching the web version's identical
 * treatment. Uses accessibilityRole="radio"/radiogroup so screen readers
 * announce selection state correctly, and never relies on colour alone
 * (the filled dot + border both change on selection). */
function AnswerCards({
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
    <View accessibilityRole="radiogroup" style={styles.answerList}>
      {options.map((option) => {
        const active = option.value === selected;
        const isNotSure = option.value === 'not_sure';
        return (
          <Pressable
            key={option.value}
            onPress={() => onSelect(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            style={[
              styles.answerCard,
              { borderColor: theme.backgroundSelected },
              active && { borderColor: PRIMARY, backgroundColor: theme.backgroundElement },
              isNotSure && styles.answerCardMuted,
            ]}
          >
            <View style={[styles.radioOuter, { borderColor: active ? PRIMARY : theme.backgroundSelected }]}>
              {active && <View style={[styles.radioInner, { backgroundColor: PRIMARY }]} />}
            </View>
            <Text style={{ color: isNotSure ? theme.textSecondary : theme.text, fontSize: 13.5, flex: 1 }}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
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
  fieldLabel: { fontSize: 13, fontWeight: '500', marginBottom: 4, marginTop: 14 },
  fieldHint: { fontSize: 12, marginBottom: 8, lineHeight: 16 },
  helpToggle: { fontSize: 12, textDecorationLine: 'underline', marginBottom: 8 },
  helpBox: { borderRadius: Spacing.two, padding: 10, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: 12,
    fontSize: 14,
  },
  answerList: { gap: 6, marginBottom: 4 },
  answerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  answerCardMuted: { opacity: 0.7 },
  radioOuter: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: { width: 8, height: 8, borderRadius: 4 },
  hint: { fontSize: 12, marginTop: 12, lineHeight: 17 },
});
