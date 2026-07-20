import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ColorMatrix, concatColorMatrices, saturate, brightness, contrast, temperature } from 'react-native-color-matrix-image-filters';
import type { MealShareData } from '@/lib/meal-share/types';

const CARD_WIDTH = 320;
const CARD_HEIGHT = 568; // 9:16

/** Same intent as web's CSS filter (saturate(1.35) brightness(1.08)
 * contrast(1.05) sepia(0.06)) — react-native-color-matrix-image-filters
 * builds on react-native-svg's color-matrix primitives (already
 * native-linked for the Food Balance Score ring), so this doesn't add a
 * meaningfully new native-build burden on top of the other libraries this
 * feature already needed (react-native-view-shot, expo-linear-gradient,
 * expo-sharing). Uses `temperature` rather than a literal sepia matrix for
 * the warmth boost — closer to "warmer," not "old photo." */
const FOOD_ENHANCE_MATRIX = concatColorMatrices(saturate(1.35), brightness(1.08), contrast(1.05), temperature(0.15));

/** Mirrors the main web app's MealSharePreview.tsx — full-bleed meal photo
 * with macros stylized directly over it (soft vignette for legibility, a
 * small wordmark), rather than a separate branded frame. Wrapped in
 * forwardRef so lib/share-cards/export.ts's captureRef can screenshot it
 * (same capture helper works for both share-cards and meal-share). */
export const MealSharePreview = forwardRef<View, { meal: MealShareData; enhanced?: boolean; captionText?: string | null }>(
  function MealSharePreview({ meal, enhanced = true, captionText }, ref) {
  const photo = <Image source={{ uri: meal.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />;

  return (
    <View ref={ref} style={styles.container} collapsable={false}>
      {enhanced ? <ColorMatrix matrix={FOOD_ENHANCE_MATRIX} style={StyleSheet.absoluteFill}>{photo}</ColorMatrix> : photo}

      <LinearGradient
        colors={['rgba(0,0,0,0.35)', 'transparent']}
        style={[styles.topVignette, captionText && styles.topVignetteTall]}
      />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.35)']} style={styles.bottomVignette} />

      {/* Caption — an italic display accent above the macro stats, not a
          boxed sticker, so it reads as editorial type on the photo. */}
      {captionText ? (
        <View style={styles.captionWrap} pointerEvents="none">
          <Text style={styles.captionText} numberOfLines={2}>
            {captionText}
          </Text>
        </View>
      ) : null}

      <View style={[styles.topStats, captionText && styles.topStatsWithCaption]}>
        <MacroStat value={meal.proteinG} unit="g" label="Protein" />
        <MacroStat value={meal.caloriesKcal} unit="" label="Calories" />
      </View>

      <View style={styles.bottomBlock}>
        <View style={styles.bottomStats}>
          <MacroStat value={meal.carbsG} unit="g" label="Carbs" />
          <MacroStat value={meal.fatG} unit="g" label="Fat" />
        </View>
        <Text style={styles.wordmark}>TISTRA HEALTH</Text>
      </View>
    </View>
  );
});

function MacroStat({ value, unit, label }: { value: number; unit: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>
        {value}
        <Text style={styles.statUnit}>{unit}</Text>
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: CARD_WIDTH, height: CARD_HEIGHT, borderRadius: 24, overflow: 'hidden', backgroundColor: '#000' },
  topVignette: { position: 'absolute', top: 0, left: 0, right: 0, height: '22%' },
  topVignetteTall: { height: '30%' },
  bottomVignette: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '22%' },
  topStats: { position: 'absolute', top: 18, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 24 },
  topStatsWithCaption: { top: 96 },
  bottomBlock: { position: 'absolute', bottom: 18, left: 0, right: 0, alignItems: 'center', gap: 10 },
  bottomStats: { flexDirection: 'row', justifyContent: 'space-around', width: '100%', paddingHorizontal: 24 },
  captionWrap: { position: 'absolute', top: 20, left: 0, right: 0, paddingHorizontal: 26, alignItems: 'center' },
  captionText: {
    fontSize: 24,
    fontWeight: '600',
    fontStyle: 'italic',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 28,
    letterSpacing: -0.2,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 30, fontWeight: '800', color: '#ffffff', textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 10 },
  statUnit: { fontSize: 18, fontWeight: '700' },
  statLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.9)', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  wordmark: { fontSize: 11, fontWeight: '600', letterSpacing: 2, color: 'rgba(255,255,255,0.9)', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
});
