import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
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

/** Mirrors web's PhotoCollage — 1 photo full-bleed, 2 stacked, 3/4 as a
 * 2x2 grid (the first of 3 spans both rows). */
function PhotoCollage({ photoUrls }: { photoUrls: string[] }) {
  if (photoUrls.length === 1) {
    return <Image source={{ uri: photoUrls[0] }} style={StyleSheet.absoluteFill} contentFit="cover" />;
  }
  if (photoUrls.length === 2) {
    return (
      <View style={StyleSheet.absoluteFill}>
        <Image source={{ uri: photoUrls[0] }} style={styles.collageHalf} contentFit="cover" />
        <Image source={{ uri: photoUrls[1] }} style={styles.collageHalf} contentFit="cover" />
      </View>
    );
  }
  return (
    <View style={[StyleSheet.absoluteFill, styles.collageGrid]}>
      <View style={styles.collageColumn}>
        <Image source={{ uri: photoUrls[0] }} style={styles.collageQuadrant} contentFit="cover" />
        {photoUrls[2] && <Image source={{ uri: photoUrls[2] }} style={styles.collageQuadrant} contentFit="cover" />}
      </View>
      <View style={styles.collageColumn}>
        <Image source={{ uri: photoUrls[1] }} style={styles.collageQuadrant} contentFit="cover" />
        {photoUrls[3] && <Image source={{ uri: photoUrls[3] }} style={styles.collageQuadrant} contentFit="cover" />}
      </View>
    </View>
  );
}

/** Mirrors the main web app's ShareCardPreview.tsx — real collage of the
 * user's own relevant meal photos as the background when
 * selectSharePhotos found any (see lib/share-cards/triggers.ts), falling
 * back to the gradient + sparkle placeholder otherwise. Wrapped in
 * forwardRef so lib/share-cards/export.ts's captureRef can screenshot it. */
export const ShareCardPreview = forwardRef<View, { card: EarnedShareCard }>(function ShareCardPreview({ card }, ref) {
  const isStory = card.format === 'story_9_16';
  const hasPhotos = Boolean(card.photoUrls && card.photoUrls.length > 0);

  return (
    <View ref={ref} style={[styles.container, { width: isStory ? 270 : 300, height: isStory ? 480 : 300 }]} collapsable={false}>
      {hasPhotos ? (
        <>
          <PhotoCollage photoUrls={card.photoUrls!} />
          <LinearGradient
            colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.6)']}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
          />
        </>
      ) : (
        <>
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
        </>
      )}

      <View style={[styles.badge, hasPhotos && styles.badgeOnPhoto]}>
        <Text style={styles.badgeText}>{CATEGORY_LABEL[card.concept.category]}</Text>
      </View>

      <View style={styles.middle}>
        <Text style={[styles.headline, hasPhotos && styles.textOnPhoto]}>{card.headline}</Text>
        {card.stat && <Text style={[styles.stat, hasPhotos && styles.textOnPhoto]}>{card.stat}</Text>}
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerText, hasPhotos && styles.textOnPhoto]}>Tistra Health</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { borderRadius: 24, overflow: 'hidden', padding: 24, justifyContent: 'space-between' },
  collageHalf: { flex: 1, width: '100%' },
  collageGrid: { flexDirection: 'row', gap: 2 },
  collageColumn: { flex: 1, gap: 2 },
  collageQuadrant: { flex: 1, width: '100%' },
  sparkleTopRight: { position: 'absolute', top: -12, right: -8, fontSize: 48, color: '#ffffff', opacity: 0.3 },
  sparkleBottomLeft: { position: 'absolute', bottom: 34, left: -4, fontSize: 32, color: '#ffffff', opacity: 0.2 },
  sparkleMidLeft: { position: 'absolute', top: '32%', left: 6, fontSize: 20, color: '#ffffff', opacity: 0.2 },
  badge: { alignSelf: 'flex-start', backgroundColor: '#6750A4', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  badgeOnPhoto: { backgroundColor: 'rgba(255,255,255,0.2)' },
  badgeText: { color: '#ffffff', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  middle: { flex: 1, justifyContent: 'center', paddingHorizontal: 4 },
  headline: { fontSize: 24, fontWeight: '800', color: '#3B2A63', lineHeight: 30, textAlign: 'center' },
  stat: { fontSize: 12, fontWeight: '700', color: '#6750A4', marginTop: 12, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerText: { fontSize: 12, fontWeight: '700', color: '#3B2A63' },
  textOnPhoto: { color: '#ffffff' },
});
