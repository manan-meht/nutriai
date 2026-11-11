import { useMemo, useState, type RefObject } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';

import { GM, GM_TAP } from '@/constants/guidance-theme';
import { compare, datesBetween, daysIn, nutrientStats, periodFor, type DaySummary, type DayStatus } from '@/lib/guidance-aggregation';
import {
  amount,
  assessmentText,
  chartScale,
  clockTime,
  dayMonthIn,
  dayOfMonth,
  daySkipSlots,
  dayTotalsLine,
  fmt,
  formatDay,
  isUnknownDay,
  labelOf,
  localDate,
  mealLabel,
  overIsNotable,
  Possessive,
  progressHeadline,
  rangeText,
  roughly,
  timezoneNote,
  unitOf,
  weekdayShort,
  weightsIn,
  type GuidanceViewer,
} from '@/lib/guidance-format';
import type { GuidanceDashboard, NutritionGoal, PeriodKind } from '@/lib/guidance-types';

import { HabitProgressCard } from './guidance-habit-cards';
import { MicronutrientCard } from './guidance-micronutrients';
import { MealDetail } from './guidance-today-tab';
import { Card, Chevron, ErrorLine, GText, QuietButton, Segmented, styles as ui } from './ui';
import { useGuidanceAction, type GuidanceActions } from './use-guidance';

// The Progress tab. Mirrors the web's GuidanceProgressTab.tsx. Every number
// on it comes from lib/guidance-aggregation (the web's one aggregation
// service, copied verbatim), so the headline, the stats and the chart can't
// disagree, with each other or with the web.

const STATUS_LABEL: Record<DayStatus, string> = {
  complete: 'Complete',
  partial: 'Partial',
  unlogged: 'Not logged',
  in_progress: 'In progress',
};

type ChartNutrient = 'protein' | 'calories' | 'fiber';

const CHART_HEIGHT = 160;

/** The dashed target line: an SVG line, since a single-sided dashed border
 * draws solid on iOS. */
function TargetLine({ bottomPct }: { bottomPct: number }) {
  return (
    <View pointerEvents="none" style={[styles.targetLine, { bottom: `${Math.min(100, bottomPct)}%` }]}>
      <Svg width="100%" height={2}>
        <Line x1="0" y1="1" x2="100%" y2="1" stroke={GM.textSecondary} strokeWidth={2} strokeDasharray="6 4" />
      </Svg>
    </View>
  );
}

/** A partial day: striped, so it reads as "at least" rather than a figure. */
function HatchedBar({ heightPct, fill, id }: { heightPct: number; fill: string; id: string }) {
  return (
    <View style={[styles.bar, { height: `${heightPct}%`, borderWidth: 1, borderColor: fill, overflow: 'hidden' }]}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id={id} patternUnits="userSpaceOnUse" width={7} height={7} patternTransform="rotate(45)">
            <Rect x={0} y={0} width={3} height={7} fill={fill} />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

function AssessmentCard({
  summaries,
  guidance,
  viewer,
  periodKind,
}: {
  summaries: DaySummary[];
  guidance: GuidanceDashboard;
  viewer: GuidanceViewer;
  periodKind: PeriodKind;
}) {
  const [nutrient, setNutrient] = useState<ChartNutrient>('protein');
  const [howOpen, setHowOpen] = useState(false);
  const period = periodFor(periodKind, guidance.date);
  const days = daysIn(summaries, period).sort((a, b) => a.date.localeCompare(b.date));
  const stats = nutrientStats(days, nutrient);
  const comparison = compare(stats, nutrientStats(daysIn(summaries, period.previous), nutrient));
  const t = assessmentText(stats, comparison, nutrient, periodKind);
  const { singleTarget, maxValue } = chartScale(days, nutrient);
  const byDate = new Map(days.map((d) => [d.date, d]));
  const slots = datesBetween(period.start, period.lastDay);
  const narrow = slots.length > 7;
  const gap = narrow ? 2 : 6;

  const chartLabel = `${labelOf(nutrient)} per day, ${rangeText(period.start, period.lastDay)}, against the daily target${
    singleTarget != null ? ` of ${amount(singleTarget, nutrient)}` : ''
  }. ${days
    .map((d) => {
      const day = d.totals[nutrient];
      const value =
        d.status === 'unlogged'
          ? 'not logged'
          : isUnknownDay(day, d.totals.mealCount)
            ? 'unknown'
            : `${day.isIncomplete ? 'at least ' : ''}${amount(roughly(day.consumed, nutrient), nutrient)}`;
      return `${formatDay(d.date)}: ${value}, ${STATUS_LABEL[d.status].toLowerCase()}`;
    })
    .join('; ')}.`;

  return (
    <Card accessibilityLabel="Assessment">
      <GText variant="h1" accessibilityRole="header">
        {progressHeadline(days, guidance.date, viewer, periodKind)}
      </GText>
      <GText variant="body" tone="secondary" style={{ marginTop: 6 }}>
        {t.sentence}
      </GText>

      <View style={styles.stats}>
        <View style={styles.stat} accessible accessibilityLabel={`Average ${t.name}: ${t.average === '–' ? 'none yet' : t.average}. ${t.averageCaption}`}>
          <GText variant="display" style={ui.tabular}>
            {t.average}
          </GText>
          <GText variant="small" tone="secondary" style={{ marginTop: 2 }}>
            {t.averageCaption}
          </GText>
        </View>
        <View style={styles.statDivider} />
        <View
          style={[styles.stat, { paddingLeft: 16 }]}
          accessible
          accessibilityLabel={`Change from ${t.lastPeriod}: ${t.change === '–' ? 'not enough data' : t.change}. ${t.changeCaption}`}
        >
          <GText variant="display" style={ui.tabular}>
            {t.change}
          </GText>
          <GText variant="small" tone="secondary" style={{ marginTop: 2 }}>
            {t.changeCaption}
          </GText>
        </View>
      </View>

      <Segmented
        label="Nutrient"
        value={nutrient}
        onChange={setNutrient}
        options={(['protein', 'calories', 'fiber'] as const).map((k) => ({ value: k, label: labelOf(k) }))}
        style={{ marginTop: 20 }}
      />

      <GText variant="caption" tone="secondary" style={{ textAlign: 'right', marginTop: 14 }}>
        {singleTarget != null ? `Target ${amount(singleTarget, nutrient)}` : `Daily target (${unitOf(nutrient)}), which changed this ${periodKind}`}
      </GText>
      <View accessible accessibilityRole="image" accessibilityLabel={chartLabel} style={styles.chart}>
        {singleTarget != null && <TargetLine bottomPct={(singleTarget / maxValue) * 100} />}
        <View style={[StyleSheet.absoluteFill, styles.columns, { gap }]}>
          {slots.map((date) => {
            const d = byDate.get(date);
            if (!d) return <View key={date} style={styles.column} />;
            const day = d.totals[nutrient];
            const h = Math.max(3, (day.consumed / maxValue) * 100);
            const fill = day.over > 0 && overIsNotable(nutrient) ? GM.over : GM.accent;
            return (
              <View key={date} style={styles.column}>
                {singleTarget == null && <TargetLine bottomPct={(day.target / maxValue) * 100} />}
                {d.status === 'unlogged' ? (
                  <View style={styles.unlogged}>
                    {!narrow && <Text style={styles.unloggedText}>{'Not\nlogged'}</Text>}
                  </View>
                ) : d.status === 'complete' && !day.isIncomplete ? (
                  <View style={[styles.bar, { height: `${h}%`, backgroundColor: fill }]} />
                ) : d.status === 'in_progress' ? (
                  <View style={[styles.bar, styles.outlined, { height: `${h}%`, borderColor: fill }]} />
                ) : (
                  <HatchedBar heightPct={h} fill={fill} id={`hatch-${nutrient}-${date}`} />
                )}
              </View>
            );
          })}
        </View>
      </View>
      <View style={[styles.columns, { gap, marginTop: 6 }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {slots.map((date, i) => {
          const isToday = date === guidance.date;
          return (
            <Text
              key={date}
              numberOfLines={1}
              style={[styles.dayLabel, isToday && { color: GM.text, fontWeight: '700' }, narrow && { fontSize: 10 }]}
            >
              {narrow ? (i % 7 === 0 ? dayOfMonth(date) : '') : isToday ? 'Today' : weekdayShort(date)}
            </Text>
          );
        })}
      </View>

      <GText variant="small" tone="secondary" style={{ marginTop: 12 }}>
        {stats.counts.complete} complete · {stats.counts.partial} partial · {stats.counts.unlogged} not logged
        {stats.counts.in_progress > 0 ? ' · today in progress' : ''}
      </GText>
      <QuietButton label="How we calculate this" arrow expanded={howOpen} onPress={() => setHowOpen((o) => !o)} />

      {howOpen && (
        <View style={[ui.divider, { gap: 8, marginTop: 4 }]}>
          <GText variant="small" tone="secondary">
            A day is <GText variant="small" bold>complete</GText> when {guidance.expectedMealsPerDay} or more meals are logged (
            {guidance.expectedMealsIsDefault ? 'the usual default' : 'the usual number from setup'}) and every meal has an estimate for {t.name}.
            Solid bars are complete days, striped bars are partial, and dashed boxes weren&apos;t logged.
          </GText>
          <GText variant="small" tone="secondary">
            Averages use complete days only. Partial days and days with nothing logged are shown but not averaged, and a missing log is never
            counted as zero. Today is still in progress, so it&apos;s outlined and left out of every comparison.
          </GText>
          <GText variant="small" tone="secondary">
            A comparison needs at least 3 complete days in each period; with fewer it says so instead of showing a change. All values are
            estimates from meal photos.
          </GText>
        </View>
      )}
    </Card>
  );
}

const GOAL_LABEL: Record<NutritionGoal, string> = {
  reduce_weight: 'Lose weight',
  reduce_body_fat: 'Reduce body fat',
  gain_muscle: 'Build muscle',
  body_recomposition: 'Body recomposition',
  maintain_weight: 'Maintain weight',
  improve_nutrition: 'Improve nutrition',
  healthy_aging: 'Healthy ageing',
};
const WEIGHT_GOALS: NutritionGoal[] = ['reduce_weight', 'reduce_body_fat', 'gain_muscle', 'body_recomposition', 'maintain_weight'];

function hasGoalCard(guidance: GuidanceDashboard): boolean {
  return guidance.goals.some((g) => WEIGHT_GOALS.includes(g) || g === 'healthy_aging');
}

function GoalCard({ guidance, viewer, periodKind }: { guidance: GuidanceDashboard; viewer: GuidanceViewer; periodKind: PeriodKind }) {
  const weightGoal = guidance.goals.find((g) => WEIGHT_GOALS.includes(g));
  if (!weightGoal) {
    // Strength and function aren't measured anywhere in Tistra, so there's
    // nothing to add and no button: an honest note, not a dead control.
    if (!guidance.goals.includes('healthy_aging')) return null;
    return (
      <Card accessibilityLabel="Goal">
        <GText variant="eyebrow" tone="secondary">
          {Possessive(viewer)} goal · Healthy ageing
        </GText>
        <GText variant="h2" style={{ marginTop: 8 }}>
          Track what matters to {viewer.kind === 'self' ? 'you' : viewer.name}
        </GText>
        <GText variant="body" tone="secondary" style={{ marginTop: 10 }}>
          Strength and everyday function aren&apos;t measured in Tistra yet, so this goal&apos;s progress isn&apos;t shown here. The nutrition
          habits above are what Tistra can follow.
        </GText>
      </Card>
    );
  }

  const readings = weightsIn(guidance, periodKind);
  const first = readings[0];
  const last = readings[readings.length - 1];
  const when = (iso: string) => dayMonthIn(iso, guidance.timezone);

  return (
    <Card accessibilityLabel="Goal">
      <GText variant="eyebrow" tone="secondary">
        {Possessive(viewer)} goal · {GOAL_LABEL[weightGoal]}
      </GText>
      <GText variant="h2" style={{ marginTop: 8 }}>
        Weight
      </GText>
      {readings.length === 0 ? (
        <GText variant="body" tone="secondary" style={{ marginTop: 10 }}>
          No weight readings {periodKind === 'week' ? 'this week' : 'this month'}.{' '}
          {viewer.kind === 'coach' ? 'Add one in the biomarker log.' : 'Weight is updated from the profile details.'}
        </GText>
      ) : readings.length === 1 ? (
        <View style={{ marginTop: 10 }}>
          <GText variant="display" style={ui.tabular}>
            {first.weightKg.toFixed(1)} kg
          </GText>
          <GText variant="small" tone="secondary" style={{ marginTop: 2 }}>
            on {when(first.measuredAt)}. One reading isn&apos;t enough to show a change.
          </GText>
        </View>
      ) : (
        <View style={{ marginTop: 10 }}>
          <GText variant="display" style={ui.tabular}>
            {last.weightKg === first.weightKg
              ? 'No change'
              : `${last.weightKg > first.weightKg ? '+' : '−'}${Math.abs(last.weightKg - first.weightKg).toFixed(1)} kg`}
          </GText>
          <GText variant="small" tone="secondary" style={{ marginTop: 2 }}>
            {first.weightKg.toFixed(1)} kg on {when(first.measuredAt)} to {last.weightKg.toFixed(1)} kg on {when(last.measuredAt)},{' '}
            {readings.length} readings
          </GText>
        </View>
      )}
      <GText variant="caption" tone="muted" style={{ marginTop: 10 }}>
        Weight varies from day to day, and food records alone don&apos;t show a change in health.
      </GText>
    </Card>
  );
}

/** Days shown at a time in the history, so a long history stays short. */
const HISTORY_PAGE = 7;

/** For a recent past day: the main meals with nothing logged can be marked
 * skipped, and a skip can be taken back. */
function DaySkips({ date, guidance, actions }: { date: string; guidance: GuidanceDashboard; actions?: GuidanceActions }) {
  const { run, pending, error } = useGuidanceAction();
  const slots = daySkipSlots(date, guidance);
  if (!actions || !slots) return null;
  return (
    <View style={styles.skips}>
      {slots.map(({ slot, skipped }) =>
        skipped ? (
          <View key={slot} style={styles.skipItem}>
            <GText variant="small" tone="secondary">
              {mealLabel(slot)} skipped ·
            </GText>
            <QuietButton
              label="Undo"
              accessibilityLabel={`Undo: ${slot} on ${formatDay(date)} wasn't skipped`}
              disabled={pending}
              onPress={() => run(() => actions.setMealSkipped({ date, slot, skipped: false }))}
            />
          </View>
        ) : (
          <QuietButton
            key={slot}
            label={`Mark ${slot} skipped`}
            accessibilityLabel={`Mark ${slot} on ${formatDay(date)} as skipped`}
            disabled={pending}
            onPress={() => run(() => actions.setMealSkipped({ date, slot, skipped: true }))}
          />
        )
      )}
      <ErrorLine error={error} style={{ width: '100%' }} />
    </View>
  );
}

function DailyDetails({
  summaries,
  guidance,
  open,
  onToggle,
  actions,
  detailsRef,
}: {
  summaries: DaySummary[];
  guidance: GuidanceDashboard;
  open: boolean;
  onToggle: (open: boolean) => void;
  actions?: GuidanceActions;
  detailsRef?: RefObject<View | null>;
}) {
  // The whole history since Guidance started, not just the selected
  // period: this is where "View meal history" leads.
  const [shown, setShown] = useState(HISTORY_PAGE);
  const all = useMemo(() => [...summaries].sort((a, b) => b.date.localeCompare(a.date)), [summaries]);
  const days = all.slice(0, shown);
  const mealsOn = (date: string) => guidance.meals.filter((m) => localDate(m.loggedAt, guidance.timezone) === date);

  return (
    <View ref={detailsRef} collapsable={false}>
      <Card>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel="Daily details and meal history"
          accessibilityHint="Meals, nutrients and logging history"
          onPress={() => onToggle(!open)}
          style={styles.detailsHeader}
        >
          <View style={{ flex: 1 }}>
            <GText variant="h2">Daily details &amp; meal history</GText>
            <GText variant="small" tone="secondary" style={{ marginTop: 2 }}>
              Meals, nutrients and logging history
            </GText>
          </View>
          <Chevron direction={open ? 'up' : 'down'} />
        </Pressable>
        {open && (
          <View>
            {days.map((d) => (
              <View key={d.date} style={ui.divider}>
                <View style={ui.rowBetween}>
                  <GText variant="body" style={{ fontWeight: '600' }}>
                    {formatDay(d.date)}
                  </GText>
                  <GText variant="small" tone="secondary" style={{ flexShrink: 1, textAlign: 'right' }}>
                    {STATUS_LABEL[d.status]} · {d.totals.mealCount} {d.totals.mealCount === 1 ? 'meal' : 'meals'}
                    {d.skipped > 0 ? ` · ${d.skipped} skipped` : ''}
                  </GText>
                </View>
                <DaySkips date={d.date} guidance={guidance} actions={actions} />
                {d.status === 'unlogged' ? (
                  <GText variant="small" tone="secondary" style={{ marginTop: 4 }}>
                    Nothing logged. This isn&apos;t counted as zero intake.
                  </GText>
                ) : (
                  <>
                    <GText variant="small" tone="secondary" style={[ui.tabular, { marginTop: 4 }]}>
                      {dayTotalsLine(d.totals)}
                    </GText>
                    <View style={{ marginTop: 10, gap: 8 }}>
                      {mealsOn(d.date).map((m) => (
                        <View key={m.id} style={styles.mealBox}>
                          <GText variant="small" tone="accent" style={{ fontWeight: '600' }}>
                            {mealLabel(m.mealType)} · {clockTime(m.loggedAt, guidance.timezone)}
                          </GText>
                          <View style={{ marginTop: 4 }}>
                            <MealDetail meal={m} />
                          </View>
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </View>
            ))}
            {all.length > shown && <QuietButton label="Show earlier days" onPress={() => setShown((n) => n + HISTORY_PAGE)} style={{ marginTop: 8 }} />}
            <GText variant="caption" tone="muted" style={{ marginTop: 12 }}>
              All values are estimates from logged meals ({fmt(guidance.meals.length)} since Guidance started). Earlier days aren&apos;t shown.
            </GText>
          </View>
        )}
      </Card>
    </View>
  );
}

/** The viewer's own timezone, read once: the person's is named on screen
 * only when it differs. */
function viewerTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

export function GuidanceProgressTab({
  guidance,
  viewer,
  summaries,
  detailsOpen,
  onDetailsToggle,
  actions,
  detailsRef,
}: {
  guidance: GuidanceDashboard;
  viewer: GuidanceViewer;
  summaries: DaySummary[];
  detailsOpen: boolean;
  onDetailsToggle: (open: boolean) => void;
  actions?: GuidanceActions;
  detailsRef?: RefObject<View | null>;
}) {
  const [periodKind, setPeriodKind] = useState<PeriodKind>('week');
  const period = periodFor(periodKind, guidance.date);
  const tzNote = useMemo(() => timezoneNote(guidance.timezone, viewerTimezone()), [guidance.timezone]);
  const habitCard = guidance.nextSteps ? <HabitProgressCard habit={guidance.nextSteps.habit} viewer={viewer} actions={actions} /> : null;
  const goal = hasGoalCard(guidance) ? <GoalCard guidance={guidance} viewer={viewer} periodKind={periodKind} /> : null;

  return (
    <View>
      <GText variant="display" accessibilityRole="header">
        {Possessive(viewer)} progress
      </GText>
      <GText variant="h3" tone="secondary" style={{ marginTop: 2, fontWeight: '500' }}>
        Small changes, becoming habits.
      </GText>
      <Segmented
        label="Period"
        value={periodKind}
        onChange={setPeriodKind}
        options={[
          { value: 'week', label: 'This week' },
          { value: 'month', label: 'This month' },
        ]}
        style={{ marginTop: 16 }}
      />
      <GText variant="small" tone="secondary" style={{ marginTop: 8 }}>
        {rangeText(period.start, period.lastDay)}
        {tzNote ? ` · ${tzNote}` : ''}
      </GText>

      <View style={{ marginTop: 16, gap: 14 }}>
        <AssessmentCard summaries={summaries} guidance={guidance} viewer={viewer} periodKind={periodKind} />
        {habitCard}
        {goal}
        {guidance.micronutrients ? (
          <MicronutrientCard panel={guidance.micronutrients} periodKind={periodKind} viewer={viewer} actions={actions} />
        ) : (
          <Card accessibilityLabel="Vitamins and minerals">
            <GText variant="eyebrow" tone="secondary">
              Vitamins &amp; minerals
            </GText>
            <GText variant="h2" style={{ marginTop: 8 }}>
              Not estimated yet
            </GText>
            <GText variant="body" tone="secondary" style={{ marginTop: 8 }}>
              Meal photos currently give energy, protein, carbs, fat and fibre. Vitamins and minerals aren&apos;t estimated yet.
            </GText>
          </Card>
        )}
        <DailyDetails
          summaries={summaries}
          guidance={guidance}
          open={detailsOpen}
          onToggle={onDetailsToggle}
          actions={actions}
          detailsRef={detailsRef}
        />
        <GText variant="small" tone="muted" italic>
          Missing logs aren&apos;t counted as zero intake.
        </GText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', marginTop: 20 },
  stat: { flex: 1, paddingRight: 12 },
  statDivider: { width: 1, backgroundColor: GM.borderStrong },
  chart: { height: CHART_HEIGHT, marginTop: 4, borderBottomWidth: 1, borderBottomColor: GM.borderStrong },
  columns: { flexDirection: 'row', alignItems: 'flex-end' },
  column: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  targetLine: { position: 'absolute', left: 0, right: 0, height: 2, zIndex: 1 },
  bar: { width: '100%', borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  // Uniform on every side: iOS draws a dashed border solid otherwise.
  outlined: { borderWidth: 2, borderStyle: 'dashed' },
  unlogged: {
    height: '45%',
    width: '100%',
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: GM.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unloggedText: { fontSize: 10, lineHeight: 12, color: GM.textSecondary, textAlign: 'center' },
  dayLabel: { flex: 1, textAlign: 'center', fontSize: 12, color: GM.textSecondary },
  detailsHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: GM_TAP },
  skips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 16, marginTop: 2 },
  skipItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mealBox: { backgroundColor: GM.raised, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
});
