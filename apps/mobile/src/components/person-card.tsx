import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Share, StyleSheet, View } from 'react-native';

import { bandLabelFor } from './food-balance-score-card';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { Spacing } from '@/constants/theme';
import { useFoodBalanceScore } from '@/hooks/use-food-balance-score';
import { useTheme } from '@/hooks/use-theme';
import { api, type MacroWindowSummary } from '@/lib/api';
import type { InviteStatus } from '@/lib/invite-status';

function formatLastMeal(lastMealAt?: string): string {
  if (!lastMealAt) return 'No meals logged yet';
  const days = Math.floor((Date.now() - new Date(lastMealAt).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Last meal today';
  if (days === 1) return 'Last meal yesterday';
  return `Last meal ${days} days ago`;
}

function initialsFor(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** A person's row on the family/client selection screens — shared by
 * (app)/adults/index.tsx and (app)/gym/index.tsx so both keep the same
 * card design. Pulls in that person's own Food Balance Score (same
 * feature-flagged endpoint as the detail page's FoodBalanceScoreCard, via
 * the same hook) to show a compact score or "still learning" state inline,
 * mirroring the richer selection screen design without inventing any data
 * the API doesn't actually provide (no compliance %, alerts, etc.). */
export function PersonCard({
  fullName,
  subtitle,
  mealCount,
  lastMealAt,
  macroSummary,
  scoreQuery,
  onPress,
  onLongPress,
  dimmed,
  invite,
}: {
  fullName: string;
  subtitle?: string;
  mealCount: number;
  lastMealAt?: string;
  /** Fallback shown in place of the "still learning" progress bar when
   * there isn't yet enough data for a Food Balance Score — otherwise that
   * state left the card with almost nothing on it (see this component's
   * git history for the report that prompted this). Prefers today's
   * totals when there's at least one meal logged today, falling back to
   * this calendar week's otherwise. Undefined only for the "removed
   * contacts" section, which doesn't bother fetching this. */
  macroSummary?: { today: MacroWindowSummary; week: MacroWindowSummary };
  scoreQuery: { contactId: string } | { clientId: string };
  onPress: () => void;
  /** Long-press to remove — see (app)/adults/index.tsx and
   * (app)/gym/index.tsx, mirroring the web dashboard's per-card remove
   * button (there's no per-row overflow menu on these compact cards, so
   * long-press stands in for it, same pattern as most native list UIs). */
  onLongPress?: () => void;
  /** Used for the collapsed "removed" section — same card, visually
   * de-emphasized, read-only (no onLongPress passed there). */
  dimmed?: boolean;
  /** adults-only — omitted entirely for gym clients (no WhatsApp invite
   * concept there) and whenever status is "connected". Mirrors the web
   * dashboard's list-level invite status/resend (AdultsDashboardClient.tsx)
   * and the mobile detail page's identical banner (person-detail.tsx) —
   * previously the list had no invite indicator or resend option at all. */
  invite?: {
    contactId: string;
    status: Exclude<InviteStatus, 'connected'>;
    isSelf: boolean;
    /** Only used for the "stale" + isSelf case — a plain wa.me link to the
     * bot's own number. A "not_connected" self contact still needs the
     * real invite/JOIN flow (handleSendInvite below), since that's what
     * actually creates the WhatsApp-linked profile in the first place; a
     * "stale" one is already linked and just needs to say anything to
     * reopen the 24h window, so no JOIN command is involved. */
    tistraWhatsAppNumber?: string;
  };
}) {
  const theme = useTheme();
  const { result } = useFoodBalanceScore(scoreQuery);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  async function handleSendInvite() {
    if (!invite) return;
    if (invite.status === 'stale' && invite.isSelf) {
      // Already linked — just needs any message to reopen WhatsApp's 24h
      // window, so a plain chat link is enough (no JOIN command/invite
      // token involved, unlike the "never connected" case below).
      if (invite.tistraWhatsAppNumber) await Linking.openURL(`https://wa.me/${invite.tistraWhatsAppNumber}`);
      return;
    }
    setSendingInvite(true);
    setInviteError(null);
    try {
      const inviteSummary = await api.getFamilyInvite(invite.contactId);
      if (inviteSummary.shareLink) {
        await Share.share({ message: inviteSummary.shareMessage ?? inviteSummary.shareLink });
      }
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Could not create an invite right now.');
    } finally {
      setSendingInvite(false);
    }
  }

  const isLearning = result && (result.status === 'collecting_data' || result.status === 'refreshing_data');
  const isScored = result && !isLearning;
  const topRecommendation = isScored ? result.recommendations[0]?.title : undefined;

  const macroFallback = isLearning && macroSummary
    ? macroSummary.today.mealCount > 0
      ? { label: 'Today', ...macroSummary.today }
      : { label: 'This week', ...macroSummary.week }
    : null;

  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={dimmed ? styles.dimmed : undefined}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.header}>
          <View style={[styles.avatar, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText type="default" style={styles.avatarText}>
              {initialsFor(fullName)}
            </ThemedText>
          </View>
          <View style={styles.headerText}>
            <ThemedText type="default" style={styles.name}>
              {fullName}
            </ThemedText>
            {subtitle && (
              <ThemedText type="small" themeColor="textSecondary">
                {subtitle}
              </ThemedText>
            )}
          </View>
          <ThemedText type="default" themeColor="textSecondary">
            ›
          </ThemedText>
        </View>

        {invite && (
          <View style={[styles.inviteBox, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText type="smallBold">{invite.status === 'stale' ? 'Meal reminders paused' : 'Not connected yet'}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.inviteText}>
              {invite.status === 'stale'
                ? invite.isSelf
                  ? "More than 24 hours have passed since you've interacted with WhatsApp — meal reminders won't be sent until you do."
                  : `More than 24 hours have passed since ${fullName.split(' ')[0]} interacted with WhatsApp — meal reminders won't be sent until they do.`
                : invite.isSelf
                  ? "You haven't connected your own WhatsApp number yet."
                  : `${fullName.split(' ')[0]} hasn't opened the WhatsApp invite yet.`}
            </ThemedText>
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                handleSendInvite();
              }}
              disabled={sendingInvite}
              style={[styles.inviteButton, { backgroundColor: theme.primary, opacity: sendingInvite ? 0.6 : 1 }]}
            >
              <ThemedText type="small" style={styles.inviteButtonText}>
                {sendingInvite
                  ? 'Sending…'
                  : invite.status === 'stale'
                    ? invite.isSelf
                      ? 'Open WhatsApp'
                      : `Remind ${fullName.split(' ')[0]}`
                    : invite.isSelf
                      ? 'Send myself the WhatsApp link'
                      : 'Send invite via WhatsApp'}
              </ThemedText>
            </Pressable>
            {inviteError && (
              <ThemedText type="small" style={styles.inviteErrorText}>
                {inviteError}
              </ThemedText>
            )}
          </View>
        )}

        {isLearning && macroFallback && (
          <View style={styles.learning}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
              {macroFallback.label}&apos;s totals
            </ThemedText>
            <View style={styles.macroRow}>
              {[
                { label: 'Cal', value: macroFallback.calories, unit: '' },
                { label: 'Protein', value: macroFallback.proteinG, unit: 'g' },
                { label: 'Carbs', value: macroFallback.carbsG, unit: 'g' },
                { label: 'Fat', value: macroFallback.fatG, unit: 'g' },
              ].map((m) => (
                <View key={m.label} style={styles.macroPill}>
                  <ThemedText type="smallBold">
                    {m.value}
                    {m.unit}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {m.label}
                  </ThemedText>
                </View>
              ))}
            </View>
          </View>
        )}

        {isLearning && !macroFallback && (
          <View style={styles.learning}>
            <View style={styles.learningHeader}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
                Learning state
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {result.dataCoverage.eligibleMealCount} of {result.dataCoverage.requiredMealCount} meals
              </ThemedText>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: theme.backgroundSelected }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(100, Math.round((result.dataCoverage.eligibleMealCount / result.dataCoverage.requiredMealCount) * 100))}%`,
                    backgroundColor: theme.primary,
                  },
                ]}
              />
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.learningCaption}>
              {result.status === 'refreshing_data' ? 'Refreshing eating pattern' : 'Learning eating pattern'}
            </ThemedText>
          </View>
        )}

        {isScored && (
          <View style={styles.scoreRow}>
            <ThemedText type="title" style={[styles.scoreNumber, { color: theme.primary }]}>
              {result.score ?? '—'}
            </ThemedText>
            <View style={styles.scoreTextBlock}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
                Food Balance Score
              </ThemedText>
              <ThemedText type="small">{bandLabelFor(result.score ?? 0)}</ThemedText>
            </View>
          </View>
        )}

        <ThemedText type="small" themeColor="textSecondary" style={styles.meta}>
          🍽️ {formatLastMeal(lastMealAt)} · {mealCount} meal{mealCount === 1 ? '' : 's'} logged
        </ThemedText>

        {topRecommendation && (
          <View style={[styles.tip, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText type="small">
              <ThemedText type="smallBold">Focus: </ThemedText>
              {topRecommendation}
            </ThemedText>
          </View>
        )}
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dimmed: { opacity: 0.6 },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two,
    gap: Spacing.two,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  inviteBox: { borderRadius: Spacing.two, padding: Spacing.two, gap: Spacing.one },
  inviteText: {},
  inviteButton: { borderRadius: Spacing.two, paddingVertical: Spacing.one + 2, alignItems: 'center', marginTop: Spacing.half },
  inviteButtonText: { color: '#fff', fontWeight: '700' },
  inviteErrorText: { color: '#D92D20' },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '700' },
  headerText: { flex: 1 },
  name: { fontWeight: '700', fontSize: 18, lineHeight: 22 },
  label: { textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700', fontSize: 11 },
  learning: {},
  learningHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.one },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  learningCaption: { marginTop: Spacing.one, fontStyle: 'italic' },
  macroRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.one },
  macroPill: { alignItems: 'center', gap: 2 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  scoreNumber: { fontSize: 32, lineHeight: 36 },
  scoreTextBlock: { gap: Spacing.half },
  meta: {},
  tip: { borderRadius: Spacing.two, padding: Spacing.two },
});
