import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GuidanceModeSwitch, isSwitchView } from '@/components/guidance/guidance-mode-switch';
import { GuidanceSetupFrame, GuidanceSetupPanel } from '@/components/guidance/guidance-panel';
import { GuidanceScreen } from '@/components/guidance/guidance-screen';
import type { GuidanceActions, GuidanceResult } from '@/components/guidance/use-guidance';
import { GM } from '@/constants/guidance-theme';
import { guidancePreviewProposal, guidancePreviewResponse, type GuidancePreviewScenario } from '@/lib/guidance-fixture';
import { viewerFor } from '@/lib/guidance-format';
import type { GuidanceActionResult } from '@/lib/guidance-types';

// DEVELOPMENT ONLY. Guidance mode's screens on SAMPLE data
// (lib/guidance-fixture.ts), with no sign-in and no network, for checking
// layout in the simulator: open tistramobile://guidance-preview (or
// /guidance-preview from the dev menu's URL). Actions answer "ok" after a
// moment and change nothing.
//
// Never reachable in a release build: outside __DEV__ it redirects home
// before rendering anything.

export default function GuidancePreviewRoute() {
  if (!__DEV__) return <Redirect href="/" />;
  return <GuidancePreview />;
}

const SCENARIOS: Array<{ value: GuidancePreviewScenario; label: string }> = [
  { value: 'self', label: 'Self' },
  { value: 'family', label: 'Family' },
  { value: 'coach', label: 'Coach' },
  { value: 'setup', label: 'Setup' },
  { value: 'off', label: 'Off' },
  { value: 'paused', label: 'Paused' },
];

const later = <T,>(value: T, ms = 600) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
const ok = (): Promise<GuidanceResult> => later({ ok: true });

const PREVIEW_ACTIONS: GuidanceActions = {
  planMeal: ok,
  turnOff: ok,
  cancelPlan: ok,
  confirmPlannedMeal: ok,
  setMealSkipped: ok,
  chooseHabit: ok,
  answerClarification: ok,
  addSupplement: ok,
  setSupplementTaken: ok,
  stopSupplement: ok,
};

function GuidancePreview() {
  const insets = useSafeAreaInsets();
  const [scenario, setScenario] = useState<GuidancePreviewScenario>('self');
  const setupScroll = useRef<ScrollView>(null);
  const data = useMemo(() => guidancePreviewResponse(scenario), [scenario]);
  const viewer = viewerFor({
    fullName: 'Kamlesh Mehta',
    isCoach: scenario === 'coach',
    relationshipType: scenario === 'self' ? 'self' : 'family_caregiver',
  });

  const post = (op: string, body: Record<string, unknown> = {}): Promise<GuidanceActionResult> =>
    op === 'propose'
      ? later(guidancePreviewProposal((body.answers ?? {}) as Record<string, unknown>) as GuidanceActionResult)
      : later({ ok: true });

  const switchRow = (tone: 'guidance' | 'tracking') =>
    isSwitchView(data.view) ? (
      <GuidanceModeSwitch
        view={data.view}
        tone={tone}
        personName={viewer.kind === 'self' ? undefined : viewer.name}
        onTurnOn={() => setScenario('setup')}
        onTurnOff={() => later({ ok: true })}
        onChanged={() => setScenario('off')}
      />
    ) : null;

  let body;
  if (data.view.kind === 'active' && data.dashboard) {
    body = (
      <GuidanceScreen
        guidance={data.dashboard}
        viewer={viewer}
        firstName="Kamlesh"
        actions={PREVIEW_ACTIONS}
        header={switchRow('guidance')}
      />
    );
  } else if (scenario === 'setup') {
    body = (
      <GuidanceSetupFrame scrollRef={setupScroll}>
        <GuidanceSetupPanel
          view={data.view}
          post={post}
          onDone={() => setScenario('self')}
          scrollToTop={() => setupScroll.current?.scrollTo({ y: 0, animated: false })}
        />
      </GuidanceSetupFrame>
    );
  } else {
    body = (
      <ScrollView style={{ flex: 1, backgroundColor: '#FFFFFF' }} contentContainerStyle={{ padding: 16, gap: 16 }}>
        {switchRow('tracking')}
        <Text style={{ color: '#60646C', fontSize: 14 }}>
          The ordinary tracking screen would follow here. This is the switch as it leads that screen.
        </Text>
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: GM.page }}>
      <View style={[styles.devBar, { paddingTop: insets.top + 6 }]}>
        <Text style={styles.devTitle}>Guidance preview · sample data · dev only</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {SCENARIOS.map((s) => {
            const on = s.value === scenario;
            return (
              <Pressable
                key={s.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`Preview: ${s.label}`}
                onPress={() => setScenario(s.value)}
                style={[styles.devChip, on && { backgroundColor: '#FDE68A' }]}
              >
                <Text style={{ color: '#1C1530', fontWeight: on ? '700' : '500', fontSize: 13 }}>{s.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <View key={scenario} style={{ flex: 1 }}>
        {body}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  devBar: { backgroundColor: '#FEF3C7', paddingHorizontal: 12, paddingBottom: 8, gap: 6 },
  devTitle: { color: '#78350F', fontSize: 12, fontWeight: '700' },
  devChip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: '#D97706', justifyContent: 'center' },
});
