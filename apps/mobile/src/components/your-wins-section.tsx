import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import type { EarnedShareCard } from '@/lib/share-cards/types';
import { selectDashboardCards } from '@/lib/share-cards/selector';
import { trackShareCardEvent } from '@/lib/share-cards/analytics';
import { ShareCardModal } from './share-card-modal';
import { AchievementsModal } from './achievements-modal';

/** Mirrors the main web app's ShareCardsDashboardSection/YourWinsSection
 * — an independent fetch against the same food-balance-score endpoint
 * FoodBalanceScoreCard already calls (kept as a self-contained,
 * independently-droppable section, same reasoning as the web version),
 * capped at 3 cards, 1 featured + up to 2 smaller, horizontally
 * scrollable on mobile per the original spec ("horizontal scroll for
 * additional cards, keep it compact"). */
export function YourWinsSection(params: { contactId: string } | { clientId: string }) {
  const theme = useTheme();
  const [cards, setCards] = useState<EarnedShareCard[] | null>(null);
  const [openCard, setOpenCard] = useState<EarnedShareCard | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getFoodBalanceScore(params)
      .then((data) => !cancelled && setCards(data.earnedShareCards ?? []))
      .catch(() => !cancelled && setCards([]));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, ['contactId' in params ? params.contactId : params.clientId]);

  async function handleDismissForever(conceptId: string) {
    setCards((prev) => (prev ? prev.filter((c) => c.concept.id !== conceptId) : prev));
    try {
      await api.dismissShareCardForever(params, conceptId);
    } catch {
      // best-effort — worst case it reappears next load, harmless
    }
  }

  if (cards === null) return null;

  const dashboardCards = selectDashboardCards(cards);

  return (
    <View>
      <View style={styles.headerRow}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
          Your wins
        </ThemedText>
        {dashboardCards.length > 0 && (
          <Pressable onPress={() => setShowAll(true)}>
            <ThemedText type="small" style={{ color: theme.primary, fontWeight: '600' }}>
              View all
            </ThemedText>
          </Pressable>
        )}
      </View>

      {dashboardCards.length === 0 ? (
        <ThemedView type="backgroundElement" style={styles.emptyCard}>
          <ThemedText type="small" themeColor="textSecondary">
            Keep logging meals and Tistra will turn your progress into shareable wins.
          </ThemedText>
        </ThemedView>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {dashboardCards.map((card, i) => (
            <Pressable
              key={card.concept.id}
              onPress={() => {
                trackShareCardEvent('share_card_viewed', {
                  card_id: card.concept.id,
                  category: card.concept.category,
                  format: card.format,
                  source_surface: 'dashboard',
                });
                setOpenCard(card);
              }}
              style={[styles.miniCard, { backgroundColor: theme.backgroundSelected }, i === 0 && styles.featuredCard]}
            >
              <ThemedText type="smallBold" numberOfLines={2}>
                {card.headline}
              </ThemedText>
              {card.stat && (
                <ThemedText type="small" style={{ color: theme.primary, marginTop: Spacing.one, fontWeight: '700' }}>
                  {card.stat}
                </ThemedText>
              )}
            </Pressable>
          ))}
        </ScrollView>
      )}

      <ShareCardModal
        card={openCard}
        visible={!!openCard}
        onClose={() => setOpenCard(null)}
        onDismissForever={handleDismissForever}
        sourceSurface="dashboard"
      />

      <AchievementsModal
        visible={showAll}
        cards={cards}
        onClose={() => setShowAll(false)}
        onDismissForever={handleDismissForever}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.two },
  sectionLabel: { textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700' },
  emptyCard: { borderRadius: Spacing.two, padding: Spacing.three },
  scrollContent: { gap: Spacing.two, paddingRight: Spacing.two },
  miniCard: { width: 140, borderRadius: Spacing.two, padding: Spacing.two, justifyContent: 'center' },
  featuredCard: { width: 200 },
});
