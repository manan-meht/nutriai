import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';
import { api } from '@/lib/api';
import { NutritionGoalFields, EMPTY_NUTRITION_GOAL_FIELDS, type NutritionGoalFieldsValue } from './nutrition-goal-fields';

const RELATIONSHIPS = ['Son', 'Daughter', 'Spouse', 'Parent', 'Sibling', 'Friend', 'Other'];
const PRIMARY = '#5715CE';
const ERROR_COLOR = '#D92D20';

const DEFAULT_REMINDER_TIMES: [string, string, string] = ['08:00', '12:00', '19:00'];

export interface PersonFormInitialValues {
  fullName?: string;
  relationship?: string;
  age?: string;
  gender?: string;
  weightKg?: string;
  heightCm?: string;
  goalFields?: NutritionGoalFieldsValue;
  /** adults-only — gym_clients has no reminders columns. */
  remindersEnabled?: boolean;
  reminderTimes?: [string, string, string];
}

interface PersonFormProps {
  /** "adults" posts/patches to /adults/contacts; "gym" to /gym/clients.
   * Only "adults" shows the relationship field (gym clients don't have
   * one). */
  product: 'adults' | 'gym';
  mode: 'add' | 'edit';
  personId?: string;
  initialValues?: PersonFormInitialValues;
  /** Hides the "Myself" relationship option — passed by the caller once it
   * already has the contacts list loaded (see adults/add.tsx). Ignored
   * for product="gym". */
  hasSelfContact?: boolean;
  onSuccess: () => void;
}

// Ported from nutriai-fresh's old apps/mobile/src/components/PersonForm.tsx
// (see git history) — shared by the add/edit screens for both products,
// mirrors AddContactModal/EditContactModal/AddClientModal/EditClientModal
// on the web app, collapsed into one RN component since the fields are
// otherwise identical.
export function PersonForm({ product, mode, personId, initialValues, hasSelfContact, onSuccess }: PersonFormProps) {
  const theme = useTheme();
  const [fullName, setFullName] = useState(initialValues?.fullName ?? '');
  const [countryCode, setCountryCode] = useState('91');
  const [whatsapp, setWhatsapp] = useState('');
  const [relationship, setRelationship] = useState(initialValues?.relationship ?? '');
  const [age, setAge] = useState(initialValues?.age ?? '');
  const [gender, setGender] = useState(initialValues?.gender ?? '');
  const [weightKg, setWeightKg] = useState(initialValues?.weightKg ?? '');
  const [heightCm, setHeightCm] = useState(initialValues?.heightCm ?? '');
  const [goalFields, setGoalFields] = useState<NutritionGoalFieldsValue>(initialValues?.goalFields ?? EMPTY_NUTRITION_GOAL_FIELDS);
  const [remindersEnabled, setRemindersEnabled] = useState(initialValues?.remindersEnabled ?? false);
  const [reminderTimes, setReminderTimes] = useState<[string, string, string]>(
    initialValues?.reminderTimes ?? DEFAULT_REMINDER_TIMES
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      const isSelf = product === 'adults' && relationship === 'self';
      const body: Record<string, unknown> = {
        fullName,
        age: age ? parseInt(age, 10) : undefined,
        gender: gender || undefined,
        weightKg: weightKg ? parseFloat(weightKg) : undefined,
        heightCm: heightCm ? parseFloat(heightCm) : undefined,
        primaryNutritionGoal: goalFields.primaryNutritionGoal || undefined,
        dateOfBirth: goalFields.dateOfBirth || undefined,
        metabolicEquationSex: goalFields.metabolicEquationSex || undefined,
        activityLevel: goalFields.activityLevel || undefined,
        resistanceTrainingStatus: goalFields.resistanceTrainingStatus || undefined,
        targetWeightKg: goalFields.targetWeightKg ? parseFloat(goalFields.targetWeightKg) : undefined,
      };
      if (product === 'adults') {
        body.relationship = isSelf ? undefined : relationship || undefined;
        body.relationshipType = isSelf ? 'self' : undefined;
        body.remindersEnabled = remindersEnabled;
        body.reminderTimes = remindersEnabled ? reminderTimes : undefined;
      }

      if (mode === 'add') {
        body.whatsappNumber = `+${countryCode}${whatsapp.replace(/\D/g, '')}`;
        if (product === 'adults') {
          await api.createAdultsContact(body);
        } else {
          await api.createGymClient(body);
        }
      } else if (product === 'adults') {
        await api.updateAdultsContact(personId!, body);
      } else {
        await api.updateGymClient(personId!, body);
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={[styles.sectionTitle, { color: PRIMARY }]}>{product === 'adults' ? 'About them' : 'Client details'}</Text>
      <Field label="Full name" color={theme.textSecondary}>
        <TextInput
          value={fullName}
          onChangeText={setFullName}
          placeholder="Full name"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />
      </Field>

      {product === 'adults' && (
        <Field label="Relationship" color={theme.textSecondary}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {!hasSelfContact && mode === 'add' && (
              <Chip label="Myself" active={relationship === 'self'} onPress={() => setRelationship('self')} theme={theme} />
            )}
            {RELATIONSHIPS.map((r) => (
              <Chip
                key={r}
                label={r}
                active={relationship === r.toLowerCase()}
                onPress={() => setRelationship(r.toLowerCase())}
                theme={theme}
              />
            ))}
          </ScrollView>
        </Field>
      )}

      {mode === 'add' && (
        <Field label="WhatsApp number" color={theme.textSecondary}>
          <View style={styles.phoneRow}>
            <View style={[styles.countryCodeBox, { borderColor: theme.backgroundSelected, backgroundColor: theme.backgroundElement }]}>
              <Text style={{ color: theme.textSecondary, fontSize: 14 }}>+</Text>
              <TextInput
                value={countryCode}
                onChangeText={(t) => setCountryCode(t.replace(/\D/g, ''))}
                maxLength={4}
                style={{ width: 32, fontSize: 14, color: theme.text, padding: 8 }}
              />
            </View>
            <TextInput
              value={whatsapp}
              onChangeText={(t) => setWhatsapp(t.replace(/\D/g, ''))}
              placeholder="98765 43210"
              placeholderTextColor={theme.textSecondary}
              keyboardType="phone-pad"
              style={[styles.input, { flex: 1, color: theme.text, borderColor: theme.backgroundSelected }]}
            />
          </View>
        </Field>
      )}

      <View style={styles.row}>
        <View style={styles.half}>
          <Field label="Age" color={theme.textSecondary}>
            <TextInput
              value={age}
              onChangeText={setAge}
              placeholder="35"
              placeholderTextColor={theme.textSecondary}
              keyboardType="numeric"
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />
          </Field>
        </View>
        <View style={styles.half}>
          <Field label="Gender" color={theme.textSecondary}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {['male', 'female', 'other'].map((g) => (
                <Chip
                  key={g}
                  label={g.charAt(0).toUpperCase() + g.slice(1)}
                  active={gender === g}
                  onPress={() => setGender(g)}
                  theme={theme}
                />
              ))}
            </ScrollView>
          </Field>
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.half}>
          <Field label="Weight (kg)" color={theme.textSecondary}>
            <TextInput
              value={weightKg}
              onChangeText={setWeightKg}
              placeholder="70"
              placeholderTextColor={theme.textSecondary}
              keyboardType="numeric"
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />
          </Field>
        </View>
        <View style={styles.half}>
          <Field label="Height (cm)" color={theme.textSecondary}>
            <TextInput
              value={heightCm}
              onChangeText={setHeightCm}
              placeholder="170"
              placeholderTextColor={theme.textSecondary}
              keyboardType="numeric"
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />
          </Field>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />

      <NutritionGoalFields value={goalFields} onChange={setGoalFields} />

      {product === 'adults' && (
        <>
          <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />
          <Text style={[styles.sectionTitle, { color: PRIMARY }]}>WhatsApp reminders</Text>
          <Pressable
            style={styles.reminderToggleRow}
            onPress={() => setRemindersEnabled(!remindersEnabled)}
          >
            <View
              style={[
                styles.checkbox,
                { borderColor: theme.backgroundSelected },
                remindersEnabled && { backgroundColor: PRIMARY, borderColor: PRIMARY },
              ]}
            >
              {remindersEnabled && <Text style={styles.checkboxMark}>✓</Text>}
            </View>
            <Text style={{ color: theme.text, fontSize: 14 }}>Send meal reminders on WhatsApp</Text>
          </Pressable>
          {remindersEnabled && (
            <View style={styles.row}>
              {(['Morning', 'Midday', 'Evening'] as const).map((label, i) => (
                <View key={label} style={styles.third}>
                  <Field label={label} color={theme.textSecondary}>
                    <TextInput
                      value={reminderTimes[i]}
                      onChangeText={(t) => {
                        const next = [...reminderTimes] as [string, string, string];
                        next[i] = t;
                        setReminderTimes(next);
                      }}
                      placeholder="HH:MM"
                      placeholderTextColor={theme.textSecondary}
                      style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                    />
                  </Field>
                </View>
              ))}
            </View>
          )}
          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            24-hour format (e.g. 08:00), in their local timezone. Defaults to 8am, 12pm, and 7pm.
          </Text>
        </>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={[styles.submitButton, (loading || !fullName.trim()) && styles.disabled]} onPress={handleSubmit} disabled={loading || !fullName.trim()}>
        {loading ? <ActivityIndicator color="#fff" /> : (
          <Text style={styles.submitButtonText}>{mode === 'add' ? 'Add' : 'Save'}</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

function Field({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color }]}>{label}</Text>
      {children}
    </View>
  );
}

function Chip({
  label, active, onPress, theme,
}: { label: string; active: boolean; onPress: () => void; theme: { textSecondary: string; backgroundSelected: string; background: string } }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: theme.backgroundSelected, backgroundColor: theme.background },
        active && { backgroundColor: PRIMARY, borderColor: PRIMARY },
      ]}
    >
      <Text style={[{ fontSize: 13, fontWeight: '500', color: theme.textSecondary }, active && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48 },
  sectionTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 },
  field: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '500', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: 12,
    fontSize: 14,
  },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  third: { flex: 1 },
  reminderToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxMark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  hint: { fontSize: 12, marginTop: -4, marginBottom: 4 },
  phoneRow: { flexDirection: 'row', gap: 8 },
  countryCodeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: 10,
  },
  chipRow: { gap: 8, paddingVertical: 2 },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  divider: { height: 1, marginVertical: 8 },
  error: { color: ERROR_COLOR, marginTop: 16, fontSize: 13 },
  submitButton: {
    backgroundColor: PRIMARY,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  disabled: { opacity: 0.6 },
  submitButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
