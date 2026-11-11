import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { GM, GM_TAP } from '@/constants/guidance-theme';
import { ACTIVITY_LEVEL_OPTIONS, NUTRITION_GOAL_OPTIONS } from '@/lib/goals';
import { hasRequiredDetails, personWords, type SetupFormState, type YesNo } from '@/lib/guidance-setup-form';
import type { GuidancePerson, NutritionGoal } from '@/lib/guidance-types';

import { Card, ChoiceChips, Chevron, GText, QuietButton, SelectField, TextField } from './ui';

// The questions behind a target. Mirrors the web's GuidanceSetupForm.tsx;
// the state, wording and answers live in lib/guidance-setup-form.ts.
//
// Measurements and goals start from what the profile already holds, shown
// as a summary to confirm, with Edit; they open as a form only when
// something the calculation needs is missing. The three health questions
// always start blank, with nothing preselected, and are asked every time.
// Meal preferences are optional and fold away. Every question is worded for
// whoever the targets are for.

const ACTIVITY_LABELS: Record<string, string> = Object.fromEntries(ACTIVITY_LEVEL_OPTIONS.map((o) => [o.value, o.label]));
const GOAL_LABELS: Record<string, string> = Object.fromEntries(NUTRITION_GOAL_OPTIONS.map((o) => [o.value, o.label]));

function Section({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card style={{ gap: 16 }}>
      <View style={styles.sectionHead}>
        <View style={{ flex: 1 }}>
          <GText variant="h3" accessibilityRole="header">
            {title}
          </GText>
          {description ? (
            <GText variant="small" tone="secondary" style={{ marginTop: 4 }}>
              {description}
            </GText>
          ) : null}
        </View>
        {action}
      </View>
      {children}
    </Card>
  );
}

function DetailsSummary({ title, value, onEdit }: { title: string; value: SetupFormState; onEdit: () => void }) {
  const goals = value.goals.map((g) => GOAL_LABELS[g] ?? g).join(', ');
  const items: Array<{ term: string; detail: string; wide?: boolean }> = [
    { term: 'Age', detail: value.ageYears },
    { term: 'Height', detail: `${value.heightCm} cm` },
    { term: 'Weight', detail: `${value.weightKg} kg` },
    { term: 'Energy estimate', detail: value.metabolicEquationSex === 'female' ? 'Female' : 'Male', wide: true },
    { term: 'Activity', detail: ACTIVITY_LABELS[value.activityLevel] ?? 'Not set', wide: true },
    { term: 'Goals', detail: goals || 'None set', wide: true },
  ];
  return (
    <Card style={{ paddingVertical: 14 }}>
      <View style={styles.sectionHead}>
        <GText variant="small" style={{ fontWeight: '700', flex: 1 }}>
          {title}
        </GText>
        <QuietButton label="Edit" accessibilityLabel={`Edit ${title.toLowerCase()}`} onPress={onEdit} />
      </View>
      <View style={styles.summaryGrid}>
        {items.map((item) => (
          <View key={item.term} style={item.wide ? styles.summaryWide : styles.summaryCell} accessible accessibilityLabel={`${item.term}: ${item.detail}`}>
            <GText variant="caption" tone="muted">
              {item.term}
            </GText>
            <GText variant="small">{item.detail}</GText>
          </View>
        ))}
      </View>
    </Card>
  );
}

function YesNoQuestion({ question, value, onChange, invalid }: { question: string; value: YesNo; onChange: (v: YesNo) => void; invalid?: boolean }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={question}>
      <GText variant="small" style={{ fontWeight: '600', marginBottom: 8 }}>
        {question}
      </GText>
      <View style={styles.yesNo}>
        {(['yes', 'no'] as const).map((option) => {
          const on = value === option;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${option === 'yes' ? 'Yes' : 'No'}: ${question}`}
              onPress={() => onChange(option)}
              style={[styles.choice, on && styles.choiceOn, invalid && !value && { borderColor: GM.errorText }]}
            >
              <View style={[styles.radio, on && { borderColor: GM.accent }]}>{on && <View style={styles.radioDot} />}</View>
              <Text style={[styles.choiceText, { color: on ? GM.text : GM.textSecondary }]}>{option === 'yes' ? 'Yes' : 'No'}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <View style={[styles.checkbox, checked && { backgroundColor: GM.accent, borderColor: GM.accent }]}>
      {checked && (
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
          <Path d="M5 12l5 5 9-10" stroke={GM.onAccent} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      )}
    </View>
  );
}

export function GuidanceSetupForm({
  person,
  value,
  onChange,
  editingDetails,
  onEditingDetails,
  highlight,
}: {
  person: GuidancePerson;
  value: SetupFormState;
  onChange: (value: SetupFormState) => void;
  editingDetails: boolean;
  onEditingDetails: (editing: boolean) => void;
  /** The section a failed check pointed at, to mark what's missing. */
  highlight?: 'details' | 'health' | 'preferences' | null;
}) {
  const words = personWords(person);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const set = <K extends keyof SetupFormState>(key: K, v: SetupFormState[K]) => onChange({ ...value, [key]: v });
  const showPrefs = prefsOpen || highlight === 'preferences';

  function toggleGoal(goal: NutritionGoal) {
    set('goals', value.goals.includes(goal) ? value.goals.filter((g) => g !== goal) : [...value.goals, goal]);
  }

  return (
    <View style={{ gap: 14 }}>
      {!editingDetails ? (
        <DetailsSummary title={words.details} value={value} onEdit={() => onEditingDetails(true)} />
      ) : (
        <Section
          title={words.about}
          description={words.aboutHint}
          action={hasRequiredDetails(value) ? <QuietButton label="Done" accessibilityLabel="Done editing details" onPress={() => onEditingDetails(false)} /> : null}
        >
          <View style={styles.threeUp}>
            <TextField
              label="Age"
              value={value.ageYears}
              onChangeText={(v) => set('ageYears', v)}
              keyboardType="number-pad"
              maxLength={3}
              style={{ flex: 1 }}
            />
            <TextField
              label="Height (cm)"
              value={value.heightCm}
              onChangeText={(v) => set('heightCm', v)}
              keyboardType="decimal-pad"
              maxLength={5}
              style={{ flex: 1 }}
            />
            <TextField
              label="Weight (kg)"
              value={value.weightKg}
              onChangeText={(v) => set('weightKg', v)}
              keyboardType="decimal-pad"
              maxLength={5}
              style={{ flex: 1 }}
            />
          </View>
          <View>
            <ChoiceChips
              label="Sex for the energy estimate"
              options={[
                { value: 'female' as const, label: 'Female' },
                { value: 'male' as const, label: 'Male' },
              ]}
              value={value.metabolicEquationSex}
              onChange={(v) => set('metabolicEquationSex', v)}
            />
            <GText variant="caption" tone="muted" style={{ marginTop: 6 }}>
              The calorie equation has separate versions for female and male bodies. It isn&apos;t used for anything else.
            </GText>
          </View>
          <SelectField
            label={words.active}
            options={ACTIVITY_LEVEL_OPTIONS.map((o) => ({ value: o.value as string, label: o.label }))}
            value={value.activityLevel}
            onChange={(v) => set('activityLevel', v)}
          />
          <View>
            <GText variant="small" style={{ fontWeight: '600', marginBottom: 8 }}>
              Goals
            </GText>
            <View style={{ gap: 8 }}>
              {NUTRITION_GOAL_OPTIONS.map((o) => {
                const on = value.goals.includes(o.value);
                return (
                  <Pressable
                    key={o.value}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`${o.label}. ${o.description}`}
                    onPress={() => toggleGoal(o.value)}
                    style={[styles.goal, on && styles.choiceOn]}
                  >
                    <Checkbox checked={on} />
                    <View style={{ flex: 1 }}>
                      <GText variant="small">{o.label}</GText>
                      <GText variant="caption" tone="muted">
                        {o.description}
                      </GText>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Section>
      )}

      <Section title="A few health questions" description={words.healthHint}>
        <YesNoQuestion
          question={words.pregnant}
          value={value.isPregnantOrBreastfeeding}
          onChange={(v) => set('isPregnantOrBreastfeeding', v)}
          invalid={highlight === 'health'}
        />
        <YesNoQuestion
          question={words.eatingDisorder}
          value={value.hasEatingDisorderHistory}
          onChange={(v) => set('hasEatingDisorderHistory', v)}
          invalid={highlight === 'health'}
        />
        <TextField
          label={words.conditions}
          value={value.conditionsOrMedications}
          onChangeText={(v) => set('conditionsOrMedications', v)}
          placeholder="Optional, in your own words"
          multiline
          maxLength={1000}
        />
      </Section>

      <Card style={{ paddingVertical: 4 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showPrefs }}
          accessibilityLabel="Meal preferences, optional"
          onPress={() => setPrefsOpen((o) => !o)}
          style={styles.prefsHead}
        >
          <Text style={styles.prefsTitle}>
            Meal preferences <Text style={{ fontWeight: '400', color: GM.textMuted }}>(optional)</Text>
          </Text>
          <Chevron direction={showPrefs ? 'up' : 'down'} />
        </Pressable>
        {showPrefs && (
          <View style={{ gap: 14, paddingBottom: 16 }}>
            <GText variant="small" tone="secondary">
              These shape future meal suggestions, never the targets.
            </GText>
            <TextField
              label="Meals a day"
              value={value.mealsPerDay}
              onChangeText={(v) => set('mealsPerDay', v)}
              keyboardType="number-pad"
              maxLength={1}
              style={{ width: 140 }}
            />
            <ChoiceChips
              label="Cooking"
              options={[
                { value: '', label: 'Not sure' },
                { value: 'full_kitchen', label: 'Full kitchen' },
                { value: 'limited', label: 'Limited' },
                { value: 'none', label: 'No cooking' },
              ]}
              value={value.cookingAccess}
              onChange={(v) => set('cookingAccess', v)}
            />
            <TextField label="Allergies" value={value.allergies} onChangeText={(v) => set('allergies', v)} placeholder="e.g. peanuts, shellfish" />
            <TextField label={words.avoided} value={value.avoidedFoods} onChangeText={(v) => set('avoidedFoods', v)} placeholder="e.g. beef, mushrooms" />
            <TextField
              label={words.cuisines}
              value={value.cuisines}
              onChangeText={(v) => set('cuisines', v)}
              placeholder="e.g. South Indian, Thai"
              hint="Separate items with commas."
            />
          </View>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10, marginTop: 4 },
  summaryCell: { width: '33.33%', paddingRight: 8 },
  summaryWide: { width: '100%' },
  threeUp: { flexDirection: 'row', gap: 10 },
  yesNo: { flexDirection: 'row', gap: 10 },
  choice: {
    flex: 1,
    minHeight: GM_TAP + 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: GM.borderStrong,
    borderRadius: 12,
  },
  choiceOn: { borderColor: GM.accent, backgroundColor: GM.accentSoft },
  choiceText: { fontSize: 15, fontWeight: '600' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: GM.textMuted, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: GM.accent },
  goal: {
    minHeight: GM_TAP + 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    borderColor: GM.borderStrong,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: GM.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  prefsHead: { minHeight: GM_TAP + 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  prefsTitle: { fontSize: 14, fontWeight: '700', color: GM.text },
});
