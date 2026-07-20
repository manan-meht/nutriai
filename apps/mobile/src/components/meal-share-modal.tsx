import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import type { MealShareData } from '@/lib/meal-share/types';
import {
  deriveMealShareCategories,
  suggestOverlayTexts,
  shuffleOverlayTexts,
  type ShareOverlayAudience,
  type ShareOverlayTextCategory,
} from '@/lib/meal-share/overlay-text';
import { trackShareOverlayTextEvent } from '@/lib/meal-share/analytics';
import { shareCardView } from '@/lib/share-cards/export';
import { MealSharePreview } from './meal-share-preview';
import { useTheme } from '@/hooks/use-theme';

const CATEGORY_TABS: Array<{ key: 'suggested' | ShareOverlayTextCategory | 'custom'; label: string }> = [
  { key: 'suggested', label: 'Suggested' },
  { key: 'protein', label: 'Protein' },
  { key: 'balanced_meal', label: 'Balanced' },
  { key: 'fiber_veg', label: 'Fiber' },
  { key: 'funny', label: 'Funny' },
  { key: 'custom', label: 'Custom' },
];

/** Mirrors the main web app's MealShareModal.tsx — "Share this meal" plus
 * the "Enhance photo" toggle and a caption picker (see
 * @/lib/meal-share/overlay-text.ts) reusing the same native-share capture
 * helper share-cards/export.ts uses. */
export function MealShareModal({
  meal,
  visible,
  onClose,
  audience = 'self',
  relationship,
}: {
  meal: MealShareData | null;
  visible: boolean;
  onClose: () => void;
  audience?: ShareOverlayAudience;
  relationship?: string;
}) {
  const theme = useTheme();
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [enhanced, setEnhanced] = useState(true);
  const [activeTab, setActiveTab] = useState<(typeof CATEGORY_TABS)[number]['key']>('suggested');
  const [customText, setCustomText] = useState('');
  const [pickerExpanded, setPickerExpanded] = useState(false);

  const mealType = meal && ['breakfast', 'lunch', 'dinner', 'snack'].includes(meal.mealType)
    ? (meal.mealType as 'breakfast' | 'lunch' | 'dinner' | 'snack')
    : 'unknown';
  const derivedCategories = useMemo(() => (meal ? deriveMealShareCategories(meal) : []), [meal]);

  const [suggestions, setSuggestions] = useState(() =>
    meal ? suggestOverlayTexts({ mealType, categories: derivedCategories, audience, relationship }, 8) : []
  );

  // The single highest-relevance suggestion is applied immediately — "Show
  // other captions" below reveals the full tab/shuffle/custom picker.
  const topSuggestion = suggestions[0] ?? null;
  const [selected, setSelected] = useState<{ id: string; text: string } | null>(
    topSuggestion ? { id: topSuggestion.id, text: topSuggestion.text } : null
  );

  useEffect(() => {
    if (topSuggestion) {
      trackShareOverlayTextEvent('share_overlay_text_selected', {
        text_id: topSuggestion.id,
        category: topSuggestion.category,
        meal_type: mealType,
        audience,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once for the auto-applied top suggestion, not on every re-render
  }, []);

  if (!meal) return null;

  const visibleSuggestions =
    activeTab === 'suggested' || activeTab === 'custom'
      ? suggestions
      : suggestOverlayTexts({ mealType, categories: [activeTab], audience, relationship }, 8);

  function handleShuffle() {
    const categories = activeTab === 'suggested' || activeTab === 'custom' ? derivedCategories : [activeTab as ShareOverlayTextCategory];
    setSuggestions(shuffleOverlayTexts({ mealType, categories, audience, relationship }, 8));
    trackShareOverlayTextEvent('share_overlay_text_shuffled', { meal_type: mealType, audience });
  }

  function handleSelect(suggestion: { id: string; text: string; category: ShareOverlayTextCategory }) {
    setSelected({ id: suggestion.id, text: suggestion.text });
    trackShareOverlayTextEvent('share_overlay_text_selected', {
      text_id: suggestion.id,
      category: suggestion.category,
      meal_type: mealType,
      audience,
    });
  }

  function handleRemove() {
    setSelected(null);
    setCustomText('');
    trackShareOverlayTextEvent('share_overlay_text_removed', { meal_type: mealType, audience });
  }

  function handleCustomTextChange(value: string) {
    setCustomText(value);
    setSelected(value.trim() ? { id: 'custom', text: value.trim() } : null);
  }

  function handleCustomTextBlur() {
    if (customText.trim()) trackShareOverlayTextEvent('share_overlay_text_edited', { meal_type: mealType, audience });
  }

  async function handleShare() {
    if (!cardRef.current) return;
    setSharing(true);
    try {
      await shareCardView(cardRef, { dialogTitle: meal!.summary });
    } finally {
      setSharing(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={styles.cardWrap}>
              <MealSharePreview ref={cardRef} meal={meal} enhanced={enhanced} captionText={selected?.text ?? null} />
            </View>

            <View style={styles.enhanceRow}>
              <Text style={styles.enhanceLabel}>Enhance photo (brighter, more vivid)</Text>
              <Switch value={enhanced} onValueChange={setEnhanced} trackColor={{ true: theme.primary }} />
            </View>

            <View style={styles.captionSection}>
              <Text style={styles.captionSectionTitle}>Caption</Text>

              {!pickerExpanded ? (
                <View style={styles.collapsedCaptionRow}>
                  <Text style={styles.collapsedCaptionText} numberOfLines={1}>
                    {selected?.text ?? 'No caption'}
                  </Text>
                  <Pressable onPress={() => setPickerExpanded(true)}>
                    <Text style={[styles.captionActionText, { color: theme.primary }]}>Show other captions</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
                    {CATEGORY_TABS.map((tab) => (
                      <Pressable
                        key={tab.key}
                        onPress={() => setActiveTab(tab.key)}
                        style={[
                          styles.tabChip,
                          { borderColor: 'rgba(255,255,255,0.3)' },
                          activeTab === tab.key && { backgroundColor: theme.primary, borderColor: theme.primary },
                        ]}
                      >
                        <Text style={[styles.tabChipText, activeTab === tab.key && { color: '#fff' }]}>{tab.label}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>

                  {activeTab === 'custom' ? (
                    <TextInput
                      value={customText}
                      onChangeText={handleCustomTextChange}
                      onBlur={handleCustomTextBlur}
                      maxLength={60}
                      placeholder="Write your own short caption…"
                      placeholderTextColor="rgba(255,255,255,0.5)"
                      style={styles.customInput}
                      multiline
                    />
                  ) : (
                    <View style={styles.suggestionWrap}>
                      {visibleSuggestions.map((suggestion) => (
                        <Pressable
                          key={suggestion.id}
                          onPress={() => handleSelect(suggestion)}
                          style={[
                            styles.suggestionChip,
                            selected?.id === suggestion.id && { backgroundColor: 'rgba(255,255,255,0.25)', borderColor: '#fff' },
                          ]}
                        >
                          <Text style={styles.suggestionChipText}>{suggestion.text}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}

                  <View style={styles.captionActionsRow}>
                    {activeTab !== 'custom' && (
                      <Pressable onPress={handleShuffle}>
                        <Text style={[styles.captionActionText, { color: theme.primary }]}>Shuffle</Text>
                      </Pressable>
                    )}
                    {selected && (
                      <Pressable onPress={handleRemove}>
                        <Text style={styles.captionActionText}>Remove text</Text>
                      </Pressable>
                    )}
                    <Pressable onPress={() => setPickerExpanded(false)} style={styles.doneButton}>
                      <Text style={styles.captionActionText}>Done</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>

            <Pressable
              onPress={handleShare}
              disabled={sharing}
              style={[styles.shareButton, { backgroundColor: theme.primary, opacity: sharing ? 0.6 : 1 }]}
            >
              <Text style={styles.shareButtonText}>{sharing ? 'Sharing…' : 'Share'}</Text>
            </Pressable>

            <Pressable onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </Pressable>
        </ScrollView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  scrollContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  cardWrap: { alignItems: 'center', marginBottom: 16 },
  enhanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 14 },
  enhanceLabel: { color: '#ffffff', fontSize: 12, fontWeight: '500' },
  captionSection: { width: '100%', maxWidth: 320, marginBottom: 14 },
  captionSectionTitle: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  tabRow: { gap: 6, paddingBottom: 8 },
  tabChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  tabChipText: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '500' },
  suggestionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  suggestionChip: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  suggestionChipText: { color: '#fff', fontSize: 12, fontWeight: '500' },
  customInput: { color: '#fff', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', borderRadius: 12, padding: 10, fontSize: 13, minHeight: 44 },
  collapsedCaptionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  collapsedCaptionText: { flex: 1, color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  captionActionsRow: { flexDirection: 'row', gap: 16, marginTop: 8 },
  doneButton: { marginLeft: 'auto' },
  captionActionText: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600' },
  shareButton: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32, alignItems: 'center' },
  shareButtonText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
  closeButton: { alignItems: 'center', marginTop: 14 },
  closeText: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
});
