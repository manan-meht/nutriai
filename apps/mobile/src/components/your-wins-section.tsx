import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, type FoodBalanceScoreResult } from '@/lib/api';
import type { EarnedShareCard } from '@/lib/share-cards/types';
import { selectDashboardCards } from '@/lib/share-cards/selector';
import { trackShareCardEvent } from '@/lib/share-cards/analytics';
import { ShareCardModal } from './share-card-modal';
import { AchievementsModal } from './achievements-modal';

function WinsSkeleton({ theme }: { theme: ReturnType<typeof useTheme> }) {
  return (
    <View>
      <View style={[styles.skeletonLine, styles.skeletonLabel, { backgroundColor: theme.backgroundSelected }]} />
      <View style={styles.skeletonRow}>
        <View style={[styles.miniCard, styles.featuredCard, styles.skeletonCard, { backgroundColor: theme.backgroundSelected }]} />
        <View style={[styles.miniCard, styles.skeletonCard, { backgroundColor: theme.backgroundSelected }]} />
      </View>
    </View>
  );
}

/** Mirrors the main web app's ShareCardsDashboardSection/YourWinsSection
 * — capped at 3 cards, 1 featured + up to 2 smaller, horizontally
 * scrollable on mobile per the original spec ("horizontal scroll for
 * additional cards, keep it compact"). `result`/`loading` are fetched
 * once by the caller (person-detail.tsx's single useFoodBalanceScore
 * call) and passed down — this used to independently fetch the same
 * food-balance-score endpoint FoodBalanceScoreCard already calls,
 * tripling the score's DB queries/scoring work per screen view. */
export function YourWinsSection(
  params: ({ contactId: string } | { clientId: string }) & { result: FoodBalanceScoreResult | null; loading: boolean }
) {
  const theme = useTheme();
  const { result, loading } = params;
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [openCard, setOpenCard] = useState<EarnedShareCard | null>(null);
  const [showAll, setShowAll] = useState(false);

  async function handleDismissForever(conceptId: string) {
    setDismissedIds((prev) => new Set(prev).add(conceptId));
    try {
      await api.dismissShareCardForever(params, conceptId);
    } catch {
      // best-effort — worst case it reappears next load, harmless
    }
  }

  if (loading) return <WinsSkeleton theme={theme} />;
  if (!result) return null;

  const cards = (result.earnedShareCards ?? []).filter((c) => !dismissedIds.has(c.concept.id));
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
  skeletonLine: { borderRadius: 4, height: 12 },
  skeletonLabel: { width: 80, marginBottom: Spacing.two },
  skeletonRow: { flexDirection: 'row', gap: Spacing.two },
  skeletonCard: { height: 76 },
});
