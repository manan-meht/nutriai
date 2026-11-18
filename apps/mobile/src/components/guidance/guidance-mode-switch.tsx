import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { GM, GM_TAP } from '@/constants/guidance-theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { GuidanceView } from '@/lib/guidance-types';

import { BetaPill, ErrorLine } from './ui';
import { GENERIC_ERROR, type GuidanceResult } from './use-guidance';

// "Guidance mode" on and off, at the top of a person's screen. Mirrors the
// web's GuidanceModeSwitch.tsx (GuidanceModeOffBar and GuidanceModeOnSwitch).
//
// Off → on goes through the setup flow (a few health questions, screening
// and the targets to confirm): Guidance is never switched on without them,
// so the switch opens that screen rather than flipping a setting. On → off
// is Return to Tracking, which keeps every target, meal and plan, and asks
// once before doing it. A coach client has Guidance only, so there's no off
// for them: the switch shows the state and nothing more. Paused (the release
// gate closed while Guidance was on) says so, and still offers off.

type SwitchView = Extract<GuidanceView, { kind: 'setup' } | { kind: 'active' } | { kind: 'paused' }>;

export function isSwitchView(view: GuidanceView | null | undefined): view is SwitchView {
  return view?.kind === 'setup' || view?.kind === 'active' || view?.kind === 'paused';
}

function Track({ on, light }: { on: boolean; light: boolean }) {
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.track, { backgroundColor: on ? (light ? '#7C3AED' : GM.accent) : light ? '#D1D5DB' : 'rgba(255,255,255,0.2)' }]}
    >
      <View style={[styles.knob, { transform: [{ translateX: on ? 20 : 2 }] }]} />
    </View>
  );
}

export function GuidanceModeSwitch({
  view,
  personName,
  tone,
  onTurnOn,
  onTurnOff,
  onChanged,
}: {
  view: SwitchView;
  /** Undefined when the person is looking at their own profile. */
  personName?: string;
  /** "guidance" on the charcoal Guidance screen; "tracking" on the ordinary
   * screen, where it follows the system's light or dark. */
  tone: 'guidance' | 'tracking';
  onTurnOn: () => void;
  onTurnOff?: () => Promise<GuidanceResult>;
  /** After a successful turn-off, to reload the screen. */
  onChanged: () => void;
}) {
  const scheme = useColorScheme();
  const light = tone === 'tracking' && scheme !== 'dark';
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const on = view.kind !== 'setup';
  const canTurnOff = view.kind !== 'setup' && view.canReturnToTracking && !!onTurnOff;
  const forWhom = personName ? ` for ${personName}` : '';

  const description =
    view.kind === 'setup'
      ? `Daily targets, meal suggestions and weekly progress${forWhom}. Off.`
      : view.kind === 'paused'
        ? view.message
        : canTurnOff
          ? `On. Daily targets, meal suggestions and weekly progress${forWhom}.`
          : 'On. Coach clients always have Guidance.';

  function turnOff() {
    if (!onTurnOff) return;
    setError(null);
    setPending(true);
    onTurnOff()
      .then((r) => {
        if (!r.ok) {
          setError(r.message || GENERIC_ERROR);
          return;
        }
        onChanged();
      })
      .catch(() => setError(GENERIC_ERROR))
      .finally(() => setPending(false));
  }

  function onPress() {
    if (view.kind === 'setup') return onTurnOn();
    if (!canTurnOff || pending) return;
    if (view.kind === 'paused') {
      Alert.alert('Return to Tracking?', 'You can switch fully back to Tracking. Meals and history are kept.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Return to Tracking', style: 'destructive', onPress: turnOff },
      ]);
      return;
    }
    Alert.alert(
      'Turn off Guidance mode?',
      'The dashboard goes back to tracking. Targets, meals, plans and habits are kept, and Guidance can be switched back on any time.',
      [
        { text: 'Keep it on', style: 'cancel' },
        { text: 'Turn off', style: 'destructive', onPress: turnOff },
      ]
    );
  }

  const label =
    view.kind === 'setup'
      ? `Turn on Guidance mode${forWhom}`
      : canTurnOff
        ? `Guidance mode is on${forWhom}. Turn it off`
        : `Guidance mode is on${forWhom}`;

  const palette = light
    ? { bg: '#F5F3FF', border: '#DDD6FE', title: '#111827', body: '#4B5563', error: '#B91C1C' }
    : tone === 'tracking'
      ? { bg: 'rgba(167,139,250,0.10)', border: 'rgba(167,139,250,0.25)', title: '#FFFFFF', body: '#D1D5DB', error: GM.errorText }
      : { bg: GM.card, border: GM.border, title: GM.text, body: GM.textSecondary, error: GM.errorText };

  return (
    <View>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityHint={view.kind === 'setup' ? 'Opens the setup: a few health questions, then the targets to confirm' : undefined}
        accessibilityState={{ checked: on, disabled: on && !canTurnOff, busy: pending }}
        disabled={pending || (on && !canTurnOff)}
        onPress={onPress}
        style={({ pressed }) => [styles.row, { backgroundColor: palette.bg, borderColor: palette.border }, pressed && { opacity: 0.85 }]}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: palette.title }]}>Guidance mode</Text>
            <BetaPill dark={!light} />
          </View>
          <Text style={[styles.body, { color: palette.body }]}>{pending ? 'Turning off…' : description}</Text>
        </View>
        <Track on={on} light={light} />
      </Pressable>
      <ErrorLine error={error} color={palette.error} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: GM_TAP + 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, fontWeight: '700' },
  body: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  track: { width: 46, height: 28, borderRadius: 14, justifyContent: 'center' },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF' },
});
