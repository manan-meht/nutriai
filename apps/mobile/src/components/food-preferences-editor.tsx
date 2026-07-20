import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, type DietaryProfile, type FoodPreferenceSelections } from '@/lib/api';

const OPTIONS: Array<{ key: keyof FoodPreferenceSelections; label: string; isChecked: (p: DietaryProfile) => boolean }> = [
  { key: 'prefersPlantBasedSuggestions', label: 'I prefer plant-based suggestions', isChecked: (p) => p.prefers_plant_based_suggestions },
  { key: 'eatsVegetarian', label: 'I eat vegetarian food', isChecked: (p) => p.explicit_vegetarian },
  { key: 'eatsEggs', label: 'I eat eggs', isChecked: (p) => p.observed_eggs && !p.explicit_avoids_eggs },
  { key: 'eatsChicken', label: 'I eat chicken', isChecked: (p) => p.observed_chicken && !p.explicit_avoids_chicken },
  { key: 'eatsFishOrSeafood', label: 'I eat fish or seafood', isChecked: (p) => p.observed_fish && !p.explicit_avoids_fish },
  { key: 'eatsRedMeat', label: 'I eat red meat', isChecked: (p) => p.observed_red_meat && !p.explicit_avoids_red_meat },
  { key: 'avoidsDairy', label: 'I avoid dairy', isChecked: (p) => p.explicit_avoids_dairy },
  { key: 'avoidsLactose', label: 'I avoid lactose', isChecked: (p) => p.explicit_avoids_lactose },
  { key: 'avoidsPork', label: 'I avoid pork', isChecked: (p) => p.explicit_avoids_pork },
];

/** Mirrors the main web app's FoodPreferencesEditor.tsx — adults-only (no
 * gym equivalent on web either), auto-saves each toggle individually
 * (partial patch via updateAdultsFoodPreferences) rather than a Save
 * button, same as web. Fetches its own initial profile (rather than
 * requiring the caller to pre-fetch), same self-contained-fetch
 * convention as FoodBalanceScoreCard. */
export function FoodPreferencesEditor({ contactId }: { contactId: string }) {
  const theme = useTheme();
  const [profile, setProfile] = useState<DietaryProfile | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getAdultsFoodPreferences(contactId)
      .then((data) => !cancelled && setProfile(data))
      .catch(() => !cancelled && setError("Couldn't load food preferences."));
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  async function toggle(key: keyof FoodPreferenceSelections, nextChecked: boolean) {
    if (!profile) return;
    setError(null);
    setSavingKey(key);
    const previous = profile;
    // Optimistic update, same as web — the field-specific isChecked
    // functions derive the new displayed state locally rather than
    // waiting on a round-trip.
    try {
      await api.updateAdultsFoodPreferences(contactId, { [key]: nextChecked });
      const refreshed = await api.getAdultsFoodPreferences(contactId);
      setProfile(refreshed);
    } catch {
      setProfile(previous);
      setError("Couldn't save — please try again.");
    } finally {
      setSavingKey(null);
    }
  }

  if (!profile) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">Food preferences</ThemedText>
        <ActivityIndicator style={styles.loading} />
      </ThemedView>
    );
  }

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">Food preferences</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
        Tistra learns from the meals you log, but you can change these preferences anytime.
      </ThemedText>

      <View style={styles.list}>
        {OPTIONS.map((option) => {
          const checked = option.isChecked(profile);
          const saving = savingKey === option.key;
          return (
            <Pressable
              key={option.key}
              onPress={() => toggle(option.key, !checked)}
              disabled={saving}
              style={[styles.row, { opacity: saving ? 0.5 : 1 }]}
            >
              <View style={[styles.checkbox, { borderColor: theme.backgroundSelected }, checked && { borderColor: theme.primary, backgroundColor: theme.primary }]}>
                {checked && <ThemedText style={styles.checkmark}>✓</ThemedText>}
              </View>
              <ThemedText type="small" style={styles.rowLabel}>
                {option.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {error && (
        <ThemedText type="small" style={styles.error}>
          {error}
        </ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.three, padding: Spacing.three },
  loading: { marginTop: Spacing.two },
  subtitle: { marginTop: Spacing.one, marginBottom: Spacing.two },
  list: { gap: Spacing.two, marginTop: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '700', lineHeight: 15 },
  rowLabel: { flex: 1 },
  error: { color: '#B3261E', marginTop: Spacing.two },
});
