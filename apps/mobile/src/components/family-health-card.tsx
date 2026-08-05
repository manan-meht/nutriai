import { ActivityIndicator, Linking, Pressable, Share, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Circle, Path, Polyline } from 'react-native-svg';
import { useEffect, useState } from 'react';

import { bandLabelFor } from './food-balance-score-card';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { Spacing } from '@/constants/theme';
import { useFoodBalanceScore } from '@/hooks/use-food-balance-score';
import { useTheme } from '@/hooks/use-theme';
import { api, type AdultsContact } from '@/lib/api';
import { NUTRITION_GOAL_LABELS } from '@/lib/goals';
import type { InviteStatus } from '@/lib/invite-status';

// Matches NUTRITION_GOAL_LABELS' keys (src/lib/goals.ts) — mirrors the web
// dashboard's GoalChip.tsx so the same goal shows the same emoji on both
// platforms.
const GOAL_EMOJI: Record<string, string> = {
  reduce_weight: '⚖️',
  reduce_body_fat: '🔥',
  gain_muscle: '💪',
  body_recomposition: '🔁',
  maintain_weight: '🌿',
  improve_nutrition: '🥗',
  healthy_aging: '🌿',
};

function initialsFor(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export interface FamilyCardStatus {
  active: boolean;
  hasFocus: boolean;
  /** True if this contact needs a WhatsApp connect/reconnect action —
   * mirrors the web dashboard's identical field (FamilyHealthCard.tsx). */
  reminderPaused: boolean;
}

function formatMealDay(lastMealAt?: string): string {
  if (!lastMealAt) return '—';
  const days = Math.floor((Date.now() - new Date(lastMealAt).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

/** Compact 64px Food Balance Score ring for the 3-column health snapshot
 * row — a smaller sibling of food-balance-score-card.tsx's own 100px ring,
 * which is tuned for the standalone detail-page card. Mirrors the web
 * dashboard's FoodBalanceRing.tsx. */
function ScoreRing({ score }: { score: number }) {
  const theme = useTheme();
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const progress = (Math.max(0, Math.min(100, score)) / 100) * circumference;
  return (
    <View style={styles.ringWrap}>
      <Svg width={64} height={64} viewBox="0 0 64 64">
        <Circle cx={32} cy={32} r={radius} stroke={theme.backgroundSelected} strokeWidth={6} fill="none" />
        <Circle
          cx={32}
          cy={32}
          r={radius}
          stroke={theme.primary}
          strokeWidth={6}
          fill="none"
          strokeDasharray={`${progress} ${circumference}`}
          strokeLinecap="round"
          rotation={-90}
          origin="32, 32"
        />
      </Svg>
      <ThemedText type="smallBold" style={styles.ringScore}>
        {score}
      </ThemedText>
    </View>
  );
}

/** 7-day calorie trend sparkline — mirrors the web dashboard's
 * MiniTrendChart.tsx (same rolling-window data, AdultsContact.
 * last7DaysCalories, computed by computeDailyCalories server-side). Falls
 * back to a "coming soon" glyph when every day in the window is 0 (no
 * meals logged at all yet) rather than plotting a meaningless flat line. */
function TrendSparkline({ scores }: { scores?: number[] }) {
  const theme = useTheme();
  if (!scores || scores.length < 2 || scores.every((s) => s === 0)) {
    return (
      <View style={styles.trendEmpty}>
        <Svg width={28} height={20} viewBox="0 0 28 20">
          <Polyline
            points="1,15 8,9 14,12 20,4 27,7"
            fill="none"
            stroke={theme.backgroundSelected}
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
        <ThemedText type="small" themeColor="textSecondary" style={styles.trendEmptyText}>
          Trend soon
        </ThemedText>
      </View>
    );
  }

  const width = 56;
  const height = 32;
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min || 1;
  const points = scores.map((s, i) => {
    const x = (i / (scores.length - 1)) * width;
    const y = height - ((s - min) / range) * (height - 6) - 3;
    return [x, y] as const;
  });
  const linePath = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Path d={linePath} fill="none" stroke={theme.primary} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      {points.map(([x, y], i) => (
        <Circle key={i} cx={x} cy={y} r={i === points.length - 1 ? 2 : 1.25} fill={theme.primary} />
      ))}
    </Svg>
  );
}

/** The family dashboard's main list row — one person's glanceable health
 * snapshot (score ring, 7-day calorie trend, latest meal, reminder status,
 * today's focus). Mirrors the web dashboard's FamilyHealthCard.tsx.
 * Adults-only — gym clients still use the plain PersonCard (no equivalent
 * redesign there yet). */
export function FamilyHealthCard({
  contact,
  onPress,
  onLongPress,
  dimmed,
  invite,
  onStatus,
}: {
  contact: AdultsContact;
  onPress: () => void;
  /** Long-press to remove — no per-row overflow menu on these compact
   * cards, so long-press stands in for it (same as the old PersonCard). */
  onLongPress?: () => void;
  /** Used for the collapsed "removed" section — same card, visually
   * de-emphasized, read-only (no onLongPress passed there). */
  dimmed?: boolean;
  invite?: {
    contactId: string;
    status: Exclude<InviteStatus, 'connected'>;
    isSelf: boolean;
    tistraWhatsAppNumber?: string;
  };
  /** Reports this card's contribution to the family summary strip's
   * Active/Focus/Reminder counts once its own Food Balance Score fetch
   * resolves — mirrors the web dashboard's identical prop. */
  onStatus?: (contactId: string, status: FamilyCardStatus) => void;
}) {
  const theme = useTheme();
  const { result } = useFoodBalanceScore({ contactId: contact.id });
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const isSelf = contact.relationshipType === 'self';
  const displayName = isSelf ? 'You' : contact.fullName;
  const isScored = result && result.status !== 'collecting_data' && result.status !== 'refreshing_data';
  const topRecommendation = isScored ? result.recommendations[0] : undefined;
  const needsReminderAction = !!invite;

  useEffect(() => {
    if (!onStatus) return;
    onStatus(contact.id, { active: contact.mealCount > 0, hasFocus: !!topRecommendation, reminderPaused: needsReminderAction });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact.id, contact.mealCount, needsReminderAction, !!topRecommendation]);
  const goalId = contact.nutritionGoals?.[0];
  const goalLabel = contact.nutritionGoals?.length
    ? contact.nutritionGoals.map((g) => NUTRITION_GOAL_LABELS[g] ?? g).join(', ')
    : undefined;

  async function handleSendInvite() {
    if (!invite) return;
    if (invite.status === 'stale' && invite.isSelf) {
      if (invite.tistraWhatsAppNumber) await Linking.openURL(`https://wa.me/${invite.tistraWhatsAppNumber}`);
      return;
    }
    setSendingInvite(true);
    setInviteError(null);
    try {
      const inviteSummary = await api.getFamilyInvite(invite.contactId);
      if (invite.isSelf) {
        await Linking.openURL(inviteSummary.link);
      } else if (inviteSummary.shareLink) {
        await Share.share({ message: inviteSummary.shareMessage ?? inviteSummary.shareLink });
      }
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Could not create an invite right now.');
    } finally {
      setSendingInvite(false);
    }
  }

  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={dimmed ? styles.dimmed : undefined}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.header}>
          {contact.photoUrl ? (
            <Image source={{ uri: contact.photoUrl }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText type="default" style={styles.avatarText}>
                {initialsFor(contact.fullName)}
              </ThemedText>
            </View>
          )}
          <View style={styles.headerText}>
            <ThemedText type="default" style={styles.name}>
              {displayName}
            </ThemedText>
            {goalLabel && (
              <View style={[styles.goalPill, { backgroundColor: theme.backgroundSelected }]}>
                <ThemedText type="small" style={[styles.goalPillText, { color: theme.primary }]}>
                  {goalId && GOAL_EMOJI[goalId] ? `${GOAL_EMOJI[goalId]} ` : '🌿 '}
                  {goalLabel}
                </ThemedText>
              </View>
            )}
          </View>
          <ThemedText type="default" themeColor="textSecondary">
            ›
          </ThemedText>
        </View>

        <View style={styles.snapshotRow}>
          <View style={styles.snapshotCol}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.colLabel}>
              Food Balance
            </ThemedText>
            {isScored ? (
              <ScoreRing score={result.score ?? 0} />
            ) : (
              <View style={[styles.ringWrap, styles.ringPlaceholder, { borderColor: theme.backgroundSelected }]}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.ringPlaceholderText}>
                  {result ? 'Learning' : '…'}
                </ThemedText>
              </View>
            )}
            {isScored && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.ringSubtext} numberOfLines={2}>
                {bandLabelFor(result.score ?? 0)}
              </ThemedText>
            )}
          </View>

          <View style={styles.snapshotCol}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.colLabel}>
              7-day trend
            </ThemedText>
            <TrendSparkline scores={contact.last7DaysCalories} />
          </View>

          <View style={styles.snapshotCol}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.colLabel}>
              Last meal
            </ThemedText>
            <View style={[styles.mealThumb, { backgroundColor: theme.backgroundSelected }]}>
              {contact.lastMealPhotoUrl ? (
                <Image source={{ uri: contact.lastMealPhotoUrl }} style={styles.mealThumbImage} contentFit="cover" />
              ) : (
                <ThemedText type="default">🍽️</ThemedText>
              )}
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.mealCaption}>
              {contact.mealCount > 0 ? `${formatMealDay(contact.lastMealAt)} · ${contact.mealCount}` : 'No meals'}
            </ThemedText>
          </View>
        </View>

        {invite && (
          <View style={[styles.inviteBox, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText type="smallBold">{invite.status === 'stale' ? 'Reminders paused' : 'Not connected yet'}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.inviteText}>
              {invite.status === 'stale'
                ? "More than 24h since WhatsApp was last used — reminders won't be sent."
                : invite.isSelf
                  ? "You haven't connected your own WhatsApp number yet."
                  : `${contact.fullName.split(' ')[0]} hasn't opened the WhatsApp invite yet.`}
            </ThemedText>
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                handleSendInvite();
              }}
              disabled={sendingInvite}
              style={[styles.inviteButton, { backgroundColor: theme.primary, opacity: sendingInvite ? 0.6 : 1 }]}
            >
              {sendingInvite ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText type="small" style={styles.inviteButtonText}>
                  {invite.status === 'stale'
                    ? invite.isSelf
                      ? 'Open WhatsApp'
                      : `Remind ${contact.fullName.split(' ')[0]}`
                    : invite.isSelf
                      ? 'Open WhatsApp to get started'
                      : 'Send invite via WhatsApp'}
                </ThemedText>
              )}
            </Pressable>
            {inviteError && (
              <ThemedText type="small" style={styles.inviteErrorText}>
                {inviteError}
              </ThemedText>
            )}
          </View>
        )}

        {topRecommendation && (
          <View style={[styles.tip, { borderTopColor: theme.backgroundSelected }]}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.tipLabel}>
              Today&apos;s focus
            </ThemedText>
            <ThemedText type="small">{topRecommendation.action || topRecommendation.title}</ThemedText>
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
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '700' },
  headerText: { flex: 1, gap: Spacing.half },
  name: { fontWeight: '700', fontSize: 18, lineHeight: 22 },
  goalPill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 3 },
  goalPillText: { fontWeight: '600' },
  snapshotRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: Spacing.one },
  snapshotCol: { alignItems: 'center', flex: 1, gap: 2 },
  colLabel: { textTransform: 'uppercase', letterSpacing: 0.3, fontSize: 9 },
  ringWrap: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  ringScore: { position: 'absolute', fontSize: 16 },
  ringSubtext: { textAlign: 'center', fontSize: 10, maxWidth: 80 },
  ringPlaceholder: { borderRadius: 32, borderWidth: 4 },
  ringPlaceholderText: { fontSize: 10, textAlign: 'center' },
  trendEmpty: { alignItems: 'center', height: 64, justifyContent: 'center', gap: 2 },
  trendEmptyText: { fontSize: 9 },
  mealThumb: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  mealThumbImage: { width: '100%', height: '100%' },
  mealCaption: { fontSize: 10, textAlign: 'center' },
  inviteBox: { borderRadius: Spacing.two, padding: Spacing.two, gap: Spacing.one },
  inviteText: {},
  inviteButton: { borderRadius: Spacing.two, paddingVertical: Spacing.one + 2, alignItems: 'center', marginTop: Spacing.half },
  inviteButtonText: { color: '#fff', fontWeight: '700' },
  inviteErrorText: { color: '#D92D20' },
  tip: { paddingTop: Spacing.two, borderTopWidth: 1, gap: 2 },
  tipLabel: { fontWeight: '700', fontSize: 11 },
});
