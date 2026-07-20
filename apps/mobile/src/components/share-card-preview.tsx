import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { EarnedShareCard } from '@/lib/share-cards/types';

const CATEGORY_LABEL: Record<EarnedShareCard['concept']['category'], string> = {
  daily_win: 'Daily win',
  weekly_consistency: 'Weekly win',
  food_balance: 'Balance win',
  improvement: 'Progress win',
  personality_badge: 'Badge',
  comeback: 'Welcome back',
};

/** Mirrors the main web app's ShareCardPreview.tsx — same gradient
 * placeholder background (not yet a generated image, see
 * lib/share-cards/concepts.ts's nanoBananaPrompt fields), same app-rendered
 * text-over-background approach. Wrapped in forwardRef so
 * lib/share-cards/export.ts's captureRef can screenshot it. */
export const ShareCardPreview = forwardRef<View, { card: EarnedShareCard }>(function ShareCardPreview({ card }, ref) {
  const isStory = card.format === 'story_9_16';

  return (
    <View ref={ref} style={[styles.container, { width: isStory ? 270 : 300, height: isStory ? 480 : 300 }]} collapsable={false}>
      <LinearGradient
        colors={['#EFE6FB', '#D9C7F7', '#B79CEB']}
        locations={[0, 0.45, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Text style={styles.sparkleTopRight}>✦</Text>
      <Text style={styles.sparkleBottomLeft}>✧</Text>
      <Text style={styles.sparkleMidLeft}>✦</Text>

      <View style={styles.badge}>
        <Text style={styles.badgeText}>{CATEGORY_LABEL[card.concept.category]}</Text>
      </View>

      <View style={styles.middle}>
        <Text style={styles.headline}>{card.headline}</Text>
        <Text style={styles.supportingText}>{card.supportingText}</Text>
        {card.stat && <Text style={styles.stat}>{card.stat}</Text>}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Tistra Health</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { borderRadius: 24, overflow: 'hidden', padding: 24, justifyContent: 'space-between' },
  sparkleTopRight: { position: 'absolute', top: -12, right: -8, fontSize: 48, color: '#ffffff', opacity: 0.3 },
  sparkleBottomLeft: { position: 'absolute', bottom: 34, left: -4, fontSize: 32, color: '#ffffff', opacity: 0.2 },
  sparkleMidLeft: { position: 'absolute', top: '32%', left: 6, fontSize: 20, color: '#ffffff', opacity: 0.2 },
  badge: { alignSelf: 'flex-start', backgroundColor: '#6750A4', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  badgeText: { color: '#ffffff', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  middle: { flex: 1, justifyContent: 'center', paddingHorizontal: 4 },
  headline: { fontSize: 24, fontWeight: '800', color: '#3B2A63', lineHeight: 30, textAlign: 'center' },
  supportingText: { fontSize: 14, color: '#4B3A73', marginTop: 12, textAlign: 'center' },
  stat: { fontSize: 12, fontWeight: '700', color: '#6750A4', marginTop: 12, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerText: { fontSize: 12, fontWeight: '700', color: '#3B2A63' },
});
