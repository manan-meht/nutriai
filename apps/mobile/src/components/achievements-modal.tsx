import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { EarnedShareCard } from '@/lib/share-cards/types';
import { ShareCardModal } from './share-card-modal';

/** Mirrors the main web app's AchievementsModal.tsx — every earned card
 * (not capped at 3 like the dashboard row), grid of tappable mini-cards
 * opening the same ShareCardModal detail view. */
export function AchievementsModal({
  visible,
  cards,
  onClose,
  onDismissForever,
}: {
  visible: boolean;
  cards: EarnedShareCard[];
  onClose: () => void;
  onDismissForever?: (conceptId: string) => void;
}) {
  const theme = useTheme();
  const [openCard, setOpenCard] = useState<EarnedShareCard | null>(null);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ThemedView type="background" style={styles.sheet}>
          <View style={styles.header}>
            <ThemedText type="subtitle">Your achievements</ThemedText>
            <Pressable onPress={onClose}>
              <ThemedText type="small" style={{ color: theme.primary }}>
                Close
              </ThemedText>
            </Pressable>
          </View>

          {cards.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Keep logging meals and Tistra will turn your progress into shareable wins.
            </ThemedText>
          ) : (
            <FlatList
              data={cards}
              keyExtractor={(c) => c.concept.id}
              numColumns={2}
              columnWrapperStyle={styles.row}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => setOpenCard(item)}
                  style={[styles.card, { backgroundColor: theme.backgroundSelected }]}
                >
                  <ThemedText type="small" numberOfLines={2} style={{ fontWeight: '700' }}>
                    {item.headline}
                  </ThemedText>
                  {item.stat && (
                    <ThemedText type="small" style={{ color: theme.primary, marginTop: Spacing.one, fontWeight: '700' }}>
                      {item.stat}
                    </ThemedText>
                  )}
                </Pressable>
              )}
            />
          )}
        </ThemedView>
      </View>

      <ShareCardModal
        card={openCard}
        visible={!!openCard}
        onClose={() => setOpenCard(null)}
        onDismissForever={onDismissForever}
        sourceSurface="achievements_page"
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.three, maxHeight: '80%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.three },
  row: { gap: Spacing.two, marginBottom: Spacing.two },
  card: { flex: 1, borderRadius: Spacing.two, padding: Spacing.two, minHeight: 90, justifyContent: 'center' },
});
