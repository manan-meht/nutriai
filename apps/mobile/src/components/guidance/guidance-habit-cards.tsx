import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { GM } from '@/constants/guidance-theme';
import { habitNextText, habitSoFarText, habitUnclearText, Possessive, type GuidanceViewer } from '@/lib/guidance-format';
import type { HabitOption, HabitVariant, HabitView } from '@/lib/guidance-types';

import { Card, ErrorLine, GText, PrimaryButton, QuietButton } from './ui';
import { useGuidanceAction, type GuidanceActions } from './use-guidance';

// The week's one change: proposed on Today, tracked on Progress. Mirrors the
// web's GuidanceHabitCards.tsx. Both cards read the same HabitView from the
// server, so they can't disagree.

function Marks({ marks }: { marks: boolean[] }) {
  return (
    <View style={styles.marks} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {marks.map((m, i) =>
        m ? (
          <View key={i} style={[styles.mark, { backgroundColor: GM.accent }]}>
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
              <Path d="M5 12l5 5 9-10" stroke={GM.onAccent} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </View>
        ) : (
          <View key={i} style={[styles.mark, { borderWidth: 2, borderColor: GM.textMuted }]} />
        )
      )}
    </View>
  );
}

/** Picking a habit: the idea, then "I'll try this" or "Something easier". */
function Chooser({ option, actions, onDone }: { option: HabitOption; actions?: GuidanceActions; onDone?: () => void }) {
  const [variant, setVariant] = useState<HabitVariant>('standard');
  const { run, pending, error } = useGuidanceAction();
  return (
    <>
      <GText variant="h2" style={{ marginTop: 8 }}>
        {option.title}
      </GText>
      <GText variant="body" style={{ marginTop: 8 }}>
        {option.change[variant]}
      </GText>
      <GText variant="small" tone="secondary" italic style={{ marginTop: 4 }}>
        {option.evidence.observation ? `Why: ${option.evidence.observation} ` : ''}
        {option.reason}
      </GText>
      {actions && (
        <View style={styles.actions}>
          <PrimaryButton
            label="I'll try this"
            accessibilityLabel={`I'll try this: ${option.change[variant]}`}
            disabled={pending}
            onPress={() => run(() => actions.chooseHabit({ key: option.key, variant }), onDone)}
          />
          <QuietButton
            label={variant === 'standard' ? 'Something easier' : 'Back to the first idea'}
            disabled={pending}
            onPress={() => setVariant((v) => (v === 'standard' ? 'easier' : 'standard'))}
          />
        </View>
      )}
      <ErrorLine error={error} />
    </>
  );
}

export function HabitTodayCard({ habit, actions }: { habit: HabitView; actions?: GuidanceActions }) {
  const [changing, setChanging] = useState(false);
  const current = habit.current;
  const proposal = habit.options[0];

  let body;
  if (current && !changing) {
    const p = current.progress;
    body = (
      <>
        <GText variant="h2" style={{ marginTop: 8 }}>
          {current.title}
        </GText>
        <GText variant="body" style={{ marginTop: 8 }}>
          {current.change[current.variant]}
        </GText>
        <View style={[styles.row, { marginTop: 14 }]}>
          <Marks marks={p.marks} />
          <GText variant="small" tone="secondary">
            {habitSoFarText(p)}
          </GText>
        </View>
        {actions && habit.options.length > 0 && (
          <QuietButton label="Change this week's habit" onPress={() => setChanging(true)} style={{ marginTop: 6 }} />
        )}
      </>
    );
  } else if (proposal) {
    body = (
      <Chooser
        option={changing ? (habit.options.find((o) => o.key !== current?.key) ?? proposal) : proposal}
        actions={actions}
        onDone={() => setChanging(false)}
      />
    );
  } else {
    body = (
      <>
        <GText variant="h2" style={{ marginTop: 8 }}>
          No change suggested this week
        </GText>
        <GText variant="body" tone="secondary" style={{ marginTop: 8 }}>
          The meals logged before this week don&apos;t point to one clear change. Keep logging, and a habit will be suggested when one
          stands out.
        </GText>
      </>
    );
  }

  return (
    <Card accessibilityLabel="One change this week">
      <GText variant="eyebrow" tone="accent">
        One change this week
      </GText>
      {body}
    </Card>
  );
}

export function HabitProgressCard({ habit, viewer, actions }: { habit: HabitView; viewer: GuidanceViewer; actions?: GuidanceActions }) {
  const [adjusting, setAdjusting] = useState(false);
  const { run, pending, error } = useGuidanceAction();
  const current = habit.current;
  const eyebrow = `${Possessive(viewer)} weekly habit`;

  if (!current || adjusting) {
    const option = adjusting ? (habit.options.find((o) => o.key !== current?.key) ?? habit.options[0]) : habit.options[0];
    return (
      <Card accessibilityLabel="Weekly habit">
        <GText variant="eyebrow" tone="secondary">
          {eyebrow}
        </GText>
        {option ? (
          <Chooser option={option} actions={actions} onDone={() => setAdjusting(false)} />
        ) : (
          <GText variant="body" tone="secondary" style={{ marginTop: 8 }}>
            No habit chosen this week, and no clear change to suggest yet.
          </GText>
        )}
        {adjusting && current && (
          <QuietButton label={`Keep ${current.shortTitle.toLowerCase()}`} onPress={() => setAdjusting(false)} style={{ marginTop: 6 }} />
        )}
      </Card>
    );
  }

  const p = current.progress;
  return (
    <Card accessibilityLabel="Weekly habit">
      <GText variant="eyebrow" tone="secondary">
        {eyebrow}
      </GText>
      <GText variant="h2" style={{ marginTop: 8 }}>
        {current.shortTitle}
      </GText>
      <View style={[styles.row, { marginTop: 14, justifyContent: 'space-between' }]}>
        <View accessible accessibilityLabel={`${p.successes} of ${p.eligible} logged ${p.noun}`}>
          <GText variant="display" style={{ fontVariant: ['tabular-nums'] }}>
            {p.successes} of {p.eligible}
          </GText>
          <GText variant="small" tone="secondary">
            logged {p.noun} {current.key === 'log_every_meal' ? 'had every meal logged' : 'included the planned change'}
          </GText>
        </View>
        <Marks marks={p.marks} />
      </View>
      {p.unclear > 0 && (
        <GText variant="caption" tone="muted" style={{ marginTop: 8 }}>
          {habitUnclearText(p.unclear)}
        </GText>
      )}
      <GText variant="body" style={{ marginTop: 14 }}>
        {current.keptForNextWeek ? 'Kept for next week.' : habitNextText(p)}
      </GText>
      {actions && !current.keptForNextWeek && (
        <View style={styles.actions}>
          <PrimaryButton label="Keep this habit" disabled={pending} onPress={() => run(() => actions.chooseHabit({ when: 'next_week' }))} />
          {habit.options.some((o) => o.key !== current.key) && (
            <QuietButton label="Adjust" accessibilityLabel="Adjust: choose a different habit" onPress={() => setAdjusting(true)} />
          )}
        </View>
      )}
      <ErrorLine error={error} />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  marks: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  mark: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 20, rowGap: 6, marginTop: 16 },
});
