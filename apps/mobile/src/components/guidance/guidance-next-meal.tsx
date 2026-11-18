import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { GM } from '@/constants/guidance-theme';
import { suggestionEstimateLine, fmt } from '@/lib/guidance-format';
import type { MealSuggestion, NextMealView } from '@/lib/guidance-types';

import { ErrorLine, PrimaryButton, QuietButton } from './ui';
import { useGuidanceAction, type GuidanceActions } from './use-guidance';

// The inside of the next-meal card: a plan if one's made, otherwise the
// suggestion with "Plan this meal" and "Show another option". Mirrors the
// web's GuidanceNextMeal.tsx. Planning never counts as eating; "I had this"
// logs the planned portions as a meal, once, and a photo of the meal does
// the same job. Everything here sits on the one light (hero) surface.

const ROLE_COLOURS: Record<string, string> = { protein: '#7B5CE0', dal: '#B79A3E', base: '#EFE6CF', veg: '#4E9A5B', fruit: '#E59A45' };

/** A plate drawn from the meal's own proportions: decorative, in place of
 * a food photo the product doesn't have. */
function Plate({ suggestion, size = 76 }: { suggestion: MealSuggestion; size?: number }) {
  const total = suggestion.components.reduce((s, c) => s + c.grams, 0) || 1;
  const sweeps = suggestion.components.map((c) => (c.grams / total) * 360);
  // Each wedge starts where the grams before it end.
  const starts = sweeps.map((_, i) => sweeps.slice(0, i).reduce((a, s) => a + s, -90));
  const arcs = suggestion.components.map((c, i) => {
    const sweep = sweeps[i];
    const start = starts[i];
    const r = 52;
    const toXY = (a: number) => [60 + r * Math.cos((a * Math.PI) / 180), 60 + r * Math.sin((a * Math.PI) / 180)];
    const [x1, y1] = toXY(start);
    const [x2, y2] = toXY(start + sweep - 0.01);
    const large = sweep > 180 ? 1 : 0;
    const d = `M60 60 L${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    return <Path key={c.id} d={d} fill={ROLE_COLOURS[c.role] ?? '#ccc'} />;
  });
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Svg width={size} height={size} viewBox="0 0 120 120">
        <Circle cx={60} cy={60} r={58} fill="#FFFFFF" />
        {arcs}
        <Circle cx={60} cy={60} r={58} fill="none" stroke="rgba(28,21,48,0.12)" strokeWidth={2} />
      </Svg>
    </View>
  );
}

function SuggestionBody({ suggestion }: { suggestion: MealSuggestion }) {
  const datasets = [...new Set(suggestion.components.map((c) => c.source.dataset))].join(', ');
  return (
    <View>
      <View style={styles.bodyRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title}>{suggestion.title}</Text>
          {suggestion.components.map((c) => (
            <Text key={c.id} style={styles.portion}>
              {c.portion}
            </Text>
          ))}
        </View>
        <Plate suggestion={suggestion} />
      </View>
      <Text style={[styles.secondary, { marginTop: 8 }]}>{suggestionEstimateLine(suggestion.estimate)}</Text>
      {suggestion.brings ? (
        <Text style={styles.brings}>
          Also a source of {suggestion.brings.label.toLowerCase()}: about {fmt(suggestion.brings.amount)} {suggestion.brings.unit}.
        </Text>
      ) : null}
      <Text style={styles.muted}>
        Portions are a guide, sized to what&apos;s left today. Estimates from {datasets}.
      </Text>
    </View>
  );
}

export function GuidanceNextMeal({ nextMeal, actions }: { nextMeal: NextMealView; actions?: GuidanceActions }) {
  const [index, setIndex] = useState(0);
  const [changing, setChanging] = useState(false);
  const { run, pending, error } = useGuidanceAction();
  const result = nextMeal.suggestions;
  const plan = nextMeal.plan;

  const notes =
    result.notes.length > 0 ? (
      <View style={{ marginTop: 12, gap: 4 }}>
        {result.notes.map((n) => (
          <Text key={n} style={styles.note}>
            {n}
          </Text>
        ))}
      </View>
    ) : null;
  const errorLine = <ErrorLine error={error} color={GM.heroError} style={{ fontWeight: '600' }} />;

  if (plan && !changing) {
    return (
      <View style={{ marginTop: 18 }}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{plan.logged ? 'Planned · logged' : 'Planned'}</Text>
        </View>
        <SuggestionBody suggestion={plan.suggestion} />
        {plan.logged ? (
          <Text style={[styles.secondary, styles.footer]}>
            This meal is logged. The logged meal is what counts; the plan isn&apos;t added again.
          </Text>
        ) : (
          actions && (
            <>
              <View style={styles.actions}>
                {!nextMeal.isTomorrow && (
                  <PrimaryButton
                    hero
                    label="I had this"
                    accessibilityLabel={`I had this: log ${plan.suggestion.title} as eaten`}
                    disabled={pending}
                    onPress={() => run(() => actions.confirmPlannedMeal(plan.id))}
                  />
                )}
                <QuietButton label="Change" color={GM.heroAccent} disabled={pending} onPress={() => setChanging(true)} accessibilityLabel="Change the planned meal" />
                <QuietButton label="Remove plan" color={GM.heroAccent} disabled={pending} onPress={() => run(() => actions.cancelPlan(plan.id))} />
              </View>
              <Text style={[styles.secondary, styles.footer]}>
                A plan isn&apos;t counted. &ldquo;I had this&rdquo; logs these portions, or send a photo of what you eat.
              </Text>
            </>
          )
        )}
        {errorLine}
      </View>
    );
  }

  if (result.kind === 'fallback') {
    return (
      <View style={{ marginTop: 18 }}>
        <Text style={styles.secondaryLarge}>{result.message}</Text>
        {notes}
      </View>
    );
  }

  const options = result.options;
  const current = options[index % options.length];
  return (
    <View style={{ marginTop: 18 }}>
      <SuggestionBody suggestion={current} />
      {actions && (
        <View style={styles.actions}>
          <PrimaryButton
            hero
            label={plan ? 'Plan this instead' : 'Plan this meal'}
            accessibilityLabel={`${plan ? 'Plan this instead' : 'Plan this meal'}: ${current.title}`}
            disabled={pending}
            onPress={() => run(() => actions.planMeal(current.id), () => setChanging(false))}
          />
          {options.length > 1 && (
            <QuietButton label="Show another option" color={GM.heroAccent} disabled={pending} onPress={() => setIndex((i) => i + 1)} />
          )}
          {plan && <QuietButton label="Keep the plan" color={GM.heroAccent} onPress={() => setChanging(false)} />}
        </View>
      )}
      {errorLine}
      {notes}
      <Text style={[styles.secondary, styles.footer]}>Plan first. Confirm what you eat later.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bodyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { fontSize: 18, lineHeight: 24, fontWeight: '700', color: GM.heroText },
  portion: { fontSize: 16, lineHeight: 23, color: GM.heroText, marginTop: 2 },
  secondary: { fontSize: 14, lineHeight: 20, color: GM.heroTextSecondary },
  secondaryLarge: { fontSize: 16, lineHeight: 23, color: GM.heroTextSecondary },
  brings: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: GM.heroAccent, marginTop: 4 },
  muted: { fontSize: 14, lineHeight: 20, fontStyle: 'italic', color: GM.heroTextMuted, marginTop: 4 },
  note: { fontSize: 12, lineHeight: 17, color: GM.heroTextSecondary },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 18, rowGap: 6, marginTop: 16 },
  footer: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: GM.heroBorder },
  badge: { alignSelf: 'flex-start', backgroundColor: GM.heroButton, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 8 },
  badgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});
