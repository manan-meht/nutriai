import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GM, GM_TAP } from '@/constants/guidance-theme';
import {
  foodsTitle,
  greeting,
  longDate,
  MAIN_SLOTS,
  mealLabel,
  mealSummaryLine,
  mealValuesLine,
  mealWhen,
  nextMealHeading,
  possessive,
  Possessive,
  type GuidanceViewer,
} from '@/lib/guidance-format';
import type { GuidanceDashboard, GuidanceMealRow, NutrientKey } from '@/lib/guidance-types';

import { GuidanceNextMeal } from './guidance-next-meal';
import { HabitTodayCard } from './guidance-habit-cards';
import { Card, Chevron, ErrorLine, GText, NutrientRow, QuietButton, styles as ui } from './ui';
import { useGuidanceAction, type GuidanceActions } from './use-guidance';

// The Today tab: what to do next, and where the day stands. Mirrors the
// web's GuidanceTodayTab.tsx. The next-meal card is the one light surface on
// the page, so it reads first.

export function MealDetail({ meal }: { meal: GuidanceMealRow }) {
  return (
    <View style={{ gap: 6 }}>
      {meal.foods.length > 0 && (
        <View style={{ gap: 2 }}>
          {meal.foods.map((f, i) => (
            <GText key={i} variant="small" tone="secondary">
              {f.name}
              {f.quantity ? <GText variant="small" tone="muted">{` · ${f.quantity}`}</GText> : null}
            </GText>
          ))}
        </View>
      )}
      <GText variant="small" style={ui.tabular}>
        {mealValuesLine(meal)}
      </GText>
    </View>
  );
}

/** The hero card: the next meal, planned or suggested. */
function NextMealCard({ guidance, viewer, actions }: { guidance: GuidanceDashboard; viewer: GuidanceViewer; actions?: GuidanceActions }) {
  const next = guidance.nextSteps?.nextMeal ?? null;
  const { slot, headline, subline } = nextMealHeading(guidance);
  return (
    <View style={styles.hero}>
      <Text style={styles.heroEyebrow}>
        {Possessive(viewer)} next meal · {slot}
        {next?.isTomorrow ? ' · tomorrow' : ''}
      </Text>
      <Text accessibilityRole="header" style={styles.heroTitle}>
        {headline}
      </Text>
      <Text style={styles.heroSub}>{subline}</Text>
      {next && <GuidanceNextMeal key={`${next.date}:${next.slot}`} nextMeal={next} actions={actions} />}
    </View>
  );
}

/** Today's main meals whose time has passed with nothing logged: "Mark as
 * skipped" makes the day complete without adding anything to it. */
function SkipPrompts({ guidance, actions }: { guidance: GuidanceDashboard; actions?: GuidanceActions }) {
  const { run, pending, error } = useGuidanceAction();
  const prompts = guidance.nextSteps?.skipPrompts ?? [];
  const skipped = guidance.skips.filter((s) => s.date === guidance.date && MAIN_SLOTS.includes(s.slot));
  if (!actions || (prompts.length === 0 && skipped.length === 0)) return null;
  return (
    <View style={ui.divider}>
      {prompts.map((slot) => (
        <View key={slot} style={styles.skipRow}>
          <GText variant="small" tone="secondary">
            No {slot} logged.
          </GText>
          <QuietButton
            label="Mark as skipped"
            accessibilityLabel={`Mark ${slot} as skipped`}
            disabled={pending}
            onPress={() => run(() => actions.setMealSkipped({ date: guidance.date, slot, skipped: true }))}
          />
        </View>
      ))}
      {skipped.map((s) => (
        <View key={s.slot} style={styles.skipRow}>
          <GText variant="small" tone="secondary">
            {mealLabel(s.slot)} skipped.
          </GText>
          <QuietButton
            label="Undo"
            accessibilityLabel={`Undo: ${s.slot} wasn't skipped`}
            disabled={pending}
            onPress={() => run(() => actions.setMealSkipped({ date: guidance.date, slot: s.slot, skipped: false }))}
          />
        </View>
      ))}
      <ErrorLine error={error} />
    </View>
  );
}

function TodaySoFar({ guidance, actions }: { guidance: GuidanceDashboard; actions?: GuidanceActions }) {
  const [open, setOpen] = useState(false);
  const totals = guidance.today?.totals;
  if (!totals) return null;
  const count = totals.mealCount;
  return (
    <Card accessibilityLabel="Today so far">
      <GText variant="h1" accessibilityRole="header">
        Today so far
      </GText>
      <GText variant="body" tone="secondary" style={{ marginTop: 2 }}>
        {count === 0 ? 'No meals logged yet' : `${count} ${count === 1 ? 'meal' : 'meals'} logged`} · day in progress
      </GText>
      <View style={{ marginTop: 18, gap: 18 }}>
        <NutrientRow day={totals.protein} nutrient="protein" mealCount={count} />
        <NutrientRow day={totals.calories} nutrient="calories" mealCount={count} />
        {open &&
          (['carbs', 'fat', 'fiber'] as const satisfies readonly NutrientKey[]).map((key) => (
            <NutrientRow key={key} day={totals[key]} nutrient={key} mealCount={count} />
          ))}
      </View>
      <GText variant="small" tone="muted" italic style={{ marginTop: 16 }}>
        Based on logged meals{totals.hasIncompleteData ? '; some are missing an estimate' : ''}
      </GText>
      <QuietButton
        label={open ? 'Fewer nutrients' : 'All nutrients'}
        arrow
        expanded={open}
        accessibilityLabel={open ? 'Show fewer nutrients' : 'Show all nutrients'}
        onPress={() => setOpen((o) => !o)}
        style={{ marginTop: 4 }}
      />
      <SkipPrompts guidance={guidance} actions={actions} />
    </Card>
  );
}

function RecentMeal({ guidance }: { guidance: GuidanceDashboard }) {
  const [open, setOpen] = useState(false);
  const meal = guidance.meals[0];
  if (!meal) return null;
  const when = mealWhen(meal.loggedAt, guidance.date, guidance.timezone);
  return (
    <Card accessibilityLabel="Most recent meal">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${mealLabel(meal.mealType)}, ${when}: ${foodsTitle(meal.foods)}. ${mealSummaryLine(meal)}`}
        accessibilityHint={open ? 'Hides the meal details' : 'Shows what was in the meal'}
        onPress={() => setOpen((o) => !o)}
        style={styles.recentRow}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <GText variant="small" tone="accent" style={{ fontWeight: '600' }}>
            {mealLabel(meal.mealType)} · {when}
          </GText>
          <GText variant="body" numberOfLines={1} style={{ fontWeight: '700', marginTop: 2 }}>
            {foodsTitle(meal.foods)}
          </GText>
          <GText variant="small" tone="secondary" style={[ui.tabular, { marginTop: 2 }]}>
            {mealSummaryLine(meal)}
          </GText>
        </View>
        <Chevron direction={open ? 'down' : 'right'} />
      </Pressable>
      {open && (
        <View style={ui.divider}>
          <MealDetail meal={meal} />
          <GText variant="caption" tone="muted" style={{ marginTop: 8 }}>
            Estimated from the photo; portions are approximate.
          </GText>
        </View>
      )}
    </Card>
  );
}

export function GuidanceTodayTab({
  guidance,
  viewer,
  firstName,
  onShowHistory,
  actions,
}: {
  guidance: GuidanceDashboard;
  viewer: GuidanceViewer;
  /** The tracked person's first name, for the greeting when it's their own view. */
  firstName: string;
  onShowHistory: () => void;
  /** Absent for a read-only view: the cards show, the buttons don't. */
  actions?: GuidanceActions;
}) {
  const { title, subtitle } = greeting(guidance, viewer, firstName);
  const canLog = viewer.kind === 'self' && !!guidance.logMealHref;
  return (
    <View>
      <GText variant="body" tone="secondary">
        {longDate(guidance.date)}
      </GText>
      <GText variant="display" accessibilityRole="header" style={{ marginTop: 2 }}>
        {title}
      </GText>
      <GText variant="h3" tone="accent" style={{ marginTop: 2, fontWeight: '500' }}>
        {subtitle}
      </GText>

      <View style={{ marginTop: 20, gap: 14 }}>
        <NextMealCard guidance={guidance} viewer={viewer} actions={actions} />
        <TodaySoFar guidance={guidance} actions={actions} />
        {guidance.nextSteps && <HabitTodayCard habit={guidance.nextSteps.habit} actions={actions} />}
        <RecentMeal guidance={guidance} />
      </View>

      <View style={{ marginTop: 16, gap: 4 }}>
        {!canLog && (
          <GText variant="small" tone="secondary">
            {viewer.kind === 'self'
              ? 'Log a meal by sending a photo to Tistra on WhatsApp.'
              : `${viewer.name} logs meals by sending a photo to Tistra on WhatsApp.`}
          </GText>
        )}
        {guidance.meals.length > 0 && (
          <QuietButton
            label={`View ${viewer.kind === 'self' ? 'meal' : `${possessive(viewer)} meal`} history`}
            arrow
            onPress={onShowHistory}
          />
        )}
        {/* With a log link, "Log a meal" is the screen's fixed bottom bar
            (guidance-screen.tsx), as on the web's phone layout. */}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: GM.hero, borderRadius: 18, padding: 20 },
  heroEyebrow: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: GM.heroAccent },
  heroTitle: { fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.3, color: GM.heroText, marginTop: 6 },
  heroSub: { fontSize: 16, lineHeight: 22, color: GM.heroTextSecondary, marginTop: 4 },
  skipRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 8 },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: GM_TAP },
});
