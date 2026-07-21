import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { Spacing } from '@/constants/theme';
import { useFoodBalanceScore } from '@/hooks/use-food-balance-score';
import { useTheme } from '@/hooks/use-theme';
import { api, type MacroKey, type MacroTargetValue, type MacroTargets } from '@/lib/api';

const MACRO_ORDER: MacroKey[] = ['calories', 'protein', 'carbs', 'fat', 'fiber'];
const MACRO_LABELS: Record<MacroKey, string> = {
  calories: 'Calories',
  protein: 'Protein',
  carbs: 'Carbs',
  fat: 'Fat',
  fiber: 'Fiber',
};

function formatValue(v: MacroTargetValue): string {
  return `${v.target.toLocaleString()} ${v.unit}/day`;
}

function formatRange(v: MacroTargetValue): string | null {
  if (v.min == null || v.max == null) return null;
  return `Recommended range: ${Math.round(v.min).toLocaleString()}–${Math.round(v.max).toLocaleString()}`;
}

function sourceLabel(v: MacroTargetValue): string {
  if (v.source === 'tistra_recommended') return 'Tistra recommended';
  if (v.source === 'coach_custom') return 'Coach custom';
  return 'Custom';
}

/** Ported from the main web app's NutritionTargetsCard.tsx — full macro
 * targets (calories/protein/carbs/fat/fiber) expanding the old protein-only
 * card, editable and resettable. Reuses useFoodBalanceScore's fetch (same
 * /food-balance-score response now also carries recommendedMacroTargets/
 * activeMacroTargets) rather than a second network round trip. */
export function NutritionTargetsCard(params: { contactId: string } | { clientId: string }) {
  const theme = useTheme();
  const { result, loading, refetch } = useFoodBalanceScore(params);
  const [editing, setEditing] = useState(false);

  if (loading) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={theme.primary} />
          <ThemedText type="small" themeColor="textSecondary">
            Loading your nutrition targets…
          </ThemedText>
        </View>
      </ThemedView>
    );
  }
  if (!result?.activeMacroTargets || !result.recommendedMacroTargets) return null;

  const { activeMacroTargets: active, recommendedMacroTargets: recommended } = result;
  const isCustomized = MACRO_ORDER.some((key) => active[key].source !== 'tistra_recommended');

  async function resetTargets() {
    await api.resetMacroTargets(params);
    refetch();
  }

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">Your nutrition targets</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
        Tistra suggests starting targets based on your body, goals, and food profile. You can adjust them anytime.
      </ThemedText>

      {recommended.isProfileIncomplete && (
        <View style={[styles.noticeBox, { backgroundColor: '#FEF3C7' }]}>
          <ThemedText type="small" style={{ color: '#92400E' }}>
            Complete your profile (weight, height, age, gender) for more accurate targets.
          </ThemedText>
        </View>
      )}

      <ThemedText type="small" themeColor="textSecondary" style={styles.explanation}>
        {active.explanation}
      </ThemedText>

      <View style={styles.list}>
        {MACRO_ORDER.map((key) => {
          const v = active[key];
          const range = formatRange(v);
          return (
            <View key={key} style={[styles.row, { borderColor: theme.backgroundSelected }]}>
              <View style={styles.rowText}>
                <ThemedText type="smallBold">{MACRO_LABELS[key]}</ThemedText>
                <ThemedText type="small">{formatValue(v)}</ThemedText>
                {range && (
                  <ThemedText type="small" themeColor="textSecondary">
                    {range}
                  </ThemedText>
                )}
              </View>
              <View
                style={[
                  styles.sourceBadge,
                  { backgroundColor: v.source === 'tistra_recommended' ? theme.backgroundSelected : '#EDE9F7' },
                ]}
              >
                <ThemedText type="small" style={{ color: v.source === 'tistra_recommended' ? theme.textSecondary : '#6750A4' }}>
                  {sourceLabel(v)}
                </ThemedText>
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.actions}>
        <Pressable style={[styles.actionButton, { borderColor: theme.backgroundSelected }]} onPress={() => setEditing(true)}>
          <ThemedText type="small">Edit targets</ThemedText>
        </Pressable>
        {isCustomized && (
          <Pressable style={[styles.actionButton, { borderColor: theme.backgroundSelected }]} onPress={resetTargets}>
            <ThemedText type="small" themeColor="textSecondary">
              Reset to Tistra recommendation
            </ThemedText>
          </Pressable>
        )}
      </View>

      <ThemedText type="small" themeColor="textSecondary" style={styles.disclaimer}>
        These are general wellness targets, not medical advice. If you have a medical condition or prescribed diet, follow your clinician&rsquo;s guidance.
      </ThemedText>

      {editing && (
        <EditTargetsModal
          active={active}
          params={params}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            refetch();
          }}
        />
      )}
    </ThemedView>
  );
}

function EditTargetsModal({
  active,
  params,
  onClose,
  onSaved,
}: {
  active: MacroTargets;
  params: { contactId: string } | { clientId: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const theme = useTheme();
  const [values, setValues] = useState<Record<MacroKey, string>>({
    calories: String(active.calories.target),
    protein: String(active.protein.target),
    carbs: String(active.carbs.target),
    fat: String(active.fat.target),
    fiber: String(active.fiber.target),
  });
  const [saving, setSaving] = useState(false);

  const numeric = Object.fromEntries(MACRO_ORDER.map((k) => [k, Number(values[k])])) as Record<MacroKey, number>;
  const impliedCalories = numeric.protein * 4 + numeric.carbs * 4 + numeric.fat * 9;
  const mismatch = numeric.calories > 0 && Math.abs(impliedCalories - numeric.calories) > numeric.calories * 0.15;
  const hasInvalid = MACRO_ORDER.some((k) => !(numeric[k] >= 0));

  async function handleSave() {
    setSaving(true);
    try {
      const targets: Partial<Record<MacroKey, { min: number | null; target: number; max: number | null }>> = {};
      for (const key of MACRO_ORDER) targets[key] = { min: null, target: numeric[key], max: null };
      await api.saveMacroTargets(params, targets);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setSaving(true);
    try {
      await api.resetMacroTargets(params);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={[styles.modalCard, { backgroundColor: theme.backgroundElement }]} onPress={(e) => e.stopPropagation()}>
          <ThemedText type="smallBold">Edit targets</ThemedText>

          <View style={styles.modalFields}>
            {MACRO_ORDER.map((key) => (
              <View key={key} style={styles.modalField}>
                <ThemedText type="small" themeColor="textSecondary">
                  {MACRO_LABELS[key]} ({key === 'calories' ? 'kcal' : 'g'})
                </ThemedText>
                <TextInput
                  value={values[key]}
                  onChangeText={(t) => setValues((v) => ({ ...v, [key]: t }))}
                  keyboardType="numeric"
                  style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                />
              </View>
            ))}
          </View>

          {mismatch && (
            <View style={[styles.noticeBox, { backgroundColor: '#FEF3C7' }]}>
              <ThemedText type="small" style={{ color: '#92400E' }}>
                These macros don&rsquo;t fully match your calorie target. You can still save them, but Tistra&rsquo;s summaries may look less consistent.
              </ThemedText>
            </View>
          )}

          <View style={styles.modalActions}>
            <Pressable
              style={[styles.modalSaveButton, { backgroundColor: theme.primary, opacity: saving || hasInvalid ? 0.5 : 1 }]}
              onPress={handleSave}
              disabled={saving || hasInvalid}
            >
              <ThemedText type="small" style={{ color: '#fff', fontWeight: '700' }}>
                Save targets
              </ThemedText>
            </Pressable>
            <Pressable style={[styles.modalSecondaryButton, { borderColor: theme.backgroundSelected }]} onPress={handleReset} disabled={saving}>
              <ThemedText type="small">Reset</ThemedText>
            </Pressable>
            <Pressable onPress={onClose} disabled={saving}>
              <ThemedText type="small" themeColor="textSecondary">
                Cancel
              </ThemedText>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.three, padding: Spacing.three },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  subtitle: { marginTop: Spacing.one, marginBottom: Spacing.two },
  noticeBox: { borderRadius: Spacing.two, padding: Spacing.two, marginBottom: Spacing.two },
  explanation: { marginBottom: Spacing.two },
  list: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: Spacing.two, padding: Spacing.two, gap: Spacing.two },
  rowText: { flex: 1, gap: 2 },
  sourceBadge: { borderRadius: Spacing.four, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three },
  actionButton: { borderWidth: 1, borderRadius: Spacing.two, paddingVertical: Spacing.one + 2, paddingHorizontal: Spacing.two },
  disclaimer: { marginTop: Spacing.three },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: Spacing.three },
  modalCard: { borderRadius: Spacing.three, padding: Spacing.three, width: '100%', maxWidth: 360 },
  modalFields: { gap: Spacing.two, marginTop: Spacing.two },
  modalField: { gap: Spacing.half },
  input: { borderWidth: 1, borderRadius: Spacing.two, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  modalActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.three },
  modalSaveButton: { flex: 1, borderRadius: Spacing.two, paddingVertical: Spacing.two, alignItems: 'center' },
  modalSecondaryButton: { borderWidth: 1, borderRadius: Spacing.two, paddingVertical: Spacing.two, paddingHorizontal: Spacing.two },
});
