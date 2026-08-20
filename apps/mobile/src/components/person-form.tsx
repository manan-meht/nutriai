import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';
import { api, type FoodPreferenceSelections } from '@/lib/api';
import { NutritionGoalFields, EMPTY_NUTRITION_GOAL_FIELDS, type NutritionGoalFieldsValue } from './nutrition-goal-fields';
import { NutritionTargetsCard } from './nutrition-targets-card';
import { FoodPreferencesEditor } from './food-preferences-editor';

const RELATIONSHIPS = ['Son', 'Daughter', 'Spouse', 'Parent', 'Sibling', 'Friend', 'Other'];
const PRIMARY = '#5715CE';
const ERROR_COLOR = '#D92D20';

const DEFAULT_REMINDER_TIMES: [string, string, string] = ['08:00', '12:00', '19:00'];

/** Sign-up food-preference options with neutral (third-person-safe) labels
 * — FoodPreferencesEditor's "I am vegan" copy reads wrong when a caregiver
 * is adding someone else. Keys map 1:1 onto FoodPreferenceSelections and
 * save through the exact same updateAdultsFoodPreferences endpoint the
 * editor uses, so an add-time choice and a later edit are equivalent. */
const ADD_FOOD_PREFERENCE_OPTIONS: Array<{ key: keyof FoodPreferenceSelections; label: string }> = [
  { key: 'isVegan', label: 'Vegan' },
  { key: 'eatsVegetarian', label: 'Vegetarian' },
  { key: 'eatsEggs', label: 'Eats eggs' },
  { key: 'eatsChicken', label: 'Eats chicken' },
  { key: 'eatsFishOrSeafood', label: 'Eats fish or seafood' },
  { key: 'eatsRedMeat', label: 'Eats red meat' },
  { key: 'avoidsDairy', label: 'Avoids dairy' },
  { key: 'avoidsLactose', label: 'Avoids lactose' },
  { key: 'avoidsPork', label: 'Avoids pork' },
];

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
  /** Only 'adults' remains: coaching left this app with its own product. */
  product: 'adults';
  mode: 'add' | 'edit';
  personId?: string;
  initialValues?: PersonFormInitialValues;
  /** Hides the "Myself" relationship option — passed by the caller once it
   * already has the contacts list loaded (see adults/add.tsx). Ignored
   * for a coaching client. */
  hasSelfContact?: boolean;
  /** "self" vs "family" — passed by the caller (see adults/add.tsx). A
   * "self" plan workspace only ever has one contact (the caregiver's own
   * tracked profile), so the relationship picker is skipped entirely and
   * relationship_type is forced to "self" rather than asking a question
   * with only one possible answer. Ignored for
   * mode="edit" (relationship never changes after creation). */
  workspacePlan?: string | null;
  /** Passed the newly-created contact's id/name/isSelf only for
   * product="adults" mode="add" (so the caller can offer to send the
   * WhatsApp invite right away — see adults/add.tsx) — undefined for every
   * other case. Always populated now, including a "Myself" pick: that
   * contact still needs its own WhatsApp number connected, whether it's a
   * self-plan workspace's only contact or "Myself" within an otherwise
   * multi-member family plan — the two are the same real situation (the
   * caregiver connecting their own number) and get the same invite
   * screen/message. `isSelf` lets the caller show self-specific copy
   * there. */
  onSuccess: (created?: { id: string; fullName: string; isSelf: boolean }) => void;
}

// Ported from nutriai-fresh's old apps/mobile/src/components/PersonForm.tsx
// (see git history) — shared by the add/edit screens for both products,
// mirrors AddContactModal/EditContactModal/AddClientModal/EditClientModal
// on the web app, collapsed into one RN component since the fields are
// otherwise identical.
export function PersonForm({ product, mode, personId, initialValues, hasSelfContact, workspacePlan, onSuccess }: PersonFormProps) {
  const theme = useTheme();
  const isSelfPlan = product === 'adults' && mode === 'add' && workspacePlan === 'self';
  const [fullName, setFullName] = useState(initialValues?.fullName ?? '');
  const [countryCode, setCountryCode] = useState('91');
  const [whatsapp, setWhatsapp] = useState('');
  const [relationship, setRelationship] = useState(isSelfPlan ? 'self' : initialValues?.relationship ?? '');
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
  const [targetsExpanded, setTargetsExpanded] = useState(false);
  const [foodPrefsExpanded, setFoodPrefsExpanded] = useState(false);
  /** Add-mode only (adults): selections saved right after the contact is
   * created, via the same endpoint the edit-mode FoodPreferencesEditor
   * uses (which needs an existing contactId, so it can't render here). */
  const [addFoodPrefs, setAddFoodPrefs] = useState<FoodPreferenceSelections>({});

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
        nutritionGoals: goalFields.nutritionGoals,
        dailyMovementLevel: goalFields.dailyMovementLevel || undefined,
        weeklyModerateActivity: goalFields.weeklyModerateActivity || undefined,
        strengthExerciseFrequency: goalFields.strengthExerciseFrequency || undefined,
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
          const created = await api.createAdultsContact(body);
          // Best-effort: the contact exists either way and preferences stay
          // editable from the edit screen — never fail the add over this.
          if (Object.keys(addFoodPrefs).length > 0) {
            try {
              await api.updateAdultsFoodPreferences(created.id, addFoodPrefs);
            } catch (prefErr) {
              console.warn('[person-form] saving food preferences failed:', prefErr);
            }
          }
          onSuccess({ id: created.id, fullName, isSelf });
          return;
        }
      } else {
        await api.updateAdultsContact(personId!, body);
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  // "About them" is wrong once "Myself" is selected — matches the person
  // this section is actually about, same personalization pattern as
  // NutritionGoalFields' personDisplay.
  /** Relationship drives relationship_type, which decides whether the
   * dashboard treats this person as the account holder or as someone to
   * invite. Blank silently meant "family_caregiver", which is how a user
   * ended up being asked to WhatsApp her own number.
   *
   * Enforced on add only: contacts created before this may have none, and
   * blocking an unrelated edit in order to fix that would be worse than
   * leaving it. The Relationship picker is still shown when editing. */
  const missingRelationship =
    product === 'adults' && !isSelfPlan && mode === 'add' && !relationship;

  const isSelfRelationship = product === 'adults' && relationship === 'self';
  const aboutSectionTitle = isSelfRelationship
    ? 'About you'
    : fullName.trim()
      ? `About ${fullName.trim().split(' ')[0]}`
      : 'About them';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={[styles.sectionTitle, { color: PRIMARY }]}>{aboutSectionTitle}</Text>
      <Field label="Full name" color={theme.textSecondary}>
        <TextInput
          value={fullName}
          onChangeText={setFullName}
          placeholder="Full name"
          placeholderTextColor={theme.placeholder}
          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />
      </Field>

      {product === 'adults' && !isSelfPlan && (
        <Field label="Relationship" color={theme.textSecondary} required={mode === 'add'}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {(!hasSelfContact || relationship === 'self') && (
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
                keyboardType="number-pad"
                maxLength={4}
                style={{ width: 48, fontSize: 14, color: theme.text, padding: 8 }}
              />
            </View>
            <TextInput
              value={whatsapp}
              onChangeText={(t) => setWhatsapp(t.replace(/\D/g, ''))}
              placeholder="98765 43210"
              placeholderTextColor={theme.placeholder}
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
              placeholderTextColor={theme.placeholder}
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
              placeholderTextColor={theme.placeholder}
              keyboardType="numeric"
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />
          </Field>
        </View>
        <View style={styles.half}>
          <Field label="Target weight (kg)" color={theme.textSecondary}>
            <TextInput
              value={goalFields.targetWeightKg}
              onChangeText={(t) => setGoalFields({ ...goalFields, targetWeightKg: t })}
              placeholder="65"
              placeholderTextColor={theme.placeholder}
              keyboardType="numeric"
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />
          </Field>
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.half}>
          <Field label="Height (cm)" color={theme.textSecondary}>
            <TextInput
              value={heightCm}
              onChangeText={setHeightCm}
              placeholder="170"
              placeholderTextColor={theme.placeholder}
              keyboardType="numeric"
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />
          </Field>
        </View>
        <View style={styles.half} />
      </View>

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
                      placeholderTextColor={theme.placeholder}
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

      <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />

      <NutritionGoalFields
        value={goalFields}
        onChange={setGoalFields}
        hideTargetWeight
        personDisplay={
          product === 'adults' && relationship === 'self'
            ? { type: 'self' }
            : fullName.trim()
              ? { type: 'name', name: fullName.trim().split(' ')[0] }
              : { type: 'they' }
        }
      />

      {mode === 'edit' && personId && (
        <>
          <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />
          <Pressable style={styles.targetsToggleRow} onPress={() => setTargetsExpanded((v) => !v)}>
            <Text style={[styles.sectionTitle, { color: PRIMARY }]}>Nutrition targets</Text>
            <Text style={{ color: theme.textSecondary }}>{targetsExpanded ? '▲' : '▼'}</Text>
          </Pressable>
          {/* Always mounted (not gated behind targetsExpanded) so its fetch
              — a live Food Balance Score + macro-target computation, not a
              simple read — starts as soon as this screen opens rather than
              only once the user taps to expand it. See the web app's
              EditContactModal for the same change. */}
          <View style={[styles.targetsContent, !targetsExpanded && styles.hidden]}>
            <NutritionTargetsCard contactId={personId} />
          </View>

          {/* Adults-only, mirrors the web app's EditContactModal — Food
              preferences' permanent home once the user has interacted
              with it once (see person-detail.tsx's own comment). */}
          {product === 'adults' && (
            <>
              <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />
              <Pressable style={styles.targetsToggleRow} onPress={() => setFoodPrefsExpanded((v) => !v)}>
                <Text style={[styles.sectionTitle, { color: PRIMARY }]}>Food preferences</Text>
                <Text style={{ color: theme.textSecondary }}>{foodPrefsExpanded ? '▲' : '▼'}</Text>
              </Pressable>
              {foodPrefsExpanded && (
                <View style={styles.targetsContent}>
                  <FoodPreferencesEditor contactId={personId} />
                </View>
              )}
            </>
          )}
        </>
      )}

      {/* Sign-up-only food preferences (edit mode has the full
          FoodPreferencesEditor above, which needs an existing contactId). */}
      {product === 'adults' && mode === 'add' && (
        <>
          <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />
          <Text style={[styles.sectionTitle, { color: PRIMARY }]}>Food preferences</Text>
          <Text style={{ color: theme.textSecondary, fontSize: 12, marginBottom: 12 }}>
            What kind of foods {relationship === 'self' ? 'do you' : fullName.trim() ? `does ${fullName.trim().split(' ')[0]}` : 'do they'} eat? Optional — keeps meal suggestions relevant.
          </Text>
          {ADD_FOOD_PREFERENCE_OPTIONS.map((option) => {
            const checked = !!addFoodPrefs[option.key];
            return (
              <Pressable
                key={option.key}
                onPress={() => setAddFoodPrefs({ ...addFoodPrefs, [option.key]: !checked })}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9 }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
              >
                <View
                  style={{
                    width: 20, height: 20, borderRadius: 5, borderWidth: 2, marginRight: 10,
                    alignItems: 'center', justifyContent: 'center',
                    borderColor: checked ? PRIMARY : theme.backgroundSelected,
                    backgroundColor: checked ? PRIMARY : 'transparent',
                  }}
                >
                  {checked && <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>✓</Text>}
                </View>
                <Text style={{ color: theme.text, fontSize: 14 }}>{option.label}</Text>
              </Pressable>
            );
          })}
        </>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.submitButton, (loading || !fullName.trim() || missingRelationship) && styles.disabled]}
        onPress={handleSubmit}
        disabled={loading || !fullName.trim() || missingRelationship}
      >
        {loading ? <ActivityIndicator color="#fff" /> : (
          <Text style={styles.submitButtonText}>{mode === 'add' ? 'Add' : 'Save'}</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

function Field({ label, color, required, children }: { label: string; color: string; required?: boolean; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color }]}>
        {label}
        {required ? <Text style={styles.fieldRequired}> *</Text> : null}
      </Text>
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
  targetsToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  targetsContent: { marginTop: 12 },
  hidden: { height: 0, opacity: 0, overflow: 'hidden' },
  field: { marginBottom: 16 },
  fieldRequired: { color: '#EF4444' },
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
