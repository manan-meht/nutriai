import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { Image } from 'expo-image';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ProductKey = 'self' | 'family' | 'coach';

const OPTIONS: Array<{
  key: ProductKey;
  image: number;
  title: string;
  subtitle: string;
}> = [
  {
    key: 'self',
    image: require('@/assets/images/onboarding/self.png'),
    title: 'For myself',
    subtitle: 'Track my meals, habits, and progress.',
  },
  {
    key: 'family',
    image: require('@/assets/images/onboarding/family.png'),
    title: 'For my family',
    subtitle: 'Support a parent, partner, or child.',
  },
  {
    key: 'coach',
    image: require('@/assets/images/onboarding/coach.png'),
    title: 'For my clients',
    subtitle: 'Use Tistra Health as a coach, trainer, or gym.',
  },
];

// Shared by select-product.tsx (pre-login: which scoped account to sign
// into, see lib/auth.ts#scopedEmail) and (app)/index.tsx's dual-role
// fallback (post-login: which dashboard to view, for an account that has
// both) — same illustrated cards + Continue step in both places rather
// than two differently-styled pickers for what reads as the same choice to
// the user. Post-login, "self" and "family" both resolve to the same
// /adults route (there's no further distinction to make once already
// authenticated); kept as three options anyway for one consistent design.
export function ProductPicker({
  headline,
  subhead,
  onContinue,
}: {
  headline: string;
  subhead: string;
  onContinue: (selected: ProductKey) => void;
}) {
  const theme = useTheme();
  const [selected, setSelected] = useState<ProductKey | null>(null);

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ThemedText type="subtitle" style={styles.headline}>
          {headline}
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.subhead}>
          {subhead}
        </ThemedText>

        {OPTIONS.map((option) => {
          const active = option.key === selected;
          return (
            <Pressable
              key={option.key}
              onPress={() => setSelected(option.key)}
              style={[styles.card, { borderColor: active ? '#5715CE' : theme.backgroundSelected }]}>
              <ThemedView type="backgroundElement" style={styles.imageWrap}>
                <Image style={styles.image} source={option.image} contentFit="contain" />
              </ThemedView>
              <ThemedView style={styles.cardBody}>
                <ThemedView style={styles.cardText}>
                  <ThemedText type="default" style={styles.cardTitle}>
                    {option.title}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {option.subtitle}
                  </ThemedText>
                </ThemedView>
                <ThemedView
                  style={[styles.radio, { borderColor: active ? '#5715CE' : theme.backgroundSelected }, active && styles.radioActive]}>
                  {active && <ThemedView style={styles.radioDot} />}
                </ThemedView>
              </ThemedView>
            </Pressable>
          );
        })}
      </ScrollView>

      <Pressable
        style={[styles.continueButton, !selected && styles.continueButtonDisabled]}
        disabled={!selected}
        onPress={() => selected && onContinue(selected)}>
        <ThemedText style={styles.continueText}>Continue</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  scroll: {
    paddingBottom: Spacing.three,
  },
  headline: {
    fontSize: 24,
    lineHeight: 30,
    marginBottom: Spacing.one,
  },
  subhead: {
    marginBottom: Spacing.four,
  },
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
    alignItems: 'flex-start',
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
  radio: {
    marginTop: Spacing.half,
    height: 24,
    width: 24,
    borderRadius: Spacing.four,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: {
    backgroundColor: '#5715CE',
  },
  radioDot: {
    height: 10,
    width: 10,
    borderRadius: Spacing.two,
    backgroundColor: '#ffffff',
  },
  continueButton: {
    backgroundColor: '#5715CE',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginBottom: Spacing.four,
  },
  continueButtonDisabled: {
    opacity: 0.4,
  },
  continueText: {
    color: '#ffffff',
    fontWeight: '600',
  },
});
