import { Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** "Coach? Sign in here" on the first screen (select-product.tsx). It reuses
 * the artwork and subtitle of the coach card the product picker carried
 * until Aug 2026 (#22), and the picker cards' look, but it is a link, not a
 * third option: tapping it goes straight to sign-in, and ProductKey stays
 * self/family. It signs into an existing Coach account only — coach
 * accounts are created in Coach OS on the web, and nothing here creates a
 * workspace. */
export function CoachSignInCard({ onPress }: { onPress: () => void }) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      style={[styles.card, { borderColor: theme.backgroundSelected }]}>
      <ThemedView type="backgroundElement" style={styles.imageWrap}>
        {/* Decorative, as on the picker cards: the title names the action. */}
        <Image style={styles.image} source={require('@/assets/images/onboarding/coach.png')} contentFit="contain" alt="" />
      </ThemedView>
      <ThemedView style={styles.cardBody}>
        <ThemedView style={styles.cardText}>
          <ThemedText type="default" style={styles.cardTitle}>
            Coach? Sign in here
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Use Tistra Health as a coach, trainer, or gym.
          </ThemedText>
        </ThemedView>
        <ThemedText type="default" style={styles.chevron}>
          ›
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

// Same measurements as product-picker.tsx's card, so the three read as one
// set even though this one isn't selectable.
const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  imageWrap: {
    width: '100%',
    height: 140,
    borderRadius: Spacing.five,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.three,
    overflow: 'hidden',
  },
  image: {
    width: '75%',
    height: '75%',
  },
  cardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardText: {
    flex: 1,
    paddingRight: Spacing.three,
    gap: Spacing.half,
  },
  cardTitle: {
    fontWeight: '600',
  },
  chevron: {
    fontSize: 28,
    lineHeight: 28,
    color: '#5715CE',
  },
});
